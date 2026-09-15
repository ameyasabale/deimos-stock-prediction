"""
Options Flow Analysis Module for AmeyaFX/Deimos

Scrapes NSE options chain data and computes:
  - Put/Call Ratio (PCR)
  - Max Pain strike
  - Open Interest concentration (key support/resistance)
  - Change in OI analysis
  - IV percentile (approximation)

Returns options_alpha ∈ [-10%, +10%] annualized.

Data source: NSE India options chain (public JSON, no API key needed).
"""
import time
import re
import json
import numpy as np
import requests
from datetime import datetime, timedelta

# ── Cache (30-min TTL) ──────────────────────────────
_OPTIONS_CACHE = {}        # symbol -> result dict
_OPTIONS_CACHE_TIME = {}   # symbol -> datetime
OPTIONS_CACHE_TTL = 1800   # 30 minutes

# NSE session with proper headers
_nse_session = requests.Session()
_nse_session.headers.update({
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Referer': 'https://www.nseindia.com/option-chain',
    'X-Requested-With': 'XMLHttpRequest',
    'Connection': 'keep-alive',
})
_nse_cookies_set = False


def _safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))


def _init_nse_session():
    """Visit NSE homepage to get session cookies before API calls."""
    global _nse_cookies_set
    if _nse_cookies_set:
        return
    try:
        _nse_session.get('https://www.nseindia.com', timeout=10)
        _nse_cookies_set = True
    except Exception:
        pass


def _fetch_nse_option_chain(symbol):
    """
    Fetch options chain from NSE India.
    Returns raw JSON data or None on failure.
    """
    _init_nse_session()

    url = f'https://www.nseindia.com/api/option-chain-equities?symbol={symbol}'
    try:
        resp = _nse_session.get(url, timeout=15)
        if resp.status_code == 401:
            # Session expired — refresh cookies
            global _nse_cookies_set
            _nse_cookies_set = False
            _init_nse_session()
            resp = _nse_session.get(url, timeout=15)

        if resp.status_code != 200:
            _safe_print(f"   NSE options: HTTP {resp.status_code} for {symbol}")
            return None

        return resp.json()
    except requests.exceptions.Timeout:
        _safe_print(f"   NSE options timeout for {symbol}")
        return None
    except Exception as e:
        _safe_print(f"   NSE options error for {symbol}: {e}")
        return None


