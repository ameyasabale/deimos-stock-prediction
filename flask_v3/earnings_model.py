"""
Earnings Surprise Model for AmeyaFX/Deimos

Uses yfinance earnings data to compute:
  - Days to next earnings
  - Historical earnings surprise patterns
  - Earnings growth trajectory
  - Pre-earnings drift signal
  - Post-earnings reaction average
  - Earnings volatility multiplier

Returns:
  - earnings_alpha ∈ [-8%, +8%] annualized directional adjustment
  - earnings_vol_mult: volatility multiplier (1.0x – 2.0x near earnings)
"""
import time
import numpy as np
from datetime import datetime, timedelta

try:
    import yfinance as yf
    import pandas as pd
    YF_AVAILABLE = True
except ImportError:
    YF_AVAILABLE = False
    yf = None
    pd = None

# ── Cache (4-hour TTL) ──────────────────────────────
_EARNINGS_CACHE = {}       # symbol -> result dict
_EARNINGS_CACHE_TIME = {}  # symbol -> datetime
EARNINGS_CACHE_TTL = 14400  # 4 hours


def _safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))


def get_earnings_intelligence(symbol):
    """
    Main entry point: Analyze earnings data for a stock.
    
    Returns dict with:
      - earnings_alpha: directional adjustment ∈ [-8%, +8%]
      - earnings_vol_mult: volatility multiplier near earnings
      - next_earnings_date: upcoming earnings date
      - days_to_earnings: days until next earnings
      - earnings_growth_trend: 'accelerating' / 'decelerating' / 'stable'
      - surprise_history: list of recent quarterly surprises
    """
    symbol = symbol.upper().strip()

    # Check cache
    if symbol in _EARNINGS_CACHE and symbol in _EARNINGS_CACHE_TIME:
        age = (datetime.now() - _EARNINGS_CACHE_TIME[symbol]).total_seconds()
        if age < EARNINGS_CACHE_TTL:
            cached = _EARNINGS_CACHE[symbol].copy()
            cached['cached'] = True
            cached['cache_age_seconds'] = int(age)
            return cached

    if not YF_AVAILABLE:
        return _empty_result(symbol, 'yfinance not available')

    _safe_print(f"   Fetching earnings data for {symbol}...")
    t0 = time.time()

    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        result = _analyze_earnings(symbol, ticker)
        result['elapsed_ms'] = int((time.time() - t0) * 1000)

        # Cache
        _EARNINGS_CACHE[symbol] = result
        _EARNINGS_CACHE_TIME[symbol] = datetime.now()

        return result

    except Exception as e:
        _safe_print(f"   Earnings error for {symbol}: {e}")
        return _empty_result(symbol, str(e))


