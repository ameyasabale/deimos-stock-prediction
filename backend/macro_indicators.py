"""
Macro Indicators Module for AmeyaFX/Deimos

Fetches key Indian macro indicators to generate a macro_alpha signal
that adjusts the ML model's momentum drift.

Data sources (all free, no API keys):
  - India VIX          → Yahoo Finance (^INDIAVIX)
  - INR/USD            → Yahoo Finance (USDINR=X)
  - Nifty 50 level     → Yahoo Finance (^NSEI)
  - Nifty Bank         → Yahoo Finance (^NSEBANK)
  - 10Y US Treasury    → Yahoo Finance (^TNX) — proxy for global risk
  - Crude Oil          → Yahoo Finance (CL=F)
  - Gold               → Yahoo Finance (GC=F)
  - RBI Repo Rate      → Static config (updated manually)
  - CPI / Inflation    → Static config (updated monthly)
  - GDP Growth         → Static config (updated quarterly)

Returns macro_alpha ∈ [-15%, +15%] annualized.
"""
import time
import numpy as np
from datetime import datetime, timedelta

try:
    import yfinance as yf
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False

# ── Cache (1-hour TTL) ───────────────────────────────
_MACRO_CACHE = {}
_MACRO_CACHE_TIME = None
MACRO_CACHE_TTL = 3600  # 1 hour

# ── Static macro data (update periodically) ──────────
# These are manually maintained — update quarterly/monthly
STATIC_MACRO = {
    'rbi_repo_rate': 6.50,           # RBI repo rate (%)
    'rbi_repo_rate_prev': 6.50,      # Previous meeting rate
    'rbi_stance': 'accommodative',   # accommodative / neutral / hawkish
    'cpi_inflation': 4.75,           # Latest CPI YoY (%)
    'cpi_prev': 4.87,               # Previous month CPI
    'gdp_growth': 6.7,              # Latest GDP growth (%)
    'gdp_prev': 7.8,                # Previous quarter GDP
    'iip_growth': 5.2,              # Industrial production growth (%)
    'fiscal_deficit_gdp': 5.6,      # Fiscal deficit as % of GDP
    'current_account_gdp': -1.2,    # Current account deficit as % of GDP
    'updated_at': '2026-08-01',     # Last update date
}

# ── Sector sensitivity to macro factors ──────────────
RATE_SENSITIVE_SECTORS = [
    'Financial Services', 'Banks', 'NBFC', 'Housing Finance',
    'Real Estate', 'Auto', 'Consumer Durables',
]
EXPORT_SECTORS = [
    'IT', 'Information Technology', 'Pharma', 'Chemicals',
    'Textiles', 'Software',
]
IMPORT_SECTORS = [
    'Oil & Gas', 'Airlines', 'Paints', 'Tyres', 'Electronics',
]
COMMODITY_SECTORS = [
    'Metals', 'Mining', 'Steel', 'Aluminium', 'Copper',
    'Oil & Gas', 'Energy',
]


def _safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))


def _fetch_yahoo_quote(ticker_symbol):
    """Fetch latest price and key stats from yfinance."""
    if not YF_AVAILABLE:
        return None
    try:
        t = yf.Ticker(ticker_symbol)
        hist = t.history(period='5d')
        if hist is None or hist.empty:
            return None
        latest = float(hist['Close'].iloc[-1])
        prev = float(hist['Close'].iloc[-2]) if len(hist) > 1 else latest
        change_pct = ((latest - prev) / prev * 100) if prev > 0 else 0

        # 20-day avg for context
        hist_20 = t.history(period='1mo')
        avg_20 = float(hist_20['Close'].mean()) if hist_20 is not None and not hist_20.empty else latest

        return {
            'value': round(latest, 2),
            'prev': round(prev, 2),
            'change_pct': round(change_pct, 2),
            'avg_20d': round(avg_20, 2),
        }
    except Exception as e:
        _safe_print(f"   Macro fetch error ({ticker_symbol}): {e}")
        return None