def _parse_option_chain(raw_data, symbol):
    """
    Parse the NSE option chain JSON and compute key metrics.
    """
    if not raw_data:
        return None

    records = raw_data.get('records', {})
    data_rows = records.get('data', [])
    underlying_value = records.get('underlyingValue', 0)
    expiry_dates = records.get('expiryDates', [])
    stk_price = records.get('strikePrices', [])

    if not data_rows or not underlying_value:
        return None

    # Use nearest expiry
    nearest_expiry = expiry_dates[0] if expiry_dates else None

    # Filter to nearest expiry
    nearest_rows = [
        r for r in data_rows
        if r.get('expiryDate') == nearest_expiry
    ]

    if not nearest_rows:
        nearest_rows = data_rows[:40]  # Fallback to first 40 rows

    # Extract CE (Call) and PE (Put) data
    total_call_oi = 0
    total_put_oi = 0
    total_call_volume = 0
    total_put_volume = 0
    total_call_oi_change = 0
    total_put_oi_change = 0

    strike_data = []

    for row in nearest_rows:
        strike = row.get('strikePrice', 0)
        ce = row.get('CE', {})
        pe = row.get('PE', {})

        ce_oi = ce.get('openInterest', 0) or 0
        pe_oi = pe.get('openInterest', 0) or 0
        ce_vol = ce.get('totalTradedVolume', 0) or 0
        pe_vol = pe.get('totalTradedVolume', 0) or 0
        ce_oi_change = ce.get('changeinOpenInterest', 0) or 0
        pe_oi_change = pe.get('changeinOpenInterest', 0) or 0
        ce_iv = ce.get('impliedVolatility', 0) or 0
        pe_iv = pe.get('impliedVolatility', 0) or 0

        total_call_oi += ce_oi
        total_put_oi += pe_oi
        total_call_volume += ce_vol
        total_put_volume += pe_vol
        total_call_oi_change += ce_oi_change
        total_put_oi_change += pe_oi_change

        strike_data.append({
            'strike': strike,
            'ce_oi': ce_oi,
            'pe_oi': pe_oi,
            'ce_volume': ce_vol,
            'pe_volume': pe_vol,
            'ce_oi_change': ce_oi_change,
            'pe_oi_change': pe_oi_change,
            'ce_iv': ce_iv,
            'pe_iv': pe_iv,
            'ce_ltp': ce.get('lastPrice', 0) or 0,
            'pe_ltp': pe.get('lastPrice', 0) or 0,
        })

    if not strike_data:
        return None

    # ── PUT/CALL RATIO (PCR) ────────────────────────
    pcr_oi = round(total_put_oi / max(total_call_oi, 1), 4)
    pcr_volume = round(total_put_volume / max(total_call_volume, 1), 4)

    # ── MAX PAIN ────────────────────────────────────
    # Max pain = strike where total option losses are maximized
    # For each strike, calculate total loss if stock settles there
    max_pain_strike = _calculate_max_pain(strike_data, underlying_value)

    # ── KEY SUPPORT / RESISTANCE from OI ────────────
    # Highest PUT OI = strong support
    # Highest CALL OI = strong resistance
    sorted_by_pe_oi = sorted(strike_data, key=lambda x: x['pe_oi'], reverse=True)
    sorted_by_ce_oi = sorted(strike_data, key=lambda x: x['ce_oi'], reverse=True)

    support_strikes = [s['strike'] for s in sorted_by_pe_oi[:3] if s['pe_oi'] > 0]
    resistance_strikes = [s['strike'] for s in sorted_by_ce_oi[:3] if s['ce_oi'] > 0]

    # ── OI CHANGE ANALYSIS ──────────────────────────
    # Rising price + rising OI = bullish (new longs)
    # Rising price + falling OI = bearish (short covering)
    # Falling price + rising OI = bearish (new shorts)
    net_oi_change = total_put_oi_change - total_call_oi_change

    # ── IV ANALYSIS ─────────────────────────────────
    # Average IV across ATM strikes
    atm_strikes = [s for s in strike_data
                   if abs(s['strike'] - underlying_value) < underlying_value * 0.05]
    avg_iv = 0
    if atm_strikes:
        ivs = [s['ce_iv'] for s in atm_strikes if s['ce_iv'] > 0] + \
              [s['pe_iv'] for s in atm_strikes if s['pe_iv'] > 0]
        avg_iv = round(sum(ivs) / len(ivs), 2) if ivs else 0

    return {
        'symbol': symbol,
        'underlying': round(underlying_value, 2),
        'nearest_expiry': nearest_expiry,
        'pcr_oi': pcr_oi,
        'pcr_volume': pcr_volume,
        'total_call_oi': total_call_oi,
        'total_put_oi': total_put_oi,
        'total_call_volume': total_call_volume,
        'total_put_volume': total_put_volume,
        'call_oi_change': total_call_oi_change,
        'put_oi_change': total_put_oi_change,
        'net_oi_change': net_oi_change,
        'max_pain': max_pain_strike,
        'support_levels': support_strikes,
        'resistance_levels': resistance_strikes,
        'avg_iv': avg_iv,
        'atm_strike_count': len(atm_strikes),
        'total_strikes': len(strike_data),
    }


def _calculate_max_pain(strike_data, spot):
    """
    Calculate max pain — the strike at which total option buyer losses
    are maximized (equivalently, option writers' profit is maximized).
    """
    if not strike_data:
        return spot

    min_loss = float('inf')
    max_pain_strike = strike_data[0]['strike']

    for target in strike_data:
        s = target['strike']
        total_loss = 0

        for row in strike_data:
            # Call buyers lose if stock < strike
            if s < row['strike']:
                # Calls expire worthless — no loss for writers
                pass
            else:
                # Calls are ITM — writers pay (s - strike) * OI
                total_loss += (s - row['strike']) * row['ce_oi']

            # Put buyers lose if stock > strike
            if s > row['strike']:
                # Puts expire worthless — no loss for writers
                pass
            else:
                # Puts are ITM — writers pay (strike - s) * OI
                total_loss += (row['strike'] - s) * row['pe_oi']

        if total_loss < min_loss:
            min_loss = total_loss
            max_pain_strike = s

    return max_pain_strike


