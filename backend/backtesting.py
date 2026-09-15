"""
Backtesting Engine for AmeyaFX/Deimos

Walk-forward simulation: for each historical day in range, compute what
the ML model would have predicted, then compare against actual outcomes.

Computes:
  - Hit rate (directional accuracy)
  - Average P&L per trade
  - Max drawdown
  - Sharpe ratio approximation
  - Win/loss ratio
  - Equity curve data (for charting)
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

# ── Cache ────────────────────────────────────────────
_BACKTEST_CACHE = {}       # key -> result
_BACKTEST_CACHE_TIME = {}
BACKTEST_CACHE_TTL = 7200  # 2 hours


def _safe_print(msg):
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode('ascii', 'replace').decode('ascii'))


def _compute_rsi(series, period=14):
    """Compute RSI from a price series."""
    delta = series.diff()
    gain = delta.where(delta > 0, 0).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss + 1e-10)
    return 100 - (100 / (1 + rs))


def _compute_macd(series, fast=12, slow=26, signal=9):
    """Compute MACD from a price series."""
    ema_fast = series.ewm(span=fast).mean()
    ema_slow = series.ewm(span=slow).mean()
    macd = ema_fast - ema_slow
    macd_signal = macd.ewm(span=signal).mean()
    return macd, macd_signal


def _simple_signal(row, ma20, ma50, rsi, macd, macd_sig):
    """Generate a simple BUY/HOLD/SELL signal from basic indicators."""
    score = 0

    # RSI
    if rsi < 30:
        score += 2
    elif rsi < 40:
        score += 1
    elif rsi > 70:
        score -= 2
    elif rsi > 60:
        score -= 1

    # MACD
    if macd > macd_sig:
        score += 1
    else:
        score -= 1

    # Price vs MAs
    price = row['Close']
    if price > ma20:
        score += 1
    else:
        score -= 1
    if price > ma50:
        score += 1
    else:
        score -= 1

    if score >= 2:
        return 'BUY'
    elif score <= -2:
        return 'SELL'
    return 'HOLD'


def run_backtest(symbol, start_date=None, end_date=None, horizon_days=5):
    """
    Run a walk-forward backtest for a stock.

    Args:
        symbol: NSE stock symbol
        start_date: start of backtest period (str YYYY-MM-DD), default 6 months ago
        end_date: end of backtest period (str YYYY-MM-DD), default today
        horizon_days: prediction horizon in days (1, 5, 21)

    Returns dict with:
        - trades: list of individual trade outcomes
        - equity_curve: list of {date, equity} for charting
        - metrics: hit_rate, avg_pnl, max_drawdown, sharpe, win_loss_ratio, etc.
    """
    symbol = symbol.upper().strip()
    cache_key = f"{symbol}_{start_date}_{end_date}_{horizon_days}"

    # Check cache
    if cache_key in _BACKTEST_CACHE and cache_key in _BACKTEST_CACHE_TIME:
        age = (datetime.now() - _BACKTEST_CACHE_TIME[cache_key]).total_seconds()
        if age < BACKTEST_CACHE_TTL:
            cached = _BACKTEST_CACHE[cache_key].copy()
            cached['cached'] = True
            return cached

    if not YF_AVAILABLE:
        return _empty_result(symbol, 'yfinance not available')

    # Default dates
    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now() - timedelta(days=180)).strftime('%Y-%m-%d')

    _safe_print(f"   Backtesting {symbol} from {start_date} to {end_date} (horizon={horizon_days}d)...")
    t0 = time.time()

    try:
        # Fetch extended data (need buffer for indicators)
        buffer_start = (pd.Timestamp(start_date) - pd.Timedelta(days=120)).strftime('%Y-%m-%d')
        t = yf.Ticker(f"{symbol}.NS")
        df = t.history(start=buffer_start, end=end_date)

        if df is None or len(df) < 60:
            return _empty_result(symbol, 'Insufficient data')

        # Compute indicators
        df['RSI'] = _compute_rsi(df['Close'])
        df['MA20'] = df['Close'].rolling(20).mean()
        df['MA50'] = df['Close'].rolling(50).mean()
        macd, macd_sig = _compute_macd(df['Close'])
        df['MACD'] = macd
        df['MACD_Signal'] = macd_sig

        # Drop NaN rows
        df = df.dropna()

        # Filter to actual backtest period
        bt_start = pd.Timestamp(start_date)
        df_bt = df[df.index >= bt_start].copy()

        if len(df_bt) < 10:
            return _empty_result(symbol, 'Not enough data in backtest period')

        # Walk-forward simulation
        trades = []
        equity = 100000  # Start with 1 lakh
        equity_curve = []
        peak_equity = equity

        for i in range(len(df_bt) - horizon_days):
            row = df_bt.iloc[i]
            date_str = df_bt.index[i].strftime('%Y-%m-%d')

            # Generate signal using indicators available on this date
            signal = _simple_signal(
                row,
                row['MA20'], row['MA50'],
                row['RSI'], row['MACD'], row['MACD_Signal']
            )

            # Actual outcome after horizon_days
            entry_price = float(row['Close'])
            exit_price = float(df_bt.iloc[i + horizon_days]['Close'])
            actual_return = (exit_price - entry_price) / entry_price

            # Determine if signal was correct
            if signal == 'BUY':
                pnl_pct = actual_return * 100
                correct = actual_return > 0
            elif signal == 'SELL':
                pnl_pct = -actual_return * 100  # Short position
                correct = actual_return < 0
            else:  # HOLD
                pnl_pct = 0
                correct = abs(actual_return) < 0.02  # Hold is "correct" if <2% move

            # Update equity (invest 10% of equity per trade)
            position_size = 0.10
            if signal != 'HOLD':
                equity_change = equity * position_size * (pnl_pct / 100)
                equity += equity_change
            else:
                equity_change = 0

            peak_equity = max(peak_equity, equity)

            trades.append({
                'date': date_str,
                'signal': signal,
                'entry': round(entry_price, 2),
                'exit': round(exit_price, 2),
                'return_pct': round(actual_return * 100, 2),
                'pnl_pct': round(pnl_pct, 2),
                'correct': correct,
                'equity': round(equity, 2),
            })

            equity_curve.append({
                'date': date_str,
                'equity': round(equity, 2),
                'drawdown': round(((peak_equity - equity) / peak_equity) * 100, 2),
            })

        # Compute metrics
        if not trades:
            return _empty_result(symbol, 'No trades generated')

        active_trades = [t for t in trades if t['signal'] != 'HOLD']
        correct_trades = [t for t in active_trades if t['correct']]
        wrong_trades = [t for t in active_trades if not t['correct']]

        hit_rate = (len(correct_trades) / len(active_trades) * 100) if active_trades else 0
        avg_pnl = np.mean([t['pnl_pct'] for t in active_trades]) if active_trades else 0

        wins = [t['pnl_pct'] for t in active_trades if t['pnl_pct'] > 0]
        losses = [t['pnl_pct'] for t in active_trades if t['pnl_pct'] < 0]
        avg_win = np.mean(wins) if wins else 0
        avg_loss = abs(np.mean(losses)) if losses else 0.01
        win_loss_ratio = round(avg_win / avg_loss, 2) if avg_loss > 0 else 0

        # Max drawdown
        max_dd = max(e['drawdown'] for e in equity_curve) if equity_curve else 0

        # Sharpe ratio (simplified)
        returns = [t['pnl_pct'] for t in active_trades]
        if len(returns) > 1:
            sharpe = (np.mean(returns) / (np.std(returns) + 1e-10)) * np.sqrt(252 / horizon_days)
        else:
            sharpe = 0

        # Signal distribution
        buy_count = sum(1 for t in trades if t['signal'] == 'BUY')
        sell_count = sum(1 for t in trades if t['signal'] == 'SELL')
        hold_count = sum(1 for t in trades if t['signal'] == 'HOLD')

        # Total return
        total_return = ((equity - 100000) / 100000) * 100

        # Buy & hold comparison
        bh_start = float(df_bt.iloc[0]['Close'])
        bh_end = float(df_bt.iloc[-1]['Close'])
        buy_hold_return = ((bh_end - bh_start) / bh_start) * 100

        result = {
            'symbol': symbol,
            'start_date': start_date,
            'end_date': end_date,
            'horizon_days': horizon_days,
            'total_trading_days': len(df_bt),
            'trades': trades[-50:],  # Last 50 trades for response size
            'equity_curve': equity_curve,
            'metrics': {
                'total_trades': len(active_trades),
                'hold_signals': hold_count,
                'hit_rate': round(hit_rate, 1),
                'avg_pnl_pct': round(avg_pnl, 2),
                'total_return_pct': round(total_return, 2),
                'buy_hold_return_pct': round(buy_hold_return, 2),
                'alpha_vs_bh': round(total_return - buy_hold_return, 2),
                'max_drawdown_pct': round(max_dd, 2),
                'sharpe_ratio': round(sharpe, 2),
                'win_loss_ratio': win_loss_ratio,
                'wins': len(wins),
                'losses': len(losses),
                'avg_win_pct': round(avg_win, 2),
                'avg_loss_pct': round(avg_loss, 2),
                'buy_signals': buy_count,
                'sell_signals': sell_count,
                'final_equity': round(equity, 2),
                'initial_equity': 100000,
            },
            'elapsed_ms': int((time.time() - t0) * 1000),
            'cached': False,
            'timestamp': datetime.now().isoformat(),
        }

        # Cache
        _BACKTEST_CACHE[cache_key] = result
        _BACKTEST_CACHE_TIME[cache_key] = datetime.now()

        _safe_print(f"   Backtest complete: {len(active_trades)} trades, "
                    f"hit={hit_rate:.1f}%, return={total_return:+.1f}% "
                    f"(B&H: {buy_hold_return:+.1f}%) in {(time.time()-t0):.1f}s")

        return result

    except Exception as e:
        _safe_print(f"   Backtest error for {symbol}: {e}")
        import traceback; traceback.print_exc()
        return _empty_result(symbol, str(e))


def _empty_result(symbol, error_msg=''):
    return {
        'symbol': symbol,
        'trades': [],
        'equity_curve': [],
        'metrics': {
            'total_trades': 0, 'hit_rate': 0, 'avg_pnl_pct': 0,
            'total_return_pct': 0, 'buy_hold_return_pct': 0, 'alpha_vs_bh': 0,
            'max_drawdown_pct': 0, 'sharpe_ratio': 0, 'win_loss_ratio': 0,
            'wins': 0, 'losses': 0, 'final_equity': 100000, 'initial_equity': 100000,
        },
        'error': error_msg,
        'cached': False,
        'timestamp': datetime.now().isoformat(),
        'elapsed_ms': 0,
    }


def get_backtest_status():
    """Return module status."""
    return {
        'yfinance_available': YF_AVAILABLE,
        'cached_keys': list(_BACKTEST_CACHE.keys()),
        'cache_ttl_seconds': BACKTEST_CACHE_TTL,
    }