def fetch_macro_data():
    """
    Fetch all macro indicators. Returns a structured dict.
    Uses cache with 1-hour TTL.
    """
    global _MACRO_CACHE, _MACRO_CACHE_TIME

    # Check cache
    if _MACRO_CACHE and _MACRO_CACHE_TIME:
        age = (datetime.now() - _MACRO_CACHE_TIME).total_seconds()
        if age < MACRO_CACHE_TTL:
            cached = _MACRO_CACHE.copy()
            cached['cached'] = True
            cached['cache_age_seconds'] = int(age)
            return cached

    _safe_print("   Fetching macro indicators...")
    t0 = time.time()
    result = {'static': STATIC_MACRO.copy()}

    # ── Market indicators from Yahoo Finance ────────
    indicators = {
        'india_vix': '^INDIAVIX',
        'nifty50': '^NSEI',
        'nifty_bank': '^NSEBANK',
        'usdinr': 'USDINR=X',
        'us_10y': '^TNX',
        'crude_oil': 'CL=F',
        'gold': 'GC=F',
    }

    for key, ticker in indicators.items():
        data = _fetch_yahoo_quote(ticker)
        result[key] = data if data else {'value': None, 'change_pct': 0, 'error': True}

    # ── Derived signals ─────────────────────────────
    signals = {}

    # VIX Signal
    vix = result.get('india_vix', {})
    vix_val = vix.get('value')
    if vix_val is not None:
        if vix_val < 13:
            signals['vix'] = {'score': 0.6, 'label': 'Very Low VIX — complacency risk', 'level': 'low'}
        elif vix_val < 16:
            signals['vix'] = {'score': 0.3, 'label': 'Low VIX — calm markets', 'level': 'low'}
        elif vix_val < 20:
            signals['vix'] = {'score': 0.0, 'label': 'Normal VIX', 'level': 'normal'}
        elif vix_val < 25:
            signals['vix'] = {'score': -0.3, 'label': 'Elevated VIX — caution', 'level': 'elevated'}
        else:
            signals['vix'] = {'score': -0.6, 'label': 'High VIX — fear regime', 'level': 'high'}
    else:
        signals['vix'] = {'score': 0.0, 'label': 'VIX unavailable', 'level': 'unknown'}

    # INR/USD Signal
    usdinr = result.get('usdinr', {})
    inr_change = usdinr.get('change_pct', 0)
    if inr_change > 0.5:
        signals['currency'] = {'score': -0.3, 'label': f'INR weakening ({inr_change:+.2f}%)', 'direction': 'weak'}
    elif inr_change < -0.5:
        signals['currency'] = {'score': 0.3, 'label': f'INR strengthening ({inr_change:+.2f}%)', 'direction': 'strong'}
    else:
        signals['currency'] = {'score': 0.0, 'label': 'INR stable', 'direction': 'stable'}

    # Crude Oil Signal
    crude = result.get('crude_oil', {})
    crude_change = crude.get('change_pct', 0)
    if crude_change > 3:
        signals['crude'] = {'score': -0.3, 'label': f'Crude surging ({crude_change:+.1f}%)', 'direction': 'up'}
    elif crude_change < -3:
        signals['crude'] = {'score': 0.3, 'label': f'Crude falling ({crude_change:+.1f}%)', 'direction': 'down'}
    else:
        signals['crude'] = {'score': 0.0, 'label': 'Crude stable', 'direction': 'stable'}

    # Nifty momentum
    nifty = result.get('nifty50', {})
    nifty_val = nifty.get('value')
    nifty_avg = nifty.get('avg_20d')
    if nifty_val and nifty_avg:
        nifty_vs_20d = ((nifty_val - nifty_avg) / nifty_avg) * 100
        if nifty_vs_20d > 3:
            signals['market_trend'] = {'score': 0.4, 'label': f'Nifty above 20DMA (+{nifty_vs_20d:.1f}%)', 'trend': 'bullish'}
        elif nifty_vs_20d < -3:
            signals['market_trend'] = {'score': -0.4, 'label': f'Nifty below 20DMA ({nifty_vs_20d:.1f}%)', 'trend': 'bearish'}
        else:
            signals['market_trend'] = {'score': 0.0, 'label': 'Nifty near 20DMA', 'trend': 'neutral'}
    else:
        signals['market_trend'] = {'score': 0.0, 'label': 'Nifty data unavailable', 'trend': 'unknown'}

    # US 10Y yield — global risk appetite
    us10y = result.get('us_10y', {})
    us10y_val = us10y.get('value')
    if us10y_val is not None:
        if us10y_val > 5.0:
            signals['global_risk'] = {'score': -0.3, 'label': f'US 10Y high ({us10y_val:.2f}%) — FPI outflow risk'}
        elif us10y_val < 3.5:
            signals['global_risk'] = {'score': 0.2, 'label': f'US 10Y low ({us10y_val:.2f}%) — risk-on for EMs'}
        else:
            signals['global_risk'] = {'score': 0.0, 'label': f'US 10Y normal ({us10y_val:.2f}%)'}
    else:
        signals['global_risk'] = {'score': 0.0, 'label': 'US yield unavailable'}

    # RBI monetary policy signal
    repo = STATIC_MACRO['rbi_repo_rate']
    repo_prev = STATIC_MACRO['rbi_repo_rate_prev']
    stance = STATIC_MACRO['rbi_stance']
    if repo < repo_prev:
        signals['monetary'] = {'score': 0.4, 'label': f'RBI cut to {repo}% — dovish'}
    elif repo > repo_prev:
        signals['monetary'] = {'score': -0.3, 'label': f'RBI hiked to {repo}% — hawkish'}
    else:
        stance_score = 0.2 if stance == 'accommodative' else -0.1 if stance == 'hawkish' else 0.0
        signals['monetary'] = {'score': stance_score, 'label': f'RBI at {repo}% — {stance}'}

    # Inflation
    cpi = STATIC_MACRO['cpi_inflation']
    if cpi > 6:
        signals['inflation'] = {'score': -0.3, 'label': f'CPI {cpi}% — above RBI target band'}
    elif cpi < 4:
        signals['inflation'] = {'score': 0.2, 'label': f'CPI {cpi}% — benign inflation'}
    else:
        signals['inflation'] = {'score': 0.0, 'label': f'CPI {cpi}% — within target'}

    result['signals'] = signals

    # ── Compute macro_alpha ─────────────────────────
    weights = {
        'vix': 0.20,
        'market_trend': 0.20,
        'currency': 0.15,
        'crude': 0.10,
        'global_risk': 0.10,
        'monetary': 0.15,
        'inflation': 0.10,
    }

    macro_alpha = 0.0
    for key, weight in weights.items():
        sig = signals.get(key, {})
        macro_alpha += sig.get('score', 0) * weight

    # Scale to annualized return adjustment (cap at ±15%)
    macro_alpha = float(np.clip(macro_alpha * 0.25, -0.15, 0.15))

    result['macro_alpha'] = round(macro_alpha, 4)
    result['macro_label'] = (
        'Bullish' if macro_alpha > 0.03 else
        'Bearish' if macro_alpha < -0.03 else
        'Neutral'
    )
    result['elapsed_ms'] = int((time.time() - t0) * 1000)
    result['cached'] = False
    result['timestamp'] = datetime.now().isoformat()

    # Cache
    _MACRO_CACHE = result
    _MACRO_CACHE_TIME = datetime.now()

    return result