def get_options_flow(symbol):
    """
    Main entry point: Fetch and analyze options chain for a stock.
    
    Returns dict with:
      - pcr_oi, pcr_volume: Put/Call Ratios
      - max_pain: Max pain strike price
      - support_levels, resistance_levels: From OI concentration
      - options_alpha: Directional signal ∈ [-10%, +10%]
      - options_label: 'Bullish' / 'Bearish' / 'Neutral'
    """
    symbol = symbol.upper().strip()

    # Check cache
    if symbol in _OPTIONS_CACHE and symbol in _OPTIONS_CACHE_TIME:
        age = (datetime.now() - _OPTIONS_CACHE_TIME[symbol]).total_seconds()
        if age < OPTIONS_CACHE_TTL:
            cached = _OPTIONS_CACHE[symbol].copy()
            cached['cached'] = True
            cached['cache_age_seconds'] = int(age)
            return cached

    _safe_print(f"   Fetching options chain for {symbol}...")
    t0 = time.time()

    raw = _fetch_nse_option_chain(symbol)
    parsed = _parse_option_chain(raw, symbol) if raw else None

    if not parsed:
        result = {
            'symbol': symbol,
            'available': False,
            'options_alpha': 0.0,
            'options_label': 'Neutral',
            'error': 'Options data not available (stock may not have F&O)',
            'cached': False,
            'timestamp': datetime.now().isoformat(),
            'elapsed_ms': int((time.time() - t0) * 1000),
        }
        _OPTIONS_CACHE[symbol] = result
        _OPTIONS_CACHE_TIME[symbol] = datetime.now()
        return result

    # ── Compute options_alpha ───────────────────────
    alpha = 0.0
    signals = []

    pcr = parsed['pcr_oi']
    spot = parsed['underlying']
    max_pain = parsed['max_pain']

    # PCR Signal
    if pcr > 1.5:
        alpha += 0.04
        signals.append(f'High PCR ({pcr:.2f}) — strong put writing = bullish')
    elif pcr > 1.2:
        alpha += 0.02
        signals.append(f'Elevated PCR ({pcr:.2f}) — moderately bullish')
    elif pcr < 0.5:
        alpha -= 0.04
        signals.append(f'Low PCR ({pcr:.2f}) — heavy call buying = speculative/bearish')
    elif pcr < 0.7:
        alpha -= 0.02
        signals.append(f'Below-normal PCR ({pcr:.2f}) — slightly bearish')
    else:
        signals.append(f'Normal PCR ({pcr:.2f})')

    # Max Pain Signal
    if spot and max_pain:
        pain_diff_pct = ((max_pain - spot) / spot) * 100
        if pain_diff_pct > 3:
            alpha += 0.02
            signals.append(f'Max Pain above spot by {pain_diff_pct:.1f}% — upward pull')
        elif pain_diff_pct < -3:
            alpha -= 0.02
            signals.append(f'Max Pain below spot by {abs(pain_diff_pct):.1f}% — downward pull')
        else:
            signals.append(f'Max Pain near spot ({pain_diff_pct:+.1f}%)')

    # OI Change Signal
    net_oi = parsed['net_oi_change']
    if net_oi > 0:
        # More put OI added than call OI = bullish
        alpha += 0.015
        signals.append('Net Put OI increase — bullish hedging')
    elif net_oi < 0:
        alpha -= 0.015
        signals.append('Net Call OI increase — bearish/speculative')

    # IV Signal
    iv = parsed['avg_iv']
    if iv > 40:
        alpha -= 0.01
        signals.append(f'High IV ({iv:.0f}%) — expensive options, potential mean reversion')
    elif iv < 15 and iv > 0:
        alpha += 0.01
        signals.append(f'Low IV ({iv:.0f}%) — cheap options, potential breakout')

    # Clamp alpha
    options_alpha = float(np.clip(alpha, -0.10, 0.10))

    if options_alpha > 0.02:
        label = 'Bullish'
    elif options_alpha < -0.02:
        label = 'Bearish'
    else:
        label = 'Neutral'

    result = {
        'symbol': symbol,
        'available': True,
        **parsed,
        'options_alpha': round(options_alpha, 4),
        'options_label': label,
        'signals': signals,
        'cached': False,
        'timestamp': datetime.now().isoformat(),
        'elapsed_ms': int((time.time() - t0) * 1000),
    }

    # Cache
    _OPTIONS_CACHE[symbol] = result
    _OPTIONS_CACHE_TIME[symbol] = datetime.now()

    return result


def get_options_status():
    """Return module status."""
    return {
        'method': 'nse_option_chain_api',
        'requires_credentials': False,
        'cached_symbols': list(_OPTIONS_CACHE.keys()),
        'cache_ttl_seconds': OPTIONS_CACHE_TTL,
        'note': 'Only available for F&O stocks on NSE',
    }