def _analyze_earnings(symbol, ticker):
    """Core earnings analysis logic."""
    result = {
        'symbol': symbol,
        'available': False,
        'earnings_alpha': 0.0,
        'earnings_vol_mult': 1.0,
        'next_earnings_date': None,
        'days_to_earnings': None,
        'earnings_growth_trend': 'unknown',
        'surprise_history': [],
        'signals': [],
        'cached': False,
        'timestamp': datetime.now().isoformat(),
    }

    # ── Get earnings dates ──────────────────────────
    try:
        calendar = ticker.calendar
        if calendar is not None:
            # calendar can be a dict or DataFrame depending on yfinance version
            if isinstance(calendar, dict):
                earnings_date = calendar.get('Earnings Date')
                if isinstance(earnings_date, list) and earnings_date:
                    earnings_date = earnings_date[0]
                elif isinstance(earnings_date, (pd.Timestamp, datetime)):
                    pass
                else:
                    earnings_date = None
            elif hasattr(calendar, 'iloc'):
                try:
                    earnings_date = calendar.iloc[0, 0]
                except Exception:
                    earnings_date = None
            else:
                earnings_date = None

            if earnings_date is not None:
                if isinstance(earnings_date, pd.Timestamp):
                    earnings_date = earnings_date.to_pydatetime()
                elif isinstance(earnings_date, str):
                    earnings_date = datetime.fromisoformat(str(earnings_date).replace('Z', ''))

                result['next_earnings_date'] = str(earnings_date.date()) if earnings_date else None
                if earnings_date:
                    now = datetime.now()
                    if hasattr(earnings_date, 'tzinfo') and earnings_date.tzinfo:
                        from datetime import timezone
                        now = datetime.now(timezone.utc)
                    days_to = (earnings_date - now).days
                    result['days_to_earnings'] = max(0, days_to)
    except Exception as e:
        _safe_print(f"   Earnings calendar error: {e}")

    # ── Get earnings history (quarterly results) ────
    earnings_history = []
    try:
        # Try quarterly earnings
        qe = ticker.quarterly_earnings
        if qe is not None and not qe.empty:
            for idx, row in qe.iterrows():
                actual = row.get('Earnings', row.get('Actual', None))
                estimate = row.get('Estimate', None)
                revenue = row.get('Revenue', None)

                surprise_pct = None
                if actual is not None and estimate is not None and estimate != 0:
                    surprise_pct = ((actual - estimate) / abs(estimate)) * 100

                earnings_history.append({
                    'quarter': str(idx),
                    'actual': float(actual) if actual is not None else None,
                    'estimate': float(estimate) if estimate is not None else None,
                    'surprise_pct': round(surprise_pct, 2) if surprise_pct is not None else None,
                    'revenue': float(revenue) if revenue is not None else None,
                })
    except Exception as e:
        _safe_print(f"   Quarterly earnings error: {e}")

    # Try earnings_dates as fallback for surprise data
    if not earnings_history:
        try:
            ed = ticker.earnings_dates
            if ed is not None and not ed.empty:
                for idx, row in ed.head(8).iterrows():
                    actual = row.get('Reported EPS', None)
                    estimate = row.get('EPS Estimate', None)
                    surprise = row.get('Surprise(%)', None)

                    earnings_history.append({
                        'quarter': str(idx.date()) if hasattr(idx, 'date') else str(idx),
                        'actual': float(actual) if actual is not None and not np.isnan(actual) else None,
                        'estimate': float(estimate) if estimate is not None and not np.isnan(estimate) else None,
                        'surprise_pct': round(float(surprise), 2) if surprise is not None and not np.isnan(surprise) else None,
                        'revenue': None,
                    })
        except Exception:
            pass

    result['surprise_history'] = earnings_history[:8]  # Last 8 quarters
    result['available'] = len(earnings_history) > 0 or result['next_earnings_date'] is not None

    if not result['available']:
        return result

    # ── Compute earnings signals ────────────────────
    alpha = 0.0
    signals = []

    # 1. Surprise pattern
    surprises = [e['surprise_pct'] for e in earnings_history if e.get('surprise_pct') is not None]
    if surprises:
        avg_surprise = np.mean(surprises)
        recent_surprises = surprises[:3]  # Most recent 3
        recent_avg = np.mean(recent_surprises) if recent_surprises else 0

        if avg_surprise > 5:
            alpha += 0.03
            signals.append(f'Consistent earnings beats (avg surprise: {avg_surprise:+.1f}%)')
        elif avg_surprise > 0:
            alpha += 0.01
            signals.append(f'Slight positive surprise trend ({avg_surprise:+.1f}%)')
        elif avg_surprise < -5:
            alpha -= 0.03
            signals.append(f'Consistent earnings misses (avg: {avg_surprise:+.1f}%)')
        elif avg_surprise < 0:
            alpha -= 0.01
            signals.append(f'Slight negative surprise trend ({avg_surprise:+.1f}%)')

        # Trend: are surprises getting better or worse?
        if len(surprises) >= 4:
            first_half_avg = np.mean(surprises[len(surprises)//2:])
            second_half_avg = np.mean(surprises[:len(surprises)//2])
            if second_half_avg > first_half_avg + 2:
                result['earnings_growth_trend'] = 'accelerating'
                alpha += 0.015
                signals.append('Earnings surprises accelerating')
            elif second_half_avg < first_half_avg - 2:
                result['earnings_growth_trend'] = 'decelerating'
                alpha -= 0.015
                signals.append('Earnings surprises decelerating')
            else:
                result['earnings_growth_trend'] = 'stable'
        else:
            result['earnings_growth_trend'] = 'insufficient_data'

        # Beat/miss streak
        beat_count = sum(1 for s in recent_surprises if s > 0)
        miss_count = sum(1 for s in recent_surprises if s < 0)
        if beat_count == len(recent_surprises) and len(recent_surprises) >= 3:
            alpha += 0.02
            signals.append(f'{beat_count}-quarter beat streak')
        elif miss_count == len(recent_surprises) and len(recent_surprises) >= 3:
            alpha -= 0.02
            signals.append(f'{miss_count}-quarter miss streak')

    # 2. Earnings growth (EPS trajectory)
    actuals = [e['actual'] for e in earnings_history if e.get('actual') is not None]
    if len(actuals) >= 4:
        recent_eps = actuals[0]
        year_ago_eps = actuals[min(3, len(actuals)-1)]
        if year_ago_eps and year_ago_eps != 0:
            yoy_growth = ((recent_eps - year_ago_eps) / abs(year_ago_eps)) * 100
            if yoy_growth > 20:
                alpha += 0.02
                signals.append(f'Strong EPS growth ({yoy_growth:+.0f}% YoY)')
            elif yoy_growth > 0:
                alpha += 0.01
                signals.append(f'Positive EPS growth ({yoy_growth:+.0f}% YoY)')
            elif yoy_growth < -20:
                alpha -= 0.02
                signals.append(f'EPS decline ({yoy_growth:+.0f}% YoY)')
            elif yoy_growth < 0:
                alpha -= 0.01
                signals.append(f'Negative EPS growth ({yoy_growth:+.0f}% YoY)')

    # 3. Pre-earnings drift
    days_to = result.get('days_to_earnings')
    if days_to is not None:
        if 0 <= days_to <= 10:
            # Pre-earnings period — stocks with positive surprise history tend to drift up
            if surprises and np.mean(surprises[:3]) > 0:
                alpha += 0.015
                signals.append(f'Pre-earnings drift: {days_to}d to earnings (positive surprise history)')
            else:
                signals.append(f'{days_to}d to earnings — increased uncertainty')
        elif days_to == 0:
            signals.append('Earnings TODAY — extreme volatility expected')

    # 4. Earnings volatility multiplier
    vol_mult = 1.0
    if days_to is not None:
        if days_to <= 3:
            vol_mult = 2.0
            signals.append('Volatility 2x: within 3 days of earnings')
        elif days_to <= 7:
            vol_mult = 1.5
            signals.append('Volatility 1.5x: within 7 days of earnings')
        elif days_to <= 14:
            vol_mult = 1.2
            signals.append('Volatility 1.2x: within 14 days of earnings')

    # Clamp alpha
    result['earnings_alpha'] = round(float(np.clip(alpha, -0.08, 0.08)), 4)
    result['earnings_vol_mult'] = round(vol_mult, 2)
    result['signals'] = signals

    if result['earnings_alpha'] > 0.02:
        result['earnings_label'] = 'Bullish'
    elif result['earnings_alpha'] < -0.02:
        result['earnings_label'] = 'Bearish'
    else:
        result['earnings_label'] = 'Neutral'

    return result


def _empty_result(symbol, error_msg=''):
    return {
        'symbol': symbol,
        'available': False,
        'earnings_alpha': 0.0,
        'earnings_vol_mult': 1.0,
        'earnings_label': 'Neutral',
        'next_earnings_date': None,
        'days_to_earnings': None,
        'earnings_growth_trend': 'unknown',
        'surprise_history': [],
        'signals': [f'No earnings data: {error_msg}'] if error_msg else [],
        'cached': False,
        'timestamp': datetime.now().isoformat(),
        'elapsed_ms': 0,
    }


def get_earnings_status():
    """Return module status."""
    return {
        'yfinance_available': YF_AVAILABLE,
        'cached_symbols': list(_EARNINGS_CACHE.keys()),
        'cache_ttl_seconds': EARNINGS_CACHE_TTL,
    }