def get_sector_macro_adjustment(sector, macro_data=None):
    """
    Get sector-specific macro adjustment.
    For example, rate-sensitive sectors are hurt by rate hikes,
    export sectors benefit from INR weakness.

    Returns: adjustment alpha ∈ [-5%, +5%]
    """
    if macro_data is None:
        macro_data = fetch_macro_data()

    signals = macro_data.get('signals', {})
    adj = 0.0

    if not sector:
        return 0.0

    sector_lower = sector.lower()

    # Rate-sensitive sectors
    is_rate_sensitive = any(s.lower() in sector_lower for s in RATE_SENSITIVE_SECTORS)
    if is_rate_sensitive:
        monetary = signals.get('monetary', {}).get('score', 0)
        adj += monetary * 0.05  # Rate cut helps, hike hurts

    # Export sectors benefit from weak INR
    is_export = any(s.lower() in sector_lower for s in EXPORT_SECTORS)
    if is_export:
        currency = signals.get('currency', {}).get('score', 0)
        adj -= currency * 0.03  # Weak INR (negative currency score) helps exports

    # Import sectors hurt by weak INR
    is_import = any(s.lower() in sector_lower for s in IMPORT_SECTORS)
    if is_import:
        currency = signals.get('currency', {}).get('score', 0)
        adj += currency * 0.03  # Weak INR hurts importers

    # Commodity sectors
    is_commodity = any(s.lower() in sector_lower for s in COMMODITY_SECTORS)
    if is_commodity:
        crude = signals.get('crude', {}).get('score', 0)
        adj += crude * 0.02

    return float(np.clip(adj, -0.05, 0.05))


def get_macro_status():
    """Return module status."""
    return {
        'yfinance_available': YF_AVAILABLE,
        'cached': _MACRO_CACHE_TIME is not None,
        'static_macro': STATIC_MACRO,
        'indicators_tracked': [
            'India VIX', 'Nifty 50', 'Nifty Bank', 'USD/INR',
            'US 10Y Treasury', 'Crude Oil', 'Gold',
            'RBI Repo Rate', 'CPI Inflation', 'GDP Growth',
        ],
    }
