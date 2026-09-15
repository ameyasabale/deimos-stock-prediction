"""
AmeyaFX - Complete Real ML API v2
✅ All NSE stocks from NSE CSV
✅ Complete financial data from Yahoo Finance
✅ Multi-timeframe predictions: Tomorrow, Week, Month, Year
✅ Model saved - accuracy never changes
✅ Scan ALL stocks (not just 50)
✅ Real LSTM + Random Forest
"""
from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
import pandas as pd
import yfinance as yf
import requests, io, time, os, warnings
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, ExtraTreesClassifier, RandomForestRegressor, GradientBoostingRegressor
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.model_selection import TimeSeriesSplit
from sklearn.preprocessing import MinMaxScaler, StandardScaler
from sklearn.metrics import accuracy_score, balanced_accuracy_score
from sklearn.calibration import CalibratedClassifierCV
import joblib

try:
    from xgboost import XGBRegressor
    XGBOOST_AVAILABLE = True
except Exception:
    XGBOOST_AVAILABLE = False

try:
    from lightgbm import LGBMClassifier, LGBMRegressor
    LIGHTGBM_AVAILABLE = True
except Exception:
    LIGHTGBM_AVAILABLE = False
    LGBMClassifier = None
    LGBMRegressor = None

try:
    from arch import arch_model
    ARCH_AVAILABLE = True
except Exception:
    ARCH_AVAILABLE = False


from db_save import save_prediction, save_volatile_batch, get_prediction_history
from db_auth import signup_user, login_user
from db_hourly import (
    save_hourly_row, save_daily_avg_row,
    save_hourly_endpoint, get_hourly_endpoint,
    save_daily_avg_endpoint, get_daily_avg_endpoint,
    backfill_daily_avg_actuals, CONN_STR_NSE as HOURLY_CONN_STR,
)
import pyodbc as _pyodbc

warnings.filterwarnings('ignore')

try:
    from tensorflow.keras.models import Sequential, load_model
    from tensorflow.keras.layers import LSTM, Dense, Dropout, Bidirectional
    from tensorflow.keras.optimizers import Adam
    from tensorflow.keras.callbacks import EarlyStopping
    LSTM_AVAILABLE = True
except:
    LSTM_AVAILABLE = False

app = Flask(__name__)
CORS(app)

# ── Fix Windows console encoding (cp1252 → utf-8) ─────────
import sys, io
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── Load .env.local for GROQ_API_KEY ──────────────────────
try:
    from dotenv import load_dotenv as _load_dotenv
    _base_dir = os.path.dirname(os.path.abspath(__file__))
    # Try ../nextjs_sidebyside/.env.local first, then local .env
    _env_paths = [
        os.path.join(_base_dir, '..', 'nextjs_sidebyside', '.env.local'),
        os.path.join(_base_dir, '..', '.env.local'),
        os.path.join(_base_dir, '.env.local'),
        os.path.join(_base_dir, '.env'),
    ]
    for _p in _env_paths:
        if os.path.exists(_p):
            _load_dotenv(_p, override=False)
            print(f"   Loaded env from: {_p}")
            break
    _gkey = os.environ.get('GROQ_API_KEY', '')
    print(f"   GROQ_API_KEY: {'SET [OK]' if _gkey else 'NOT SET [MISSING]'}")
except ImportError:
    print("   python-dotenv not installed — GROQ_API_KEY must be in system env")



@app.errorhandler(400)
def handle_bad_request(error):
    return jsonify({'success': False, 'error': 'Bad request'}), 400


@app.errorhandler(404)
def handle_not_found(error):
    return jsonify({'success': False, 'error': 'API route not found'}), 404


@app.errorhandler(500)
def handle_server_error(error):
    return jsonify({'success': False, 'error': 'Internal server error'}), 500


def sanitize_for_json(value):
    """Convert NaN/Infinity and numpy scalars into strict-JSON-safe values."""
    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float):
        return value if np.isfinite(value) else None
    return value

NSE_CACHE = None
NSE_CACHE_TIME = None
NIFTY_CACHE = None
NIFTY_CACHE_TIME = None
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MODELS_DIR = os.path.join(SCRIPT_DIR, 'saved_models')
os.makedirs(MODELS_DIR, exist_ok=True)

# v2 models: adaptive vol-scaled labels + stacking ensemble + market regime features.
# Old (unversioned) pkls are ignored; new pkls are saved with _v2 suffix so a
# first run after the upgrade retrains once and stays cached after that.
MODEL_VER = 'v2'

# ═══════════════════════════════════════════════════════
# FETCH ALL NSE STOCKS
# ═══════════════════════════════════════════════════════
def fetch_nse_stocks():
    global NSE_CACHE, NSE_CACHE_TIME
    if NSE_CACHE and NSE_CACHE_TIME:
        if (datetime.now() - NSE_CACHE_TIME).seconds < 21600:
            return NSE_CACHE
    stocks = []
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.nseindia.com/',
    }
    try:
        session = requests.Session()
        session.headers.update(headers)
        session.get('https://www.nseindia.com', timeout=15)
        time.sleep(1)
        resp = session.get(
            'https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv',
            timeout=20
        )
        if resp.status_code == 200 and len(resp.content) > 5000:
            df = pd.read_csv(io.StringIO(resp.text))
            df.columns = [c.strip() for c in df.columns]
            sym_col  = next((c for c in df.columns if 'SYMBOL' in c.upper()), None)
            name_col = next((c for c in df.columns if 'NAME' in c.upper() and 'COMPANY' in c.upper()), None)
            ser_col  = next((c for c in df.columns if 'SERIES' in c.upper()), None)
            isin_col = next((c for c in df.columns if 'ISIN' in c.upper()), None)
            if sym_col:
                for _, row in df.iterrows():
                    sym    = str(row.get(sym_col, '')).strip()
                    series = str(row.get(ser_col, 'EQ')).strip() if ser_col else 'EQ'
                    name   = str(row.get(name_col, sym)).strip() if name_col else sym
                    isin   = str(row.get(isin_col, '')).strip() if isin_col else ''
                    if sym and series == 'EQ' and sym != 'nan':
                        stocks.append({'symbol': sym, 'name': name, 'series': 'EQ', 'isin': isin})
                print(f"NSE CSV: {len(stocks)} stocks")
    except Exception as e:
        print(f"NSE CSV failed: {e}")

    if len(stocks) < 100:
        try:
            seen = set()
            session2 = requests.Session()
            session2.headers.update(headers)
            session2.get('https://www.nseindia.com', timeout=10)
            for idx in ['NIFTY 50','NIFTY NEXT 50','NIFTY 100','NIFTY 500',
                        'NIFTY MIDCAP 100','NIFTY SMALLCAP 100','SECURITIES IN F&O']:
                try:
                    url = f"https://www.nseindia.com/api/equity-stockIndices?index={requests.utils.quote(idx)}"
                    r   = session2.get(url, timeout=10)
                    if r.status_code == 200:
                        for s in r.json().get('data', []):
                            sym = s.get('symbol', '')
                            if sym and sym not in seen and sym != idx:
                                seen.add(sym)
                                meta = s.get('meta', {})
                                name = meta.get('companyName', sym) if isinstance(meta, dict) else sym
                                stocks.append({'symbol': sym, 'name': name, 'series': 'EQ', 'isin': ''})
                    time.sleep(0.3)
                except: continue
        except: pass

    seen_s, unique = set(), []
    for s in stocks:
        if s['symbol'] not in seen_s and s['symbol'] != 'nan':
            seen_s.add(s['symbol'])
            unique.append(s)
    NSE_CACHE = unique
    NSE_CACHE_TIME = datetime.now()
    print(f"Total: {len(unique)} NSE stocks")
    return unique

# ═══════════════════════════════════════════════════════
# TECHNICAL INDICATORS
# ═══════════════════════════════════════════════════════
def calc_rsi(p, n=14):
    d=p.diff(); g=d.where(d>0,0.0); l=-d.where(d<0,0.0)
    ag=g.ewm(com=n-1,min_periods=n).mean(); al=l.ewm(com=n-1,min_periods=n).mean()
    return 100-(100/(1+ag/(al+1e-10)))

def calc_macd(p,f=12,s=26,sig=9):
    ef=p.ewm(span=f,adjust=False).mean(); es=p.ewm(span=s,adjust=False).mean()
    m=ef-es; ms=m.ewm(span=sig,adjust=False).mean()
    return m,ms,m-ms

def calc_bb(p,n=20,sd=2):
    sma=p.rolling(n).mean(); std=p.rolling(n).std()
    up=sma+sd*std; lo=sma-sd*std
    return up,sma,lo,(p-lo)/(up-lo+1e-10)

def calc_stoch(h,l,c,k=14,d=3):
    lk=l.rolling(k).min(); hk=h.rolling(k).max()
    sk=100*(c-lk)/(hk-lk+1e-10)
    return sk,sk.rolling(d).mean()

def calc_atr(h,l,c,n=14):
    tr=pd.concat([h-l,(h-c.shift()).abs(),(l-c.shift()).abs()],axis=1).max(axis=1)
    return tr.ewm(span=n,adjust=False).mean()

def calc_cci(h,l,c,n=20):
    tp=(h+l+c)/3; sma=tp.rolling(n).mean()
    mad=tp.rolling(n).apply(lambda x:np.abs(x-x.mean()).mean())
    return (tp-sma)/(0.015*mad+1e-10)

def calc_wr(h,l,c,n=14):
    hh=h.rolling(n).max(); ll=l.rolling(n).min()
    return -100*(hh-c)/(hh-ll+1e-10)

def add_indicators(df):
    c,h,l,v=df['Close'],df['High'],df['Low'],df['Volume']
    for w in [5,10,20,50,200]: df[f'MA_{w}']=c.rolling(w).mean()
    df['EMA_12']=c.ewm(span=12,adjust=False).mean()
    df['EMA_26']=c.ewm(span=26,adjust=False).mean()
    df['RSI']=calc_rsi(c)
    df['MACD'],df['MACD_Signal'],df['MACD_Hist']=calc_macd(c)
    df['BB_Upper'],df['BB_Mid'],df['BB_Lower'],df['BB_Pct']=calc_bb(c)
    df['Stoch_K'],df['Stoch_D']=calc_stoch(h,l,c)
    df['ATR']=calc_atr(h,l,c)
    df['CCI']=calc_cci(h,l,c)
    df['Williams_R']=calc_wr(h,l,c)
    df['Vol_MA_20']=v.rolling(20).mean()
    df['Volume_Ratio']=v/(df['Vol_MA_20']+1e-10)
    df['Momentum_10']=c-c.shift(10)
    df['ROC_12']=c.pct_change(12)*100
    df['Return_1d']=c.pct_change(1)*100
    df['Return_5d']=c.pct_change(5)*100
    df['Return_20d']=c.pct_change(20)*100
    df['Vs_MA20']=(c-df['MA_20'])/(df['MA_20']+1e-10)*100
    df['Vs_MA50']=(c-df['MA_50'])/(df['MA_50']+1e-10)*100
    df['Vs_MA200']=(c-df['MA_200'])/(df['MA_200']+1e-10)*100
    df['HL_Spread']=(h-l)/(c+1e-10)*100
    df.dropna(inplace=True)
    return df

FEATURES=['RSI','MACD','MACD_Signal','MACD_Hist','BB_Pct','Stoch_K','Stoch_D',
          'CCI','Williams_R','Momentum_10','ROC_12','Volume_Ratio','ATR',
          'Vs_MA20','Vs_MA50','Vs_MA200','Return_1d','Return_5d','Return_20d','HL_Spread']

# v2 feature set — extra microstructure + market regime features
FEATURES_V2 = FEATURES + [
    'Log_Volume','Gap_Pct','Intraday_Range','Near_52W_High','Near_52W_Low',
    'Vol_20','Vol_60','Trend_Strength',
    'Nifty_Ret_5d','Nifty_Ret_20d','Nifty_Vol_20','Rel_Strength_20','Beta_60',
    'Volume_Shock_20','Gap_Shock_20','Sector_Ret_20',
]

# ═══════════════════════════════════════════════════════
# SECTOR INDEX CACHE — resolves a stock's yfinance sector → NSE sector index
# ═══════════════════════════════════════════════════════
# yfinance returns high-level sector names ("Technology", "Financial Services", etc).
# Map them to NSE sector-index tickers that cover the same ground.
_SECTOR_TICKER_MAP = {
    'technology':            '^CNXIT',
    'financial services':    '^NSEBANK',
    'financial':             '^NSEBANK',
    'healthcare':            '^CNXPHARMA',
    'basic materials':       '^CNXMETAL',
    'consumer cyclical':     '^CNXAUTO',
    'consumer defensive':    '^CNXFMCG',
    'energy':                '^CNXENERGY',
    'industrials':           '^CNXINFRA',
    'utilities':             '^CNXENERGY',
    'real estate':           '^CNXREALTY',
    'communication services':'^CNXIT',
}
SECTOR_IDX_CACHE = {}       # ticker -> DataFrame
SECTOR_IDX_CACHE_TIME = {}  # ticker -> datetime

def resolve_sector_ticker(symbol):
    """Map an NSE symbol to its sector-index yfinance ticker. None if unknown."""
    try:
        info = yf.Ticker(f"{symbol}.NS").info or {}
        sector = str(info.get('sector', '')).strip().lower()
        return _SECTOR_TICKER_MAP.get(sector)
    except Exception:
        return None

def fetch_sector_index_cached(ticker):
    """Cached (6h) per-sector history. Mirrors fetch_nifty_cached()."""
    if not ticker:
        return pd.DataFrame()
    now = datetime.now()
    if ticker in SECTOR_IDX_CACHE and ticker in SECTOR_IDX_CACHE_TIME:
        if (now - SECTOR_IDX_CACHE_TIME[ticker]).seconds < 21600:
            return SECTOR_IDX_CACHE[ticker]
    try:
        hist = yf.Ticker(ticker).history(period='5y', interval='1d')
        if hist is None or hist.empty:
            SECTOR_IDX_CACHE[ticker] = pd.DataFrame()
        else:
            h = hist[['Close']].copy()
            h['Sector_Ret_20'] = h['Close'].pct_change(20)
            SECTOR_IDX_CACHE[ticker] = h
        SECTOR_IDX_CACHE_TIME[ticker] = now
    except Exception as e:
        print(f"Sector index fetch failed ({ticker}): {e}")
        SECTOR_IDX_CACHE[ticker] = pd.DataFrame()
        SECTOR_IDX_CACHE_TIME[ticker] = now
    return SECTOR_IDX_CACHE[ticker]

# ═══════════════════════════════════════════════════════
# MARKET REGIME (NIFTY 50) — cached so every symbol reuses it
# ═══════════════════════════════════════════════════════
def fetch_nifty_cached():
    global NIFTY_CACHE, NIFTY_CACHE_TIME
    if NIFTY_CACHE is not None and NIFTY_CACHE_TIME:
        if (datetime.now() - NIFTY_CACHE_TIME).seconds < 21600:
            return NIFTY_CACHE
    try:
        nifty = yf.Ticker('^NSEI').history(period='5y', interval='1d')
        if nifty is None or nifty.empty:
            NIFTY_CACHE = pd.DataFrame()
        else:
            n = nifty[['Close']].copy()
            n['Nifty_Ret_1d']  = n['Close'].pct_change(1)
            n['Nifty_Ret_5d']  = n['Close'].pct_change(5)
            n['Nifty_Ret_20d'] = n['Close'].pct_change(20)
            n['Nifty_Vol_20']  = n['Nifty_Ret_1d'].rolling(20).std()
            NIFTY_CACHE = n
        NIFTY_CACHE_TIME = datetime.now()
    except Exception as e:
        print(f"NIFTY fetch failed: {e}")
        NIFTY_CACHE = pd.DataFrame()
        NIFTY_CACHE_TIME = datetime.now()
    return NIFTY_CACHE

def add_v2_features(df, symbol=None):
    """Adds extra microstructure + market regime features on top of add_indicators()."""
    c,h,l,o,v = df['Close'],df['High'],df['Low'],df['Open'],df['Volume']
    df['Log_Volume']      = np.log1p(v)
    df['Log_Volume']      = (df['Log_Volume'] - df['Log_Volume'].rolling(60).mean()) / (df['Log_Volume'].rolling(60).std() + 1e-10)
    df['Gap_Pct']         = (o - c.shift(1)) / (c.shift(1) + 1e-10) * 100
    df['Intraday_Range']  = (h - l) / (o + 1e-10) * 100
    w52_high              = c.rolling(252, min_periods=50).max()
    w52_low               = c.rolling(252, min_periods=50).min()
    df['Near_52W_High']   = (c - w52_high) / (w52_high + 1e-10) * 100
    df['Near_52W_Low']    = (c - w52_low)  / (w52_low  + 1e-10) * 100
    daily_ret             = c.pct_change()
    df['Vol_20']          = daily_ret.rolling(20).std()
    df['Vol_60']          = daily_ret.rolling(60).std()
    # Trend strength = slope of log price over 20d, normalized
    log_c                 = np.log(c + 1e-10)
    df['Trend_Strength']  = (log_c - log_c.shift(20)) / 20

    # Market regime features (NIFTY)
    nifty = fetch_nifty_cached()
    if not nifty.empty:
        idx_map = nifty.reindex(df.index, method='nearest', tolerance=pd.Timedelta('3D'))
        df['Nifty_Ret_5d']   = idx_map['Nifty_Ret_5d'].values
        df['Nifty_Ret_20d']  = idx_map['Nifty_Ret_20d'].values
        df['Nifty_Vol_20']   = idx_map['Nifty_Vol_20'].values
        # Relative strength: stock 20d return minus nifty 20d return
        stock_ret_20         = c.pct_change(20)
        df['Rel_Strength_20']= stock_ret_20 - idx_map['Nifty_Ret_20d'].values
        # Rolling 60d beta: cov(stock, nifty) / var(nifty)
        n_ret                = idx_map['Nifty_Ret_1d']
        cov60                = daily_ret.rolling(60).cov(n_ret)
        var60                = n_ret.rolling(60).var()
        df['Beta_60']        = cov60 / (var60 + 1e-10)
    else:
        for k in ['Nifty_Ret_5d','Nifty_Ret_20d','Nifty_Vol_20','Rel_Strength_20','Beta_60']:
            df[k] = 0.0

    # --- v3 features --------------------------------------------------------
    # Volume shock: z-score of today's volume vs trailing 20-day mean/std.
    # Captures earnings/news-day spikes that typically precede directional moves.
    vol_mean_20 = v.rolling(20).mean()
    vol_std_20  = v.rolling(20).std()
    df['Volume_Shock_20'] = (v - vol_mean_20) / (vol_std_20 + 1e-10)

    # Gap shock: z-score of today's overnight gap vs trailing 20-day gap std.
    # Large gaps (up or down) are regime-change signals for classifiers.
    gap_std_20         = df['Gap_Pct'].rolling(20).std()
    df['Gap_Shock_20'] = df['Gap_Pct'] / (gap_std_20 + 1e-10)

    # Sector-index 20d return — gives the classifier cross-sectional context.
    # E.g. a pharma stock rallying while the pharma index is weak = relative strength.
    sector_ret_series = None
    if symbol:
        sector_ticker = resolve_sector_ticker(symbol)
        if sector_ticker:
            s_df = fetch_sector_index_cached(sector_ticker)
            if not s_df.empty:
                aligned = s_df.reindex(df.index, method='nearest', tolerance=pd.Timedelta('3D'))
                sector_ret_series = aligned['Sector_Ret_20'].values
                print(f"   Sector: {sector_ticker}")
    if sector_ret_series is not None:
        df['Sector_Ret_20'] = sector_ret_series
    else:
        # Fallback: use NIFTY 20d return (already computed above) so the feature
        # column always exists.
        df['Sector_Ret_20'] = df.get('Nifty_Ret_20d', 0.0)

    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    return df

# ═══════════════════════════════════════════════════════
# ADAPTIVE (VOLATILITY-SCALED) LABELS
# ═══════════════════════════════════════════════════════
def make_labels_adaptive(df, days):
    """
    BUY/SELL/HOLD labels with thresholds that scale with rolling volatility and
    horizon length. Fixed ±2% thresholds made "next year" trivially BUY/SELL and
    "tomorrow" too noisy — this fixes that.
    Threshold = 0.5 * (rolling 30d daily std) * sqrt(days).
    """
    fut_ret     = df['Close'].shift(-days) / df['Close'] - 1.0
    daily_vol   = df['Close'].pct_change().rolling(30, min_periods=15).std()
    horizon_vol = daily_vol * np.sqrt(max(days, 1))
    threshold   = 0.5 * horizon_vol  # ~38% HOLD, ~31% BUY, ~31% SELL on average

    labels = pd.Series(index=df.index, dtype='object')
    labels[:] = np.nan
    valid     = fut_ret.notna() & horizon_vol.notna() & (threshold > 0)
    labels[valid & (fut_ret >  threshold)] = 'BUY'
    labels[valid & (fut_ret < -threshold)] = 'SELL'
    labels[valid & (fut_ret.abs() <= threshold)] = 'HOLD'
    return labels

# ═══════════════════════════════════════════════════════
# STACKED ENSEMBLE: RF + GBM + ExtraTrees → LogReg meta
# ═══════════════════════════════════════════════════════
def _stack_oof_probas(base_models, X, y, classes, n_splits=3):
    """Out-of-fold stacked probability matrix using TimeSeriesSplit."""
    tscv = TimeSeriesSplit(n_splits=n_splits)
    n, k = len(X), len(classes)
    oof  = np.zeros((n, k * len(base_models)))
    fold_accs = []
    for tr, te in tscv.split(X):
        if len(np.unique(y[tr])) < 2:
            continue
        fold_preds = []
        for j, (_, m) in enumerate(base_models):
            mm = _clone_estimator(m)
            mm.fit(X[tr], y[tr])
            proba = np.zeros((len(te), k))
            for ci, c in enumerate(classes):
                if c in mm.classes_:
                    proba[:, ci] = mm.predict_proba(X[te])[:, list(mm.classes_).index(c)]
            oof[te, j*k:(j+1)*k] = proba
            fold_preds.append(proba)
        # Average for fold accuracy
        avg = np.mean(fold_preds, axis=0)
        fold_accs.append(accuracy_score(y[te], [classes[i] for i in np.argmax(avg, axis=1)]))
    return oof, fold_accs

def _clone_estimator(est):
    from sklearn.base import clone
    return clone(est)

def _build_v3_base_models():
    """
    Base learners for the 3-class head. LightGBM is added when available —
    typically 2–4pp better than plain sklearn GBM on tabular financial data.
    Each is wrapped in CalibratedClassifierCV(isotonic, cv=3) so the per-class
    probabilities the meta-learner consumes are well-calibrated rather than
    the inflated confidence most trees produce.
    """
    raw = [
        ('rf', RandomForestClassifier(n_estimators=200, max_depth=10, min_samples_leaf=4,
                                      class_weight='balanced', random_state=42, n_jobs=-1)),
        ('gb', GradientBoostingClassifier(n_estimators=80, learning_rate=0.08,
                                          max_depth=3, random_state=42)),
        ('et', ExtraTreesClassifier(n_estimators=200, max_depth=10, min_samples_leaf=4,
                                    class_weight='balanced', random_state=42, n_jobs=-1)),
    ]
    if LIGHTGBM_AVAILABLE:
        raw.append(('lgbm', LGBMClassifier(
            n_estimators=250, num_leaves=31, learning_rate=0.05, min_child_samples=20,
            class_weight='balanced', random_state=42, n_jobs=-1, verbose=-1)))
    # Isotonic calibration via CV. Small data => be defensive — fall back to the raw
    # estimator if calibration fails (e.g. too few samples per class in a CV fold).
    wrapped = []
    for name, m in raw:
        try:
            wrapped.append((name, CalibratedClassifierCV(m, method='isotonic', cv=3)))
        except Exception:
            wrapped.append((name, m))
    return wrapped


def _train_direction_head(Xs, y_dir, feature_scaler_unused):
    """
    Binary UP/DOWN head — simpler 2-model stack (RF + LightGBM if available).
    Returned as a sub-bundle so we can persist alongside the 3-class model.
    Provides the reportable "direction accuracy" number (50% baseline, vs 33%
    baseline for the 3-class head) so users see an interpretable metric.
    """
    if len(Xs) < 80 or len(np.unique(y_dir)) != 2:
        return None, []
    dir_raw = [
        ('rf_dir', RandomForestClassifier(n_estimators=200, max_depth=10, min_samples_leaf=4,
                                          class_weight='balanced', random_state=42, n_jobs=-1)),
    ]
    if LIGHTGBM_AVAILABLE:
        dir_raw.append(('lgbm_dir', LGBMClassifier(
            n_estimators=200, num_leaves=31, learning_rate=0.05, min_child_samples=20,
            class_weight='balanced', random_state=42, n_jobs=-1, verbose=-1)))
    dir_bases = []
    for name, m in dir_raw:
        try:
            dir_bases.append((name, CalibratedClassifierCV(m, method='isotonic', cv=3)))
        except Exception:
            dir_bases.append((name, m))
    dir_classes = np.array(['DOWN', 'UP'])
    try:
        oof, fold_accs = _stack_oof_probas(dir_bases, Xs, y_dir, dir_classes, n_splits=3)
    except Exception as e:
        print(f"   WARN: direction OOF failed: {e}")
        return None, []
    filled = oof.sum(axis=1) > 0
    if filled.sum() < 40:
        return None, fold_accs
    meta = LogisticRegression(max_iter=1000, class_weight='balanced')
    meta.fit(oof[filled], y_dir[filled])
    fitted = []
    for name, m in dir_bases:
        mm = _clone_estimator(m); mm.fit(Xs, y_dir)
        fitted.append((name, mm))
    return {
        'base_models': fitted, 'meta': meta, 'classes': list(dir_classes),
    }, fold_accs


def train_stacked_for_timeframe(symbol, df, timeframe_days, timeframe_name):
    """
    v3 stacked ensemble per timeframe — saved to disk so accuracy stays fixed on
    reruns. Returns (bundle, accuracy_3class). The bundle also holds a binary
    UP/DOWN 'direction_bundle' and an accuracy_direction metric (50% baseline).
    """
    model_path = os.path.join(MODELS_DIR, f"{symbol}_{timeframe_name}_{MODEL_VER}_stack.pkl")
    if os.path.exists(model_path):
        try:
            bundle = joblib.load(model_path)
            acc3   = bundle.get('accuracy3', bundle.get('accuracy', 0))
            accdir = bundle.get('accuracy_direction', 0)
            print(f"   LOADED v3 model for {symbol} {timeframe_name} — acc3 {acc3:.1f}% | dir {accdir:.1f}% (FIXED)")
            return bundle, acc3
        except Exception as e:
            print(f"   WARN: Could not load stacked model, retraining: {e}")

    # --- 3-class labels (vol-scaled BUY/HOLD/SELL) ---
    labels = make_labels_adaptive(df, days=timeframe_days)
    d2 = df.copy(); d2['Label'] = labels
    d2 = d2.dropna(subset=['Label'])
    if len(d2) < 120:
        return None, 0
    avail = [c for c in FEATURES_V2 if c in d2.columns]
    d2 = d2.dropna(subset=avail)
    if len(d2) < 120:
        return None, 0

    X  = d2[avail].values
    y3 = d2['Label'].astype(str).values
    classes3 = np.array(sorted(np.unique(y3)))
    if len(classes3) < 2:
        print(f"   WARN: {timeframe_name}: only one 3-class label — skipping")
        return None, 0

    feature_scaler = StandardScaler().fit(X)
    Xs = feature_scaler.transform(X)

    # --- 3-class stacking with calibrated base models (+ LightGBM if available) ---
    base_models = _build_v3_base_models()
    try:
        oof3, fold_accs3 = _stack_oof_probas(base_models, Xs, y3, classes3, n_splits=3)
    except Exception as e:
        print(f"   WARN: {timeframe_name}: 3-class OOF failed ({e})")
        return None, 0
    filled = oof3.sum(axis=1) > 0
    if filled.sum() < 40:
        return None, 0
    meta3 = LogisticRegression(max_iter=1000, class_weight='balanced', multi_class='auto')
    meta3.fit(oof3[filled], y3[filled])
    honest_acc3 = float(np.median(fold_accs3)) * 100 if fold_accs3 else 0.0

    # Refit 3-class bases on all data for inference
    fitted_bases = []
    for name, m in base_models:
        mm = _clone_estimator(m)
        mm.fit(Xs, y3)
        fitted_bases.append((name, mm))

    # --- Binary UP/DOWN direction head (same features, different target) ---
    fut_ret_full = df['Close'].shift(-timeframe_days) / df['Close'] - 1.0
    y_dir_full   = pd.Series(index=df.index, dtype=object)
    y_dir_full[fut_ret_full > 0]  = 'UP'
    y_dir_full[fut_ret_full <= 0] = 'DOWN'
    y_dir_full[fut_ret_full.isna()] = np.nan
    y_dir = y_dir_full.reindex(d2.index).astype(str).values
    dir_mask = np.isin(y_dir, ['UP', 'DOWN'])
    Xs_dir   = Xs[dir_mask]
    y_dir_f  = y_dir[dir_mask]
    direction_bundle, dir_fold_accs = _train_direction_head(Xs_dir, y_dir_f, feature_scaler)
    honest_acc_dir = float(np.median(dir_fold_accs)) * 100 if dir_fold_accs else 0.0

    # --- Feature importances: train a plain RF for interpretability only ---
    imp = {}
    try:
        rf_raw = RandomForestClassifier(n_estimators=150, max_depth=10, min_samples_leaf=4,
                                        class_weight='balanced', random_state=42, n_jobs=-1)
        rf_raw.fit(Xs, y3)
        imp = dict(zip(avail, rf_raw.feature_importances_))
    except Exception:
        pass

    bundle = {
        'version':            MODEL_VER,
        'features':           avail,
        'scaler':             feature_scaler,
        'base_models':        fitted_bases,
        'meta':               meta3,
        'classes':            list(classes3),
        'accuracy3':          honest_acc3,
        'accuracy_direction': honest_acc_dir,
        'accuracy':           honest_acc3,      # backwards-compat alias
        'fold_accs3':         [round(a*100,1) for a in fold_accs3],
        'fold_accs_direction':[round(a*100,1) for a in dir_fold_accs],
        'fold_accs':          [round(a*100,1) for a in fold_accs3],  # alias
        'direction_bundle':   direction_bundle,
        'importances':        imp,
        'trained_at':         datetime.now().isoformat(),
    }
    joblib.dump(bundle, model_path)
    print(f"   ✅ {timeframe_name}: acc3 {honest_acc3:.1f}% | dir {honest_acc_dir:.1f}% "
          f"(folds3 {bundle['fold_accs3']}, dir {bundle['fold_accs_direction']})")
    return bundle, honest_acc3

CONFIDENCE_THRESHOLD = 0.42   # max-class prob below this → HOLD + lowConfidence=True

def pred_stacked(bundle, df):
    """
    Inference through the stacked ensemble for the latest row.
    Returns (signal, proba_map, low_confidence).
    If the winning class's probability is below CONFIDENCE_THRESHOLD, the signal
    is forced to HOLD and low_confidence is True — honest "model isn't sure".
    """
    avail = bundle['features']
    latest = df[avail].iloc[-1:].dropna(axis=1)
    if latest.shape[1] != len(avail):
        # Any NaN feature in the latest row — fall back to last complete row
        complete = df[avail].dropna()
        if complete.empty:
            return 'HOLD', {'BUY': 0.33, 'SELL': 0.33, 'HOLD': 0.34}, True
        latest = complete.iloc[-1:]
    Xs = bundle['scaler'].transform(latest.values)
    classes = bundle['classes']
    k = len(classes)
    stacked = np.zeros((1, k * len(bundle['base_models'])))
    for j, (_, m) in enumerate(bundle['base_models']):
        proba = np.zeros((1, k))
        for ci, c in enumerate(classes):
            if c in m.classes_:
                proba[0, ci] = m.predict_proba(Xs)[0, list(m.classes_).index(c)]
        stacked[0, j*k:(j+1)*k] = proba
    final_proba = bundle['meta'].predict_proba(stacked)[0]
    meta_classes = list(bundle['meta'].classes_)
    proba_map = {c: float(final_proba[meta_classes.index(c)]) if c in meta_classes else 0.0
                 for c in ['BUY','SELL','HOLD']}
    raw_signal = max(proba_map, key=proba_map.get)
    max_p = max(proba_map.values())
    low_confidence = max_p < CONFIDENCE_THRESHOLD
    signal = 'HOLD' if low_confidence else raw_signal
    return signal, proba_map, low_confidence

def reconcile_signal(classifier_signal, classifier_proba, forecast_chg_pct, strong_threshold=3.0):
    """
    Keep the classifier's call when it agrees with the price forecast; downgrade
    to HOLD when they hard-disagree (e.g. classifier says BUY but forecast is
    strongly negative). This removes the user-hostile "BUY with -17% forecast"
    contradiction — if the two heads don't agree, the honest output is HOLD.
    """
    if forecast_chg_pct is None:
        return classifier_signal, classifier_proba
    if   forecast_chg_pct >  strong_threshold: forecast_signal = 'BUY'
    elif forecast_chg_pct < -strong_threshold: forecast_signal = 'SELL'
    else:                                      forecast_signal = 'HOLD'
    # Hard conflict (BUY vs SELL) → HOLD
    if (classifier_signal == 'BUY'  and forecast_signal == 'SELL') or \
       (classifier_signal == 'SELL' and forecast_signal == 'BUY'):
        return 'HOLD', classifier_proba
    # Classifier directional but forecast neutral → keep classifier (it saw a pattern)
    # Classifier neutral but forecast directional → follow the trend
    if classifier_signal == 'HOLD' and forecast_signal in ('BUY', 'SELL'):
        return forecast_signal, classifier_proba
    return classifier_signal, classifier_proba

# ═══════════════════════════════════════════════════════
# ML MODELS - MULTI TIMEFRAME
# ═══════════════════════════════════════════════════════
def make_labels(df, days=5, buy_th=2.0, sell_th=-2.0):
    fut=df['Close'].shift(-days)/df['Close']-1
    return pd.cut(fut*100,bins=[-np.inf,sell_th,buy_th,np.inf],labels=['SELL','HOLD','BUY'])

def train_rf_for_timeframe(symbol, df, timeframe_days, timeframe_name):
    """Train separate RF model for each timeframe - saved to disk"""
    model_path = os.path.join(MODELS_DIR, f"{symbol}_{timeframe_name}_rf.pkl")
    meta_path  = os.path.join(MODELS_DIR, f"{symbol}_{timeframe_name}_meta.pkl")

    if os.path.exists(model_path) and os.path.exists(meta_path):
        try:
            model = joblib.load(model_path)
            meta  = joblib.load(meta_path)
            print(f"   LOADED saved model for {symbol} {timeframe_name} — accuracy: {meta['accuracy']:.1f}% (FIXED)")
            return model, meta['importances'], meta['accuracy']
        except Exception as e:
            print(f"   WARN: Could not load model, retraining: {e}")

    labels = make_labels(df, days=timeframe_days)
    d2 = df.copy(); d2['Label']=labels; d2.dropna(inplace=True)
    if len(d2) < 60: return None, {}, 0

    avail = [c for c in FEATURES if c in d2.columns]
    X,y   = d2[avail].values, d2['Label'].values
    if len(np.unique(y)) < 2:
        print(f"   WARN: {timeframe_name}: only one label class in dataset, using fallback")
        return None, {}, 0

    sp    = int(len(X)*0.8)
    if sp <= 1 or sp >= len(X):
        return None, {}, 0
    Xtr,Xte,ytr,yte = X[:sp],X[sp:],y[:sp],y[sp:]
    if len(np.unique(ytr)) < 2:
        print(f"   WARN: {timeframe_name}: only one label class in train split, using fallback")
        return None, {}, 0

    rf = RandomForestClassifier(n_estimators=300,max_depth=10,random_state=42,n_jobs=-1)
    gb = GradientBoostingClassifier(n_estimators=150,learning_rate=0.05,max_depth=5,random_state=42)
    try:
        rf.fit(Xtr,ytr); gb.fit(Xtr,ytr)
    except Exception as e:
        print(f"   WARN: {timeframe_name}: model training skipped ({e})")
        return None, {}, 0

    if len(yte) == 0:
        return None, {}, 0
    ra = accuracy_score(yte,rf.predict(Xte))*100
    ga = accuracy_score(yte,gb.predict(Xte))*100
    model = gb if ga>ra else rf
    acc   = max(ra,ga)
    imp   = dict(zip(avail,model.feature_importances_)) if hasattr(model,'feature_importances_') else {}

    joblib.dump(model, model_path)
    joblib.dump({'importances':imp,'accuracy':acc}, meta_path)
    print(f"   {timeframe_name}: {acc:.1f}%")
    return model, imp, acc

def pred_rf(model, df):
    avail  = [c for c in FEATURES if c in df.columns]
    latest = df[avail].iloc[-1:].values
    sig    = model.predict(latest)[0]
    proba  = dict(zip(model.classes_, model.predict_proba(latest)[0]))
    return str(sig), proba

def train_lstm(symbol, df, lb=60, epochs=25):
    if not LSTM_AVAILABLE or len(df)<lb+50: return None,None
    lstm_path   = os.path.join(MODELS_DIR, f"{symbol}_lstm.h5")
    scaler_path = os.path.join(MODELS_DIR, f"{symbol}_scaler.pkl")
    if os.path.exists(lstm_path) and os.path.exists(scaler_path):
        try:
            model = load_model(lstm_path)
            sc    = joblib.load(scaler_path)
            print(f"   LOADED saved LSTM for {symbol} (accuracy FIXED)")
            return model, sc
        except Exception as e:
            print(f"   WARN: Could not load LSTM, retraining: {e}")
    prices=df['Close'].values.reshape(-1,1)
    sc=MinMaxScaler(); scaled=sc.fit_transform(prices)
    X,y=[],[]
    for i in range(lb,len(scaled)):
        X.append(scaled[i-lb:i,0]); y.append(scaled[i,0])
    X=np.array(X).reshape(-1,lb,1); y=np.array(y)
    sp=int(len(X)*0.85)
    model=Sequential([
        Bidirectional(LSTM(64,return_sequences=True,input_shape=(lb,1))),
        Dropout(0.2),LSTM(64),Dropout(0.2),
        Dense(32,activation='relu'),Dense(1)
    ])
    model.compile(optimizer=Adam(0.001),loss='mse')
    cb=EarlyStopping(monitor='val_loss',patience=5,restore_best_weights=True)
    model.fit(X[:sp],y[:sp],epochs=epochs,batch_size=32,validation_split=0.1,callbacks=[cb],verbose=0)
    model.save(lstm_path); joblib.dump(sc,scaler_path)
    return model,sc

def forecast_lstm(model,sc,df,lb=60,days=365):
    """Forecast up to 365 days ahead"""
    if model is None: return None
    scaled=sc.transform(df['Close'].values.reshape(-1,1))
    seq=scaled[-lb:].copy(); preds=[]
    for _ in range(days):
        p=model.predict(seq.reshape(1,lb,1),verbose=0)[0][0]
        preds.append(p)
        seq=np.append(seq[1:],[[p]],axis=0)
    return sc.inverse_transform(np.array(preds).reshape(-1,1)).flatten()

# ═══════════════════════════════════════════════════════
# LSTM v2 — log-return prediction (more stationary than price levels),
# deeper net, trained longer. Autoregressive forecast reapplies returns
# to the last price so long horizons don't drift to a flat-line mean.
# ═══════════════════════════════════════════════════════
LSTM_VER = 'v3'  # bumped — v2 LSTM forecasts collapsed to ~flat (near-zero log-return mean)

def train_lstm_v2(symbol, df, lb=60, epochs=25):
    """
    v3 LSTM — predicts *residual* log-returns (log_return − rolling_252d_mean).
    Why: a vanilla LSTM on raw log-returns minimizes MSE by predicting ≈0,
    which when compounded produces a ~flat forecast. Learning residuals lets
    the model focus on the interesting deviations; we add the drift back at
    inference so the forecast actually moves.
    StandardScaler (not MinMax) so the target has unit variance — gives the
    model more dynamic range to push predictions away from zero.
    """
    if not LSTM_AVAILABLE or len(df) < lb + 100:
        return None, None
    lstm_path   = os.path.join(MODELS_DIR, f"{symbol}_{LSTM_VER}_lstm.h5")
    scaler_path = os.path.join(MODELS_DIR, f"{symbol}_{LSTM_VER}_lstm_sc.pkl")
    if os.path.exists(lstm_path) and os.path.exists(scaler_path):
        try:
            model  = load_model(lstm_path)
            bundle = joblib.load(scaler_path)
            print(f"   LOADED {LSTM_VER} LSTM for {symbol}")
            return model, bundle
        except Exception as e:
            print(f"   WARN: Could not load {LSTM_VER} LSTM, retraining: {e}")

    log_ret = np.log(df['Close'] / df['Close'].shift(1)).dropna().values
    # Rolling 252-day drift (historical annualized trend, per-day)
    rolling_drift = pd.Series(log_ret).rolling(252, min_periods=60).mean().fillna(method='bfill').values
    residual = log_ret - rolling_drift

    sc = StandardScaler()
    scaled = sc.fit_transform(residual.reshape(-1, 1)).flatten()

    X, y = [], []
    for i in range(lb, len(scaled)):
        X.append(scaled[i-lb:i]); y.append(scaled[i])
    X = np.array(X).reshape(-1, lb, 1); y = np.array(y)
    if len(X) < 100:
        return None, None
    sp = int(len(X) * 0.85)

    model = Sequential([
        Bidirectional(LSTM(64, return_sequences=True, input_shape=(lb, 1))),
        Dropout(0.2),
        LSTM(48),
        Dropout(0.2),
        Dense(24, activation='relu'),
        Dense(1),
    ])
    model.compile(optimizer=Adam(0.001), loss='huber')
    cb = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)
    model.fit(X[:sp], y[:sp], epochs=epochs, batch_size=64,
              validation_split=0.1, callbacks=[cb], verbose=0)

    # Save the drift with the scaler so inference can re-add it
    recent_drift = float(np.mean(log_ret[-252:])) if len(log_ret) >= 252 else float(np.mean(log_ret))
    bundle = {'scaler': sc, 'drift': recent_drift, 'version': LSTM_VER}
    model.save(lstm_path)
    joblib.dump(bundle, scaler_path)
    print(f"   {LSTM_VER} LSTM trained (drift={recent_drift*252*100:.1f}%/yr)")
    return model, bundle

def forecast_lstm_v2(model, bundle, df, lb=60, days=365):
    """
    Blended multi-step price forecast.

    Why not pure autoregressive LSTM? An LSTM trained on daily log-returns
    minimizes MSE by predicting ≈0 — perfectly rational but compounds to a
    flat forecast. That's the dreaded "LSTM predicts tomorrow = today"
    result that plagues most stock-LSTM tutorials. Residualizing helped a
    little but for sideways-trending stocks the 252d drift is ~0 too.

    Instead:
      • Base trajectory uses RECENT 60-day daily log-return mean (mu) — this
        is the honest trend extrapolation. If the stock has been rising +15%
        annualized, the forecast rises +15% annualized.
      • The LSTM contributes a *short-term residual perturbation* for the
        first ~30 days only (where it has any chance of useful signal).
        Beyond day 30 the perturbation decays linearly to 0 — we stop
        pretending the LSTM knows anything about month+ ahead.
      • Daily perturbation clamped tight (±3%) so a single bad LSTM step
        can't derail the whole forecast.

    Result: forecasts actually move in a sensible direction and magnitude,
    grounded in recent regime, with ML contributing short-term texture.
    """
    if bundle is None:
        return None
    sc = bundle['scaler'] if isinstance(bundle, dict) else bundle

    log_ret = np.log(df['Close'] / df['Close'].shift(1)).dropna().values
    if len(log_ret) < lb:
        return None

    # Horizon-adaptive drift: extrapolating the last 3-month trend into a 1-year
    # forecast is how you get an "LSTM predicts -17% over a year" artifact.
    # Blend recent (60d) and longer-term (252d) drifts — recent dominates early,
    # long-term dominates late, with a smooth half-year crossover.
    mu_short  = float(np.mean(log_ret[-min(60,  len(log_ret)):]))
    mu_long_n = min(252, len(log_ret))
    mu_long   = float(np.mean(log_ret[-mu_long_n:])) if mu_long_n > 0 else mu_short

    # Short-horizon LSTM residual perturbation (first ~30 days)
    lstm_perturb = np.zeros(days)
    if model is not None and LSTM_AVAILABLE:
        try:
            rolling_drift = pd.Series(log_ret).rolling(252, min_periods=60).mean()
            rolling_drift = rolling_drift.bfill().values
            residual_seed = (log_ret - rolling_drift)[-lb:]
            seq = sc.transform(residual_seed.reshape(-1, 1)).flatten()
            horizon = min(30, days)
            for t in range(horizon):
                r_scaled = model.predict(seq.reshape(1, lb, 1), verbose=0)[0][0]
                residual = float(sc.inverse_transform(np.array([[r_scaled]]))[0][0])
                # Linear decay so late-horizon LSTM noise doesn't dominate
                decay = 1.0 - (t / horizon)
                lstm_perturb[t] = float(np.clip(residual * decay, -0.03, 0.03))
                seq = np.append(seq[1:], [r_scaled])
        except Exception as e:
            print(f"   WARN: LSTM perturbation failed, using drift-only: {e}")

    last_price = float(df['Close'].iloc[-1])
    prices     = []
    cum_log    = 0.0
    for t in range(days):
        # Day t: mix short/long drift — weight short near t=0, long near t=180+.
        w_short   = max(0.0, 1.0 - t / 180.0)
        mu_t      = w_short * mu_short + (1.0 - w_short) * mu_long
        cum_log  += mu_t + lstm_perturb[t]
        prices.append(last_price * float(np.exp(cum_log)))
    return np.array(prices)

def get_ind_signals(df):
    row=df.iloc[-1]; close=float(row['Close']); sigs=[]
    rsi=float(row.get('RSI',50))
    sigs.append({'name':'RSI(14)','value':f'{rsi:.1f}',
        'signal':'BUY' if rsi<30 else 'SELL' if rsi>70 else 'HOLD',
        'reason':'Oversold (<30)' if rsi<30 else 'Overbought (>70)' if rsi>70 else f'Neutral ({rsi:.0f})'})
    macd=float(row.get('MACD',0)); ms=float(row.get('MACD_Signal',0))
    sigs.append({'name':'MACD','value':f'{macd:.3f}',
        'signal':'BUY' if macd>ms else 'SELL',
        'reason':'Bullish crossover ▲' if macd>ms else 'Bearish crossover ▼'})
    bb=float(row.get('BB_Pct',0.5))
    sigs.append({'name':'Bollinger Band','value':f'{bb:.2f}',
        'signal':'BUY' if bb<0.2 else 'SELL' if bb>0.8 else 'HOLD',
        'reason':'Near lower band' if bb<0.2 else 'Near upper band' if bb>0.8 else 'Mid range'})
    sk=float(row.get('Stoch_K',50))
    sigs.append({'name':'Stochastic','value':f'{sk:.1f}',
        'signal':'BUY' if sk<20 else 'SELL' if sk>80 else 'HOLD',
        'reason':'Oversold' if sk<20 else 'Overbought' if sk>80 else 'Neutral'})
    cci=float(row.get('CCI',0))
    sigs.append({'name':'CCI(20)','value':f'{cci:.1f}',
        'signal':'BUY' if cci<-100 else 'SELL' if cci>100 else 'HOLD',
        'reason':'Oversold' if cci<-100 else 'Overbought' if cci>100 else 'Neutral'})
    wr=float(row.get('Williams_R',-50))
    sigs.append({'name':'Williams %R','value':f'{wr:.1f}',
        'signal':'BUY' if wr<-80 else 'SELL' if wr>-20 else 'HOLD',
        'reason':'Oversold' if wr<-80 else 'Overbought' if wr>-20 else 'Neutral'})
    for ma in [20,50,200]:
        val=float(row.get(f'MA_{ma}',close))
        sigs.append({'name':f'MA {ma}','value':f'₹{val:.2f}',
            'signal':'BUY' if close>val else 'SELL',
            'reason':f'Price {"above" if close>val else "below"} MA{ma}'})
    vr=float(row.get('Volume_Ratio',1))
    sigs.append({'name':'Volume','value':f'{vr:.2f}x avg',
        'signal':'BUY' if vr>1.5 else 'SELL' if vr<0.5 else 'HOLD',
        'reason':'High volume confirms' if vr>1.5 else 'Low volume weak' if vr<0.5 else 'Normal'})
    mom=float(row.get('Momentum_10',0))
    sigs.append({'name':'Momentum','value':f'{mom:.2f}',
        'signal':'BUY' if mom>0 else 'SELL','reason':'Positive ↑' if mom>0 else 'Negative ↓'})
    return sigs

# ═══════════════════════════════════════════════════════════════════════════════
# MEGA-ENSEMBLE FORECASTING ENGINE
# ═══════════════════════════════════════════════════════════════════════════════
# Architecture:
#   Layer 1 — Regression base learners (predict actual % return, not BUY/HOLD/SELL):
#       • XGBoost Regressor        (gradient boosted trees, L2 regularised)
#       • LightGBM Regressor       (leaf-wise boosting, faster + better on skewed data)
#       • Random Forest Regressor  (bagging, low variance)
#       • Gradient Boosting Regr.  (sklearn, robust baseline)
#   Layer 2 — Ridge meta-learner  (stacks Layer 1 OOF predictions, avoids overfit)
#   Layer 3 — GARCH(1,1) volatility model (proper statistical vol, not historical std)
#   Layer 4 — Monte Carlo (1000 paths × 365 days) → 5/50/95 percentile price bands
# ═══════════════════════════════════════════════════════════════════════════════

MEGA_MODEL_VER = 'mega_v1'

def add_mega_features(df):
    """
    Extended feature set on top of existing indicators. Adds:
    - ADX (trend strength)
    - Ichimoku components (Tenkan, Kijun, Senkou spans)
    - OBV and OBV momentum
    - Chaikin Money Flow (CMF)
    - Fibonacci retracement proximity
    - Realised volatility at multiple horizons
    - Higher-order momentum (acceleration)
    """
    df = df.copy()
    c, h, l, v = df['Close'], df['High'], df['Low'], df['Volume']

    # ── ADX (Average Directional Index) ─────────────────────────
    try:
        up_move  = h.diff()
        dn_move  = -l.diff()
        plus_dm  = np.where((up_move > dn_move) & (up_move > 0), up_move, 0.0)
        minus_dm = np.where((dn_move > up_move) & (dn_move > 0), dn_move, 0.0)
        tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
        atr14 = tr.ewm(span=14, adjust=False).mean()
        plus_di  = 100 * pd.Series(plus_dm,  index=df.index).ewm(span=14, adjust=False).mean() / (atr14 + 1e-10)
        minus_di = 100 * pd.Series(minus_dm, index=df.index).ewm(span=14, adjust=False).mean() / (atr14 + 1e-10)
        dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-10)
        df['ADX'] = dx.ewm(span=14, adjust=False).mean()
        df['DI_Plus']  = plus_di
        df['DI_Minus'] = minus_di
    except Exception:
        df['ADX'] = 25.0
        df['DI_Plus'] = df['DI_Minus'] = 25.0

    # ── Ichimoku ────────────────────────────────────────────────
    try:
        tenkan  = (h.rolling(9).max()  + l.rolling(9).min())  / 2
        kijun   = (h.rolling(26).max() + l.rolling(26).min()) / 2
        senkou_a = (tenkan + kijun) / 2
        senkou_b = (h.rolling(52).max() + l.rolling(52).min()) / 2
        df['Ichimoku_Above_Cloud'] = ((c > senkou_a) & (c > senkou_b)).astype(float)
        df['Ichimoku_TK_Cross']    = (tenkan > kijun).astype(float)
        df['Ichimoku_Dist_Kijun']  = (c - kijun) / (kijun + 1e-10) * 100
    except Exception:
        df['Ichimoku_Above_Cloud'] = df['Ichimoku_TK_Cross'] = 0.0
        df['Ichimoku_Dist_Kijun'] = 0.0

    # ── OBV (On-Balance Volume) ──────────────────────────────────
    try:
        obv = (np.sign(c.diff()) * v).fillna(0).cumsum()
        obv_ma = obv.rolling(20).mean()
        df['OBV_Slope']  = (obv - obv.shift(10)) / (obv.shift(10).abs() + 1e-10)
        df['OBV_vs_MA']  = (obv - obv_ma) / (obv_ma.abs() + 1e-10)
    except Exception:
        df['OBV_Slope'] = df['OBV_vs_MA'] = 0.0

    # ── Chaikin Money Flow (CMF) ─────────────────────────────────
    try:
        mfm = ((c - l) - (h - c)) / (h - l + 1e-10)
        mfv = mfm * v
        df['CMF'] = mfv.rolling(20).sum() / (v.rolling(20).sum() + 1e-10)
    except Exception:
        df['CMF'] = 0.0

    # ── Fibonacci Retracement Proximity ─────────────────────────
    try:
        high52 = h.rolling(252, min_periods=50).max()
        low52  = l.rolling(252, min_periods=50).min()
        rng    = high52 - low52
        fib382 = high52 - 0.382 * rng
        fib500 = high52 - 0.500 * rng
        fib618 = high52 - 0.618 * rng
        df['Fib_Dist_382'] = (c - fib382) / (rng + 1e-10) * 100
        df['Fib_Dist_618'] = (c - fib618) / (rng + 1e-10) * 100
        df['Fib_Zone']     = (
            (c.between(fib618 * 0.99, fib618 * 1.01) |
             c.between(fib500 * 0.99, fib500 * 1.01) |
             c.between(fib382 * 0.99, fib382 * 1.01)).astype(float))
    except Exception:
        df['Fib_Dist_382'] = df['Fib_Dist_618'] = df['Fib_Zone'] = 0.0

    # ── Realised Volatility (multiple horizons) ──────────────────
    try:
        log_ret = np.log(c / c.shift(1))
        df['RVol_5d']  = log_ret.rolling(5).std()  * np.sqrt(252)
        df['RVol_21d'] = log_ret.rolling(21).std() * np.sqrt(252)
        df['RVol_63d'] = log_ret.rolling(63).std() * np.sqrt(252)
        df['Vol_Regime'] = (df['RVol_5d'] > df['RVol_63d']).astype(float)  # 1 = high-vol regime
    except Exception:
        df['RVol_5d'] = df['RVol_21d'] = df['RVol_63d'] = 0.2
        df['Vol_Regime'] = 0.0

    # ── Momentum Acceleration ────────────────────────────────────
    try:
        mom5  = c.pct_change(5)
        mom10 = c.pct_change(10)
        df['Mom_Accel'] = mom5 - mom10 / 2.0  # acceleration = short minus half long
    except Exception:
        df['Mom_Accel'] = 0.0

    df.replace([np.inf, -np.inf], np.nan, inplace=True)
    return df

MEGA_FEATURES = [
    # Original features
    'RSI','MACD','MACD_Signal','MACD_Hist','BB_Pct','Stoch_K','Stoch_D',
    'CCI','Williams_R','Momentum_10','ROC_12','Volume_Ratio','ATR',
    'Vs_MA20','Vs_MA50','Vs_MA200','Return_1d','Return_5d','Return_20d','HL_Spread',
    # V2 features
    'Log_Volume','Gap_Pct','Intraday_Range','Near_52W_High','Near_52W_Low',
    'Vol_20','Vol_60','Trend_Strength',
    'Nifty_Ret_5d','Nifty_Ret_20d','Nifty_Vol_20','Rel_Strength_20','Beta_60',
    'Volume_Shock_20','Gap_Shock_20','Sector_Ret_20',
    # Mega features
    'ADX','DI_Plus','DI_Minus',
    'Ichimoku_Above_Cloud','Ichimoku_TK_Cross','Ichimoku_Dist_Kijun',
    'OBV_Slope','OBV_vs_MA','CMF',
    'Fib_Dist_382','Fib_Dist_618','Fib_Zone',
    'RVol_5d','RVol_21d','RVol_63d','Vol_Regime','Mom_Accel',
]


def train_mega_ensemble(symbol, df, timeframe_days, timeframe_name):
    """
    Regression ensemble that predicts the actual forward % return
    (not BUY/HOLD/SELL class), then stacks with Ridge meta-learner.
    Cached to disk with MEGA_MODEL_VER suffix.
    Returns (bundle, rmse, direction_accuracy).
    """
    model_path = os.path.join(MODELS_DIR, f"{symbol}_{timeframe_name}_{MEGA_MODEL_VER}.pkl")
    if os.path.exists(model_path):
        try:
            b = joblib.load(model_path)
            print(f"   LOADED mega model {symbol} {timeframe_name} | dir_acc {b.get('dir_acc',0):.1f}%")
            return b, b.get('dir_acc', 0)
        except Exception as e:
            print(f"   WARN: reload mega failed, retraining: {e}")

    # ── Target: actual forward log-return ────────────────────────
    log_ret_fwd = np.log(df['Close'].shift(-timeframe_days) / df['Close'])

    d2 = df.copy()
    d2['_target'] = log_ret_fwd
    d2 = d2.dropna(subset=['_target'])

    avail = [c for c in MEGA_FEATURES if c in d2.columns]
    d2 = d2.dropna(subset=avail)
    if len(d2) < 150:
        print(f"   WARN: {timeframe_name} not enough data ({len(d2)} rows) for mega ensemble")
        return None, 0

    X = d2[avail].values
    y = d2['_target'].values
    scaler = StandardScaler().fit(X)
    Xs = scaler.transform(X)

    # ── Walk-forward OOF predictions (TimeSeriesSplit) ────────────
    tscv = TimeSeriesSplit(n_splits=5)
    n = len(Xs)
    oof_preds = {}
    base_names = ['rf', 'gb']
    if XGBOOST_AVAILABLE:  base_names.append('xgb')
    if LIGHTGBM_AVAILABLE: base_names.append('lgbm')

    for nm in base_names:
        oof_preds[nm] = np.zeros(n)

    dir_correct = []

    for fold_i, (tr, te) in enumerate(tscv.split(Xs)):
        if len(tr) < 80:
            continue
        fold_models = {}

        # Random Forest Regressor
        rf = RandomForestRegressor(n_estimators=300, max_depth=8, min_samples_leaf=5,
                                   random_state=42, n_jobs=-1)
        rf.fit(Xs[tr], y[tr]); fold_models['rf'] = rf
        oof_preds['rf'][te] = rf.predict(Xs[te])

        # Gradient Boosting Regressor
        gb = GradientBoostingRegressor(n_estimators=150, learning_rate=0.05,
                                       max_depth=3, random_state=42)
        gb.fit(Xs[tr], y[tr]); fold_models['gb'] = gb
        oof_preds['gb'][te] = gb.predict(Xs[te])

        if XGBOOST_AVAILABLE:
            xgb = XGBRegressor(n_estimators=500, learning_rate=0.03, max_depth=4,
                                subsample=0.8, colsample_bytree=0.8,
                                reg_alpha=0.1, reg_lambda=1.0,
                                random_state=42, n_jobs=-1, verbosity=0)
            xgb.fit(Xs[tr], y[tr],
                    eval_set=[(Xs[te], y[te])],
                    verbose=False)
            oof_preds['xgb'][te] = xgb.predict(Xs[te])
            fold_models['xgb'] = xgb

        if LIGHTGBM_AVAILABLE and LGBMRegressor is not None:
            lgbm = LGBMRegressor(n_estimators=500, num_leaves=31, learning_rate=0.03,
                                  min_child_samples=20, subsample=0.8,
                                  random_state=42, n_jobs=-1, verbose=-1)
            lgbm.fit(Xs[tr], y[tr])
            oof_preds['lgbm'][te] = lgbm.predict(Xs[te])
            fold_models['lgbm'] = lgbm

        # Track direction accuracy in this fold
        avg_te = np.mean([oof_preds[nm][te] for nm in base_names], axis=0)
        correct = np.sign(avg_te) == np.sign(y[te])
        dir_correct.extend(correct.tolist())

    # ── Stacking meta-learner (Ridge) ─────────────────────────────
    oof_matrix = np.column_stack([oof_preds[nm] for nm in base_names])
    # Only use rows where ALL base models predicted (non-zero in OOF)
    valid_mask = np.all(oof_matrix != 0, axis=1)
    if valid_mask.sum() < 40:
        valid_mask = np.ones(n, dtype=bool)
    meta = Ridge(alpha=1.0)
    meta.fit(oof_matrix[valid_mask], y[valid_mask])

    # ── Refit base models on ALL data for inference ───────────────
    fitted_bases = {}
    rf_f = RandomForestRegressor(n_estimators=300, max_depth=8, min_samples_leaf=5,
                                  random_state=42, n_jobs=-1)
    rf_f.fit(Xs, y); fitted_bases['rf'] = rf_f

    gb_f = GradientBoostingRegressor(n_estimators=150, learning_rate=0.05,
                                      max_depth=3, random_state=42)
    gb_f.fit(Xs, y); fitted_bases['gb'] = gb_f

    if XGBOOST_AVAILABLE:
        xgb_f = XGBRegressor(n_estimators=500, learning_rate=0.03, max_depth=4,
                              subsample=0.8, colsample_bytree=0.8,
                              reg_alpha=0.1, reg_lambda=1.0,
                              random_state=42, n_jobs=-1, verbosity=0)
        xgb_f.fit(Xs, y); fitted_bases['xgb'] = xgb_f

    if LIGHTGBM_AVAILABLE and LGBMRegressor is not None:
        lgbm_f = LGBMRegressor(n_estimators=500, num_leaves=31, learning_rate=0.03,
                                min_child_samples=20, subsample=0.8,
                                random_state=42, n_jobs=-1, verbose=-1)
        lgbm_f.fit(Xs, y); fitted_bases['lgbm'] = lgbm_f

    dir_acc = float(np.mean(dir_correct)) * 100 if dir_correct else 50.0
    oof_rmse = float(np.sqrt(np.mean((meta.predict(oof_matrix[valid_mask]) - y[valid_mask])**2)))

    bundle = {
        'version':      MEGA_MODEL_VER,
        'features':     avail,
        'scaler':       scaler,
        'bases':        fitted_bases,
        'base_names':   base_names,
        'meta':         meta,
        'dir_acc':      dir_acc,
        'oof_rmse':     oof_rmse,
        'trained_at':   datetime.now().isoformat(),
        'n_samples':    n,
    }
    joblib.dump(bundle, model_path)
    print(f"   MEGA {timeframe_name}: dir_acc {dir_acc:.1f}% | oof_rmse {oof_rmse:.4f} | samples {n}")
    return bundle, dir_acc


def predict_mega(bundle, df):
    """Run inference through the stacked mega-ensemble. Returns predicted log-return."""
    avail  = bundle['features']
    latest = df[avail].dropna().iloc[-1:]
    if latest.empty:
        return 0.0
    Xs = bundle['scaler'].transform(latest.values)
    preds = [bundle['bases'][nm].predict(Xs)[0] for nm in bundle['base_names'] if nm in bundle['bases']]
    if not preds:
        return 0.0
    oof_row = np.array(preds).reshape(1, -1)
    # Pad if meta was trained on more columns
    if oof_row.shape[1] < bundle['meta'].coef_.shape[0]:
        pad = np.zeros((1, bundle['meta'].coef_.shape[0] - oof_row.shape[1]))
        oof_row = np.hstack([oof_row, pad])
    return float(bundle['meta'].predict(oof_row)[0])


# ══════════════════════════════════════════════════════════════════════
# INTELLIGENCE LAYER  — Fundamentals + News Sentiment + FII/DII Flows
# ══════════════════════════════════════════════════════════════════════

import time as _time

# ── VADER Sentiment Analyser (lazy-loaded once) ────────────────────────
_VADER_SID        = None
_VADER_AVAILABLE  = False
try:
    import nltk as _nltk
    try:
        _nltk.data.find('sentiment/vader_lexicon.zip')
    except LookupError:
        _nltk.download('vader_lexicon', quiet=True)
    from nltk.sentiment.vader import SentimentIntensityAnalyzer as _VSIA
    _VADER_SID       = _VSIA()
    _VADER_AVAILABLE = True
    print("   [Intel] VADER sentiment: READY")
except Exception as _e:
    print(f"   [Intel] VADER not available: {_e}")

# ── FII/DII Flow Cache ─────────────────────────────────────────────────
_FII_CACHE     = {'data': None, 'ts': 0.0}
_FII_CACHE_TTL = 3600   # 1 hour

def fetch_fii_dii_flows():
    """
    Fetch FII + DII net flows from NSE India API.
    NSE returns rows with {category, buyValue, sellValue, netValue, date}.
    Each row is one institution type for the latest trading day.
    Returns dict: {fii_net_cr, dii_net_cr, combined_5d, date, source}
    Cached for 1 hour.
    """
    global _FII_CACHE
    now = _time.time()
    if _FII_CACHE['data'] is not None and (now - _FII_CACHE['ts']) < _FII_CACHE_TTL:
        return _FII_CACHE['data']

    try:
        import requests as _req
        sess = _req.Session()
        # NSE requires a proper browser session first
        sess.get('https://www.nseindia.com/', timeout=8, headers={
            'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                           'AppleWebKit/537.36 Chrome/120 Safari/537.36'),
            'Accept': 'text/html,application/xhtml+xml',
        })
        resp = sess.get(
            'https://www.nseindia.com/api/fiidiiTradeReact',
            timeout=8,
            headers={
                'User-Agent': ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                               'AppleWebKit/537.36 Chrome/120 Safari/537.36'),
                'Accept':   'application/json',
                'Referer':  'https://www.nseindia.com/market-data/fii-dii-activity',
            }
        )
        if resp.status_code == 200:
            rows = resp.json()   # List of {buyValue, sellValue, netValue, category, date}

            def _sf(v):
                """Safe parse: '1,234.56' -> 1234.56"""
                try:    return float(str(v).replace(',', '').strip())
                except: return 0.0

            fii_net = 0.0
            dii_net = 0.0
            latest_date = ''

            # NSE returns one row per category (FII/FPI, DII) per day
            # Sum all rows by category
            for row in rows:
                cat  = str(row.get('category', '')).upper()
                net  = _sf(row.get('netValue', 0))
                date = row.get('date', '')
                if 'FII' in cat or 'FPI' in cat:
                    fii_net += net
                    latest_date = date
                elif 'DII' in cat:
                    dii_net += net
                    if not latest_date:
                        latest_date = date

            result = {
                'fii_5d_net_cr': round(fii_net, 1),
                'dii_5d_net_cr': round(dii_net, 1),
                'combined_5d':   round(fii_net + dii_net, 1),
                'latest_date':   latest_date,
                'source':        'nse',
                'rows_parsed':   len(rows),
            }
            _FII_CACHE = {'data': result, 'ts': now}
            print(f"   [Intel] FII/DII ({latest_date}): FII={fii_net:+.0f}Cr  DII={dii_net:+.0f}Cr")
            return result
    except Exception as _e:
        print(f"   [Intel] FII/DII fetch failed: {_e}")

    neutral = {'fii_5d_net_cr': 0.0, 'dii_5d_net_cr': 0.0,
               'combined_5d': 0.0, 'latest_date': '', 'source': 'fallback'}
    _FII_CACHE = {'data': neutral, 'ts': now}
    return neutral


def get_news_sentiment(symbol):
    """
    Fetch last 8 news headlines for a stock via yfinance and score
    each with VADER compound score.  Returns weighted average in [-1, +1].
    Handles both old yfinance format (item['title']) and new format
    (item['content']['title']).
    """
    if not _VADER_AVAILABLE or _VADER_SID is None:
        return 0.0, []
    try:
        import yfinance as _yf
        ticker = _yf.Ticker(symbol + '.NS')
        news   = ticker.news or []
        scored = []
        for item in news[:10]:
            # New yfinance format: item = {'id':..., 'content': {'title':..., ...}}
            if isinstance(item, dict):
                content = item.get('content', {})
                title   = (content.get('title', '') or
                           content.get('summary', '') or
                           item.get('title', '') or
                           item.get('headline', ''))
            else:
                title = str(item)
            title = str(title).strip()
            if not title or len(title) < 5:
                continue
            sc = _VADER_SID.polarity_scores(title)['compound']
            scored.append({'title': title[:120], 'score': round(sc, 3)})
            if len(scored) >= 8:
                break
        if not scored:
            print(f"   [Intel] No news titles found for {symbol} (raw count={len(news)})")
            return 0.0, []
        weights   = [1.0 / (i + 1) for i in range(len(scored))]
        sentiment = sum(s['score'] * w for s, w in zip(scored, weights)) / sum(weights)
        sentiment = float(np.clip(sentiment, -1.0, 1.0))
        print(f"   [Intel] News sentiment={sentiment:+.3f}  ({len(scored)} headlines)")
        return sentiment, scored
    except Exception as _e:
        print(f"   [Intel] News error for {symbol}: {_e}")
        return 0.0, []


# Sector P/E benchmarks (NSE/India context)
_SECTOR_PE = {
    'Technology': 28,          'Information Technology': 28,
    'Financial Services': 18,  'Financials': 18, 'Banking': 16,
    'Energy': 14,              'Oil & Gas': 14,
    'Consumer Cyclical': 22,   'Consumer Discretionary': 22,
    'Healthcare': 25,          'Pharmaceuticals': 25,
    'Industrials': 20,         'Capital Goods': 20,
    'Basic Materials': 16,     'Metals & Mining': 14,
    'Consumer Defensive': 24,  'Consumer Staples': 24,
    'Utilities': 20,           'Real Estate': 30,
    'Communication Services': 22, 'Telecom': 18,
    'Automobile': 22,
}

def get_fundamental_alpha(symbol):
    """
    Compute fundamental-based annual return signal from yfinance .info data.
    Combines: EPS growth, revenue growth, profit margin, P/E vs sector,
              debt-to-equity, return-on-equity.
    Returns (alpha_annualised, metrics_dict).
    alpha_annualised is in log-return space, clipped to [-0.20, +0.20].
    """
    try:
        import yfinance as _yf
        info = _yf.Ticker(symbol + '.NS').info
        comps = []

        # 1. EPS growth YoY  (positive growth = bullish alpha)
        eg = info.get('earningsGrowth', None)
        if isinstance(eg, (int, float)) and not np.isnan(eg):
            comps.append(float(np.clip(eg * 0.20, -0.10, 0.10)))

        # 2. Revenue growth
        rg = info.get('revenueGrowth', None)
        if isinstance(rg, (int, float)) and not np.isnan(rg):
            comps.append(float(np.clip(rg * 0.12, -0.07, 0.07)))

        # 3. Profit margin quality premium
        pm = info.get('profitMargins', None)
        if isinstance(pm, (int, float)) and not np.isnan(pm):
            comps.append(float(np.clip((pm - 0.10) * 0.18, -0.04, 0.04)))

        # 4. P/E discount vs sector benchmark
        pe  = info.get('trailingPE', None)
        sec = info.get('sector', 'Unknown')
        bpe = _SECTOR_PE.get(sec, 22)
        if isinstance(pe, (int, float)) and pe > 0 and not np.isnan(pe):
            discount = (bpe - pe) / bpe
            comps.append(float(np.clip(discount * 0.10, -0.07, 0.07)))

        # 5. Debt-to-equity (high D/E = risk penalty)
        de = info.get('debtToEquity', None)
        if isinstance(de, (int, float)) and not np.isnan(de):
            comps.append(float(np.clip(0.015 - de * 0.008, -0.03, 0.02)))

        # 6. Return on equity quality signal
        roe = info.get('returnOnEquity', None)
        if isinstance(roe, (int, float)) and not np.isnan(roe):
            comps.append(float(np.clip((roe - 0.12) * 0.15, -0.03, 0.04)))

        alpha = float(np.clip(np.mean(comps) if comps else 0.0, -0.20, 0.20))

        metrics = {
            'eps_growth':    eg,
            'rev_growth':    rg,
            'profit_margin': pm,
            'pe_ratio':      pe,
            'fwd_pe':        info.get('forwardPE', None),
            'de_ratio':      de,
            'roe':           roe,
            'sector':        sec,
            'market_cap':    info.get('marketCap', None),
            'dividend_yield':info.get('dividendYield', None),
            'fund_alpha_pct':round(alpha * 100, 2),
            'components':    len(comps),
        }
        print(f"   [Intel] Fund alpha={alpha*100:+.2f}%  EPS_g={eg}  P/E={pe}  ROE={roe}")
        return alpha, metrics

    except Exception as _e:
        print(f"   [Intel] Fundamental error for {symbol}: {_e}")
        return 0.0, {}


def garch_volatility(df, horizon_days):
    """
    Fit GARCH(1,1) on daily log-returns and forecast horizon_days-ahead volatility.
    Falls back to realised vol if arch not available or fitting fails.
    Returns annualised volatility as a decimal (e.g. 0.28 = 28%/year).
    """
    log_ret = np.log(df['Close'] / df['Close'].shift(1)).dropna() * 100  # in % for GARCH
    if ARCH_AVAILABLE and len(log_ret) >= 200:
        try:
            am = arch_model(log_ret.tail(500), vol='GARCH', p=1, q=1, dist='Normal')
            res = am.fit(disp='off', show_warning=False)
            fc  = res.forecast(horizon=horizon_days, reindex=False)
            # Mean variance over horizon
            var_pct = float(fc.variance.iloc[-1].mean())
            daily_vol_pct = float(np.sqrt(max(var_pct, 0.01)))  # % per day
            return (daily_vol_pct / 100.0) * np.sqrt(252)       # annualised decimal
        except Exception as e:
            print(f"   GARCH fit failed ({e}), using realised vol")
    # Fallback: 63-day realised vol, annualised
    rv = float(log_ret.tail(63).std()) / 100.0 * np.sqrt(252)
    return max(rv, 0.05)  # floor at 5%/year


def monte_carlo_forecast(cur_price, mega_log_ret, annual_vol, days, n_paths=1000, seed=42):
    """
    Monte Carlo simulation of price paths combining:
      - Drift from mega-ensemble predicted log-return (annualised)
      - Volatility from GARCH(1,1) forecast
      - GBM (Geometric Brownian Motion) with daily noise

    Returns dict with base/bull/bear prices per milestone day, plus 30-day daily arrays.
    """
    rng = np.random.default_rng(seed)
    daily_vol   = annual_vol / np.sqrt(252)
    # Convert mega return (total over horizon) to daily drift equivalent
    daily_drift = mega_log_ret / max(days, 1)

    # Simulate n_paths × days GBM price paths
    shocks = rng.normal(0.0, daily_vol, size=(n_paths, days))
    log_rets_sim = daily_drift + shocks
    # Cumulative log-return → price path
    cum_log = np.cumsum(log_rets_sim, axis=1)
    price_paths = cur_price * np.exp(cum_log)   # shape (n_paths, days)

    milestones = {
        'tomorrow':   0,
        'next_week':  4,
        'next_month': 20,
        'next_3m':    62,
        'next_year':  min(251, days - 1),
    }
    results = {}
    for key, idx in milestones.items():
        if idx >= days:
            idx = days - 1
        col = price_paths[:, idx]
        base  = float(np.median(col))
        bull  = float(np.percentile(col, 75))   # 75th = optimistic
        bear  = float(np.percentile(col, 25))   # 25th = pessimistic
        bull95 = float(np.percentile(col, 95))
        bear5  = float(np.percentile(col, 5))
        chg   = base - cur_price
        chgp  = chg / cur_price * 100 if cur_price else 0
        results[key] = {
            'price':         round(base, 2),
            'change':        round(chg, 2),
            'changePercent': round(chgp, 2),
            'bullTarget':    round(bull, 2),
            'bearTarget':    round(bear, 2),
            'bull95':        round(bull95, 2),
            'bear5':         round(bear5, 2),
            'horizonVol':    round(daily_vol * np.sqrt(idx + 1) * 100, 2),
            'signal': 'BUY' if chgp > 1 else 'SELL' if chgp < -1 else 'HOLD',
        }

    # 30-day daily base/bull/bear arrays for the chart
    daily_chart = []
    for i in range(min(30, days)):
        col = price_paths[:, i]
        daily_chart.append({
            'day':   f'Day {i+1}',
            'date':  (datetime.now() + timedelta(days=i+1)).strftime('%d %b'),
            'price': round(float(np.median(col)), 2),
            'bull':  round(float(np.percentile(col, 75)), 2),
            'bear':  round(float(np.percentile(col, 25)), 2),
        })

    return results, daily_chart

# ═══════════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════
# COMPLETE FINANCIAL DATA FROM YAHOO

# ═══════════════════════════════════════════════════════
def sg(info, *keys, default=None):
    """Safe get — tries multiple Yahoo Finance key names, returns first valid value"""
    for k in keys:
        v = info.get(k)
        if v is not None and v != 0 and v != '' and str(v) != 'nan':
            try:
                if float(str(v)) != 0:
                    return v
            except:
                return v
    return default

def get_full_financials(symbol):
    """Get ALL available financial data from Yahoo Finance with fallback keys"""
    try:
        t    = yf.Ticker(f"{symbol}.NS")
        info = t.info
        hist = t.history(period='5d')
        cur  = float(hist['Close'].iloc[-1]) if not hist.empty else 0
        prev = float(hist['Close'].iloc[-2]) if len(hist)>1 else cur
        pc   = sg(info,'previousClose','regularMarketPreviousClose') or prev

        return {
            # Price data — tries multiple Yahoo Finance key names
            'currentPrice':    sg(info,'currentPrice','regularMarketPrice','navPrice') or cur,
            'previousClose':   pc,
            'open':            sg(info,'open','regularMarketOpen','openPrice'),
            'dayHigh':         sg(info,'dayHigh','regularMarketDayHigh','highPrice'),
            'dayLow':          sg(info,'dayLow','regularMarketDayLow','lowPrice'),
            'change':          round(cur - pc, 2),
            'changePercent':   round((cur - pc) / pc * 100, 2) if pc else 0,
            'volume':          sg(info,'volume','regularMarketVolume','tradingVolume'),
            'avgVolume':       sg(info,'averageVolume','averageDailyVolume10Day','averageVolume10days'),
            'avgVolume3m':     sg(info,'averageDailyVolume3Month','averageVolume3Month'),

            # 52 week
            'week52High':      sg(info,'fiftyTwoWeekHigh','52WeekHigh','yearHigh'),
            'week52Low':       sg(info,'fiftyTwoWeekLow','52WeekLow','yearLow'),
            'fiftyDayAvg':     sg(info,'fiftyDayAverage','50DayAverage'),
            'twoHundredDayAvg':sg(info,'twoHundredDayAverage','200DayAverage'),

            # Company info
            'name':            sg(info,'longName','shortName') or symbol,
            'sector':          info.get('sector','N/A'),
            'industry':        info.get('industry','N/A'),
            'country':         info.get('country','India'),
            'employees':       sg(info,'fullTimeEmployees','numberOfEmployees'),
            'description':     (info.get('longBusinessSummary','') or '')[:600],
            'website':         info.get('website',''),

            # Valuation
            'marketCap':       sg(info,'marketCap','totalMarketCap'),
            'enterpriseValue': sg(info,'enterpriseValue'),
            'peRatio':         sg(info,'trailingPE','forwardPE','priceEpsCurrentYear'),
            'forwardPE':       sg(info,'forwardPE'),
            'pbRatio':         sg(info,'priceToBook'),
            'psRatio':         sg(info,'priceToSalesTrailing12Months'),
            'evToEbitda':      sg(info,'enterpriseToEbitda'),
            'evToRevenue':     sg(info,'enterpriseToRevenue'),

            # Per share data
            'eps':             sg(info,'trailingEps','forwardEps','epsCurrentYear'),
            'forwardEps':      sg(info,'forwardEps'),
            'bookValue':       sg(info,'bookValue'),
            'sharesOut':       sg(info,'sharesOutstanding','impliedSharesOutstanding'),
            'floatShares':     sg(info,'floatShares'),

            # Dividend
            'dividendYield':   sg(info,'dividendYield','trailingAnnualDividendYield'),
            'dividendRate':    sg(info,'dividendRate','trailingAnnualDividendRate'),
            'payoutRatio':     sg(info,'payoutRatio'),
            'exDividendDate':  str(info.get('exDividendDate','')),

            # Financial ratios
            'beta':            sg(info,'beta','beta3Year'),
            'roe':             sg(info,'returnOnEquity'),
            'roa':             sg(info,'returnOnAssets'),
            'grossMargins':    sg(info,'grossMargins'),
            'operatingMargins':sg(info,'operatingMargins','ebitdaMargins'),
            'profitMargins':   sg(info,'profitMargins','netMargins'),
            'debtToEquity':    sg(info,'debtToEquity'),
            'currentRatio':    sg(info,'currentRatio'),
            'quickRatio':      sg(info,'quickRatio'),

            # Income statement
            'revenue':         sg(info,'totalRevenue'),
            'revenueGrowth':   sg(info,'revenueGrowth'),
            'grossProfit':     sg(info,'grossProfits'),
            'ebitda':          sg(info,'ebitda'),
            'netIncome':       sg(info,'netIncomeToCommon'),
            'earningsGrowth':  sg(info,'earningsGrowth'),
            'earningsQuarterlyGrowth': sg(info,'earningsQuarterlyGrowth'),

            # Balance sheet
            'totalCash':       sg(info,'totalCash'),
            'totalDebt':       sg(info,'totalDebt'),
            'freeCashflow':    sg(info,'freeCashflow'),
            'operatingCashflow':sg(info,'operatingCashflow'),

            # Analyst data
            'targetPrice':     sg(info,'targetMeanPrice','targetPrice'),
            'targetHigh':      sg(info,'targetHighPrice'),
            'targetLow':       sg(info,'targetLowPrice'),
            'recommendKey':    info.get('recommendationKey','N/A'),
            'numberOfAnalysts':info.get('numberOfAnalystOpinions',0),

            # Performance
            'ytdReturn':       sg(info,'ytdReturn'),
            '52WeekChange':    sg(info,'52WeekChange'),
            'SandP52WeekChange':sg(info,'SandP52WeekChange'),
        }
    except Exception as e:
        print(f"Financial data error for {symbol}: {e}")
        return {}

# ═══════════════════════════════════════════════════════
# FLASK ROUTES
# ═══════════════════════════════════════════════════════

@app.route('/api/health')
def health():
    stocks=fetch_nse_stocks()
    return jsonify({'status':'running','lstm_available':LSTM_AVAILABLE,
                    'total_stocks':len(stocks),'time':datetime.now().isoformat()})

@app.route('/api/nse/all')
def all_stocks():
    stocks   = fetch_nse_stocks()
    search   = request.args.get('search','').upper()
    page     = int(request.args.get('page',1))
    per_page = int(request.args.get('per_page',200))
    if search:
        stocks=[s for s in stocks if search in s['symbol'] or search in s['name'].upper()]
    start=(page-1)*per_page; end=start+per_page
    return jsonify({'success':True,'total':len(stocks),'page':page,
                    'per_page':per_page,'stocks':stocks[start:end]})

@app.route('/api/nse/index/<path:index_name>')
def index_stocks(index_name):
    import urllib.parse
    decoded=urllib.parse.unquote(index_name)
    headers={'User-Agent':'Mozilla/5.0','Referer':'https://www.nseindia.com/','Accept':'application/json'}
    stock_data=[]
    try:
        session=requests.Session(); session.headers.update(headers)
        session.get('https://www.nseindia.com',timeout=10); time.sleep(0.5)
        url=f"https://www.nseindia.com/api/equity-stockIndices?index={requests.utils.quote(decoded)}"
        resp=session.get(url,timeout=15)
        if resp.status_code==200:
            for item in resp.json().get('data',[]):
                sym=item.get('symbol','')
                if not sym or sym==decoded: continue
                meta=item.get('meta',{})
                if not isinstance(meta,dict): meta={}
                stock_data.append({
                    'symbol':sym,
                    'meta':{'companyName':meta.get('companyName',sym),'sector':meta.get('sector','N/A'),'industry':meta.get('industry','N/A')},
                    'lastPrice':item.get('lastPrice',0),'change':item.get('change',0),
                    'pChange':item.get('pChange',0),'totalTradedVolume':item.get('totalTradedVolume',0),
                    'open':item.get('open',0),'high':item.get('dayHigh',0),'low':item.get('dayLow',0),
                    'previousClose':item.get('previousClose',0),'yearHigh':item.get('yearHigh',0),
                    'yearLow':item.get('yearLow',0),'perChange365d':item.get('perChange365d',0),
                })
    except Exception as e:
        print(f"Index error: {e}")
    return jsonify({'success':True,'index':decoded,'count':len(stock_data),'stocks':stock_data})

@app.route('/api/stock/financials/<symbol>')
def stock_financials(symbol):
    """Complete financial data"""
    fin = get_full_financials(symbol)
    if fin:
        fin['success'] = True
        fin['symbol']  = symbol
        return jsonify(fin)
    return jsonify({'success':False,'error':'Could not fetch data'}),500

@app.route('/api/stock/history/<symbol>')
def stock_history(symbol):
    period  =request.args.get('period','1y')
    interval=request.args.get('interval','1d')
    try:
        df=yf.Ticker(f"{symbol}.NS").history(period=period,interval=interval)
        if df is None or df.empty: return jsonify({'success':False,'error':'No data'}),404
        records=[]
        for date,row in df.iterrows():
            records.append({'date':date.strftime('%Y-%m-%d'),
                'open':round(float(row['Open']),2),'high':round(float(row['High']),2),
                'low':round(float(row['Low']),2),'close':round(float(row['Close']),2),
                'volume':int(row['Volume'])})
        return jsonify({'success':True,'symbol':symbol,'period':period,'data':records})
    except Exception as e:
        return jsonify({'success':False,'error':str(e)}),500

# ═══════════════════════════════════════════════════════
# SHARED: build the price dataframe with full indicator + v2 feature set.
# Used by /overview (fast path) and /predict (ML path).
# ═══════════════════════════════════════════════════════
def _build_analyzed_df(symbol, years='5y'):
    t  = yf.Ticker(f"{symbol}.NS")
    df = t.history(period=years, interval='1d')
    if df is None or df.empty or len(df) < 100:
        return None
    df = df[['Open','High','Low','Close','Volume']].copy()
    df.dropna(inplace=True)
    df = add_indicators(df)
    df = add_v2_features(df, symbol=symbol)
    return df

def _chart_records(df, tail=120):
    def sf(v):
        try:
            f = float(v); return round(f, 2) if pd.notna(f) and np.isfinite(f) else None
        except Exception:
            return None
    out = []
    for date, row in df.tail(tail).iterrows():
        out.append({
            'date': date.strftime('%d %b'),
            'open': sf(row['Open']), 'high': sf(row['High']),
            'low':  sf(row['Low']),  'close': sf(row['Close']),
            'volume': int(row['Volume']) if pd.notna(row['Volume']) else 0,
            'ma20': sf(row.get('MA_20')), 'ma50': sf(row.get('MA_50')),
            'rsi':  sf(row.get('RSI')),   'macd': sf(row.get('MACD')),
            'macd_signal': sf(row.get('MACD_Signal')),
            'macd_hist':   sf(row.get('MACD_Hist')),
        })
    return out

def _latest_indicators(df, cur):
    latest = df.iloc[-1]
    return {
        'rsi':         round(float(latest.get('RSI', 50)), 2),
        'macd':        round(float(latest.get('MACD', 0)), 4),
        'macd_signal': round(float(latest.get('MACD_Signal', 0)), 4),
        'bb_pct':      round(float(latest.get('BB_Pct', 0.5)), 3),
        'stoch_k':     round(float(latest.get('Stoch_K', 50)), 2),
        'cci':         round(float(latest.get('CCI', 0)), 2),
        'williams_r':  round(float(latest.get('Williams_R', -50)), 2),
        'atr':         round(float(latest.get('ATR', 0)), 2),
        'volume_ratio':round(float(latest.get('Volume_Ratio', 1)), 2),
        'ma20':        round(float(latest.get('MA_20', cur)), 2),
        'ma50':        round(float(latest.get('MA_50', cur)), 2),
        'ma200':       round(float(latest.get('MA_200', cur)), 2),
        'momentum':    round(float(latest.get('Momentum_10', 0)), 2),
    }


@app.route('/api/stock/overview/<symbol>')
def stock_overview(symbol):
    """
    Fast path — everything EXCEPT the ML (no RF stacking, no LSTM training).
    Powers TradingView / ML Chart / Indicators / Financials / Historical tabs.
    Typical latency: ~3–8s (mostly Yahoo calls).
    """
    try:
        df = _build_analyzed_df(symbol)
        if df is None:
            return jsonify({'success': False, 'error': f'No data for {symbol}'}), 400

        fin  = get_full_financials(symbol)
        cur  = fin.get('currentPrice',  float(df.iloc[-1]['Close']))
        prev = fin.get('previousClose', float(df.iloc[-2]['Close']))

        sigs = get_ind_signals(df)
        bv = sum(1 for s in sigs if s['signal'] == 'BUY')
        sv = sum(1 for s in sigs if s['signal'] == 'SELL')
        hv = sum(1 for s in sigs if s['signal'] == 'HOLD')

        payload = {
            'success':     True,
            'symbol':      symbol,
            'name':        fin.get('name', symbol),
            'sector':      fin.get('sector', 'N/A'),
            'industry':    fin.get('industry', 'N/A'),
            'description': fin.get('description', ''),
            'website':     fin.get('website', ''),
            'financials':  fin,
            'timestamp':   datetime.now().isoformat(),
            'currentPrice':  cur,
            'prevPrice':     prev,
            'priceChange':   round(cur - prev, 2),
            'priceChangePct':round((cur - prev) / prev * 100 if prev else 0, 2),
            'buyVotes':  bv, 'sellVotes': sv, 'holdVotes': hv,
            'indicatorSignals': sigs,
            'indicators':       _latest_indicators(df, cur),
            'chartData':        _chart_records(df, tail=120),
            'dataPoints':       len(df),
            'dataStartDate':    df.index[0].strftime('%Y-%m-%d'),
            'dataEndDate':      df.index[-1].strftime('%Y-%m-%d'),
        }
        return jsonify(sanitize_for_json(payload))
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/predict/<symbol>')
def predict(symbol):
    """
    Back-compat prediction path using the classic model family:
      - RandomForest/GradientBoosting per timeframe (saved model files)
      - LSTM for price-forecast curve (saved model files)
    This keeps the rest of app.py unchanged while restoring older predict logic.
    """
    try:
        # IMPORTANT: Normalize symbol casing so we consistently hit the same
        # on-disk model files (e.g., RELIANCE_lstm.h5). Otherwise calling
        # /api/predict/reliance can retrain a separate set of models.
        symbol = (symbol or "").strip().upper()
        print(f"\n{'='*50}\n{symbol}\n{'='*50}")
        t = yf.Ticker(f"{symbol}.NS")
        df = t.history(period='3y', interval='1d')
        if df is None or df.empty or len(df) < 100:
            return jsonify({'success': False, 'error': f'No data for {symbol}'}), 400
        df = df[['Open', 'High', 'Low', 'Close', 'Volume']].copy()
        df.dropna(inplace=True)
        df = add_indicators(df)
        print(f"   {len(df)} days real data")

        print("   Fetching financial data...")
        fin = get_full_financials(symbol)
        cur = float(fin.get('currentPrice', float(df.iloc[-1]['Close'])))
        prev = float(fin.get('previousClose', float(df.iloc[-2]['Close'])))

        print("   Training/loading multi-timeframe RF models...")
        timeframes = [
            (1,   'tomorrow',   'Tomorrow'),
            (5,   'next_week',  'Next Week'),
            (21,  'next_month', 'Next Month'),
            (63,  'next_3m',    'Next 3 Months'),
            (252, 'next_year',  'Next Year'),
        ]

        tf_predictions = []
        overall_buy = overall_sell = overall_hold = 0
        for days, tf_key, tf_label in timeframes:
            model, _imp, acc = train_rf_for_timeframe(symbol, df, days, tf_key)
            if model:
                sig, proba = pred_rf(model, df)
                bp = round(proba.get('BUY', 0) * 100, 1)
                sp = round(proba.get('SELL', 0) * 100, 1)
                hp = round(proba.get('HOLD', 0) * 100, 1)
                if sig == 'BUY':
                    overall_buy += 1
                elif sig == 'SELL':
                    overall_sell += 1
                else:
                    overall_hold += 1
                tf_predictions.append({
                    'timeframe': tf_label,
                    'days': days,
                    'signal': sig,
                    'accuracy': round(acc, 1),
                    'buyProb': bp,
                    'sellProb': sp,
                    'holdProb': hp,
                })
            else:
                tf_predictions.append({
                    'timeframe': tf_label,
                    'days': days,
                    'signal': 'HOLD',
                    'accuracy': 0,
                    'buyProb': 33,
                    'sellProb': 33,
                    'holdProb': 34,
                })

        overall = ('BUY' if overall_buy >= overall_sell and overall_buy >= overall_hold else
                   'SELL' if overall_sell >= overall_buy and overall_sell >= overall_hold else 'HOLD')

        # ════════════════════════════════════════════════════════════════
        # PROFESSIONAL PRICE FORECASTING ENGINE  (clean rewrite)
        # ════════════════════════════════════════════════════════════════
        #
        # The ML regressor predicts near-zero always (MSE optimises to mean).
        # Professional quant desks use MOMENTUM EXTRAPOLATION for price targets:
        #
        #   P_t  =  P_0  ×  exp( mu_adjusted × t )
        #
        # where:
        #   mu_adjusted = multi-window momentum × classifier_boost × mega_alpha
        #   t           = time in years
        #
        # Confidence bands come from GARCH(1,1) volatility (not MC spread).
        # This always gives meaningful, horizon-scaled price targets.
        # ════════════════════════════════════════════════════════════════

        # ── Step 1: Multi-window annualised momentum (log-return basis) ──
        df_mega = add_v2_features(df.copy(), symbol=symbol)
        df_mega = add_mega_features(df_mega)
        _lr  = np.log(df_mega['Close'] / df_mega['Close'].shift(1)).dropna()

        def _ann_drift(series, window):
            tail = series.tail(window)
            if len(tail) < max(window // 3, 5):
                return 0.0
            return float(tail.mean()) * 252.0   # annualised log-return

        mu_1m = _ann_drift(_lr, 21)    # 1-month  momentum  (annualised)
        mu_3m = _ann_drift(_lr, 63)    # 3-month  momentum
        mu_6m = _ann_drift(_lr, 126)   # 6-month  momentum
        mu_1y = _ann_drift(_lr, 252)   # 1-year   momentum
        mu_2y = _ann_drift(_lr, 504)   # 2-year   long-term baseline

        # Weighted consensus: recent momentum dominates (reflects current regime)
        mu_base = (0.40 * mu_1m +
                   0.25 * mu_3m +
                   0.15 * mu_6m +
                   0.10 * mu_1y +
                   0.10 * mu_2y)

        # Realistic cap: Indian stocks rarely compound above 80%/yr sustainably
        mu_base = float(np.clip(mu_base, -0.70, 0.80))

        print(f"   Momentum: 1M={mu_1m*100:+.1f}%  3M={mu_3m*100:+.1f}%  "
              f"6M={mu_6m*100:+.1f}%  1Y={mu_1y*100:+.1f}%  base={mu_base*100:+.1f}%/yr")

        print("   Fitting GARCH volatility model...")
        annual_vol = garch_volatility(df_mega, horizon_days=252)
        daily_vol  = annual_vol / np.sqrt(252)

        # ── INTELLIGENCE LAYER: 7-source blend ────────
        print("   Running intelligence layer (fund / news / FII / macro / options / earnings / reddit)...")
        fund_alpha, fund_metrics = get_fundamental_alpha(symbol)
        news_score, news_items   = get_news_sentiment(symbol)
        fii_data                 = fetch_fii_dii_flows()

        # News alpha: sentiment drives up to +-20% of annual vol as extra drift
        news_alpha = news_score * annual_vol * 0.20

        # FII/DII alpha: large net inflows -> positive alpha (max +-8%/yr)
        fii_combined = fii_data.get('combined_5d', 0.0)
        fii_alpha    = float(np.clip(fii_combined / 50000.0, -0.08, 0.08))

        # NEW: Macro indicators
        macro_alpha_val = 0.0
        macro_data_result = {}
        try:
            from macro_indicators import fetch_macro_data, get_sector_macro_adjustment
            macro_data_result = fetch_macro_data()
            macro_alpha_val = macro_data_result.get('macro_alpha', 0.0)
            sector_adj = get_sector_macro_adjustment(fin.get('sector', ''), macro_data_result)
            macro_alpha_val += sector_adj
            macro_alpha_val = float(np.clip(macro_alpha_val, -0.15, 0.15))
            print(f"   [Intel] Macro alpha={macro_alpha_val*100:+.2f}% (sector adj={sector_adj*100:+.2f}%)")
        except Exception as e:
            print(f"   [Intel] Macro module unavailable: {e}")

        # NEW: Options flow
        options_alpha_val = 0.0
        options_data_result = {}
        try:
            from options_flow import get_options_flow
            options_data_result = get_options_flow(symbol)
            options_alpha_val = options_data_result.get('options_alpha', 0.0)
            print(f"   [Intel] Options alpha={options_alpha_val*100:+.2f}% (PCR={options_data_result.get('pcr_oi', 'N/A')})")
        except Exception as e:
            print(f"   [Intel] Options module unavailable: {e}")

        # NEW: Earnings intelligence
        earnings_alpha_val = 0.0
        earnings_vol_mult = 1.0
        earnings_data_result = {}
        try:
            from earnings_model import get_earnings_intelligence
            earnings_data_result = get_earnings_intelligence(symbol)
            earnings_alpha_val = earnings_data_result.get('earnings_alpha', 0.0)
            earnings_vol_mult = earnings_data_result.get('earnings_vol_mult', 1.0)
            print(f"   [Intel] Earnings alpha={earnings_alpha_val*100:+.2f}% vol_mult={earnings_vol_mult}x")
        except Exception as e:
            print(f"   [Intel] Earnings module unavailable: {e}")

        # NEW: Reddit social sentiment (fast mode — max 5s timeout)
        reddit_alpha_val = 0.0
        reddit_data_result = {}
        try:
            from reddit_sentiment import scrape_reddit_sentiment
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(scrape_reddit_sentiment, symbol, 7, 20)
                try:
                    reddit_data_result = future.result(timeout=8)  # Max 8 second wait
                except concurrent.futures.TimeoutError:
                    reddit_data_result = {'sentiment_score': 0.0, 'post_count': 0, 'sentiment_label': 'N/A'}
                    print(f"   [Intel] Reddit timed out (8s), using neutral")
            reddit_score = reddit_data_result.get('sentiment_score', 0.0)
            reddit_post_count = reddit_data_result.get('post_count', 0)
            post_confidence = min(1.0, reddit_post_count / 10.0)
            reddit_alpha_val = float(np.clip(reddit_score * annual_vol * 0.25 * post_confidence, -0.12, 0.12))
            print(f"   [Intel] Reddit alpha={reddit_alpha_val*100:+.2f}% (score={reddit_score:+.3f}, {reddit_post_count} posts)")
        except Exception as e:
            print(f"   [Intel] Reddit module unavailable: {e}")

        # Updated 7-source intelligence blend
        # Weights: fund 25%, news 13%, FII 10%, macro 15%, options 13%, earnings 10%, reddit 14%
        intel_alpha = (0.25 * fund_alpha +
                       0.13 * news_alpha +
                       0.10 * fii_alpha +
                       0.15 * macro_alpha_val +
                       0.13 * options_alpha_val +
                       0.10 * earnings_alpha_val +
                       0.14 * reddit_alpha_val)
        intel_alpha = float(np.clip(intel_alpha, -0.15, 0.15))

        mu_base_orig = mu_base
        mu_base      = float(np.clip(mu_base + intel_alpha, -0.75, 0.90))

        # Apply earnings volatility multiplier
        if earnings_vol_mult > 1.0:
            daily_vol = daily_vol * earnings_vol_mult
            annual_vol = daily_vol * np.sqrt(252)
            print(f"   [Intel] Volatility adjusted by earnings: {earnings_vol_mult}x")

        print(f"   Intel: fund={fund_alpha*100:+.2f}%  news={news_alpha*100:+.2f}%  "
              f"fii={fii_alpha*100:+.2f}%  macro={macro_alpha_val*100:+.2f}%  "
              f"options={options_alpha_val*100:+.2f}%  earnings={earnings_alpha_val*100:+.2f}%  "
              f"reddit={reddit_alpha_val*100:+.2f}%  "
              f"total={intel_alpha*100:+.2f}%  "
              f"mu: {mu_base_orig*100:+.1f}% -> {mu_base*100:+.1f}%")

        intel_data = {
            'fundamentals':      fund_metrics,
            'newsSentiment':     round(news_score, 3),
            'newsItems':         news_items[:5],
            'fiiDiiFlows':       fii_data,
            'fundAlphaPct':      round(fund_alpha * 100, 2),
            'newsAlphaPct':      round(news_alpha * 100, 2),
            'fiiAlphaPct':       round(fii_alpha * 100, 2),
            'macroAlphaPct':     round(macro_alpha_val * 100, 2),
            'macroData':         macro_data_result,
            'optionsAlphaPct':   round(options_alpha_val * 100, 2),
            'optionsData':       options_data_result,
            'earningsAlphaPct':  round(earnings_alpha_val * 100, 2),
            'earningsData':      earnings_data_result,
            'earningsVolMult':   earnings_vol_mult,
            'redditAlphaPct':    round(reddit_alpha_val * 100, 2),
            'redditData':        {k: v for k, v in reddit_data_result.items() if k != 'top_posts'},  # exclude large posts list
            'totalIntelAlphaPct':round(intel_alpha * 100, 2),
            'muBasePct':         round(mu_base * 100, 2),
            'blendWeights': {
                'fundamentals': 0.25, 'news': 0.13, 'fiiDii': 0.10,
                'macro': 0.15, 'options': 0.13, 'earnings': 0.10, 'reddit': 0.14,
            },
        }


        mega_timeframes = [
            (1,   'tomorrow'),
            (5,   'next_week'),
            (21,  'next_month'),
            (63,  'next_3m'),
            (252, 'next_year'),
        ]
        mega_bundles = {}
        mega_dir_accs = {}
        for days_tf, tf_key in mega_timeframes:
            print(f"   Mega ensemble: {tf_key} ({days_tf}d)...")
            bundle_tf, dir_acc_tf = train_mega_ensemble(symbol, df_mega, days_tf, tf_key)
            if bundle_tf is not None:
                mega_bundles[tf_key]   = bundle_tf
                mega_dir_accs[tf_key]  = dir_acc_tf

        # ── Step 2: Classifier net-direction per timeframe ──────────────
        key_order   = ['tomorrow', 'next_week', 'next_month', 'next_3m', 'next_year']
        clf_net_dir = {}
        for i, tf_p in enumerate(tf_predictions):
            if i < len(key_order):
                clf_net_dir[key_order[i]] = (tf_p['buyProb'] - tf_p['sellProb']) / 100.0

        # ── Step 3: Per-timeframe price targets ──────────────────────────
        # IMPROVED: 3-way blend: classifier + momentum + market anchor
        #   clf_driven = clf_dir * K * annual_vol
        #   market_anchor: Indian equity mean ~12%/yr (prevents perma-SELL)
        #   Horizon-blended: short = momentum-heavy, long = clf + anchor
        K_CLF       = 1.0     # Boosted from 0.75 so classifier has real impact
        W_CLF_SHORT = 0.40    # Raised from 0.30 — even short-term uses ML signal
        W_CLF_LONG  = 0.85    # Raised from 0.80 — long-term is mostly ML
        MARKET_ANCHOR = 0.12  # Indian equity long-run annual return (~12%)

        price_forecasts = {}
        daily_forecast  = []
        mu_for_chart    = mu_base

        for days_tf, tf_key in mega_timeframes:
            t       = days_tf / 252.0
            clf_dir = clf_net_dir.get(tf_key, 0.0)

            # Classifier-driven annual return (positive when BUY, negative when SELL)
            clf_driven = clf_dir * K_CLF * annual_vol

            # Horizon-blended drift (clf dominates at long horizons)
            w_clf  = min(W_CLF_SHORT + (W_CLF_LONG - W_CLF_SHORT) * t, W_CLF_LONG)

            # Market mean-reversion anchor: increases with horizon
            # Short-term: 5% anchor weight, Long-term (1yr): 20% anchor weight
            w_anchor = min(0.05 + 0.15 * t, 0.20)
            w_mom    = max(1.0 - w_clf - w_anchor, 0.0)

            mu_tf  = w_clf * clf_driven + w_mom * mu_base + w_anchor * MARKET_ANCHOR

            # Short-horizon mega-model alpha tweak (tomorrow only)
            if tf_key in mega_bundles and days_tf <= 5:
                raw_mega   = predict_mega(mega_bundles[tf_key], df_mega)
                mega_norm  = float(np.tanh(raw_mega / (annual_vol * 0.05 + 1e-8)))
                mega_alpha = mega_norm * annual_vol * 0.10
                mu_tf      = 0.80 * mu_tf + 0.20 * (mu_tf + mega_alpha)

            # Minimum drift floor: prevent near-flat forecasts
            # If classifier has conviction (>0.15 either way), enforce minimum drift
            if abs(clf_dir) > 0.15 and abs(mu_tf) < 0.03:
                mu_tf = 0.03 * np.sign(clf_dir)  # at least 3%/yr in classifier direction

            mu_tf_final  = float(np.clip(mu_tf, -0.90, 1.20))
            pred_log_ret = mu_tf_final * t
            sigma_h      = daily_vol * np.sqrt(days_tf)

            # SHORT-HORIZON FIX: Volatility-scaled minimum price move
            # Problem: 16%/yr drift / 252 = 0.06%/day = looks flat
            # Solution: If clf has conviction, move price by fraction of horizon vol
            if abs(clf_dir) > 0.10 and days_tf <= 63:
                min_move = 0.40 * sigma_h * np.sign(clf_dir) * min(abs(clf_dir) * 2.0, 1.0)
                if abs(pred_log_ret) < abs(min_move):
                    pred_log_ret = min_move

            pred_price = float(cur * np.exp(pred_log_ret))
            chg        = pred_price - cur
            chgp       = chg / cur * 100 if cur > 0 else 0.0

            bull95 = float(cur * np.exp(pred_log_ret + 1.645 * sigma_h))
            bear5  = float(cur * np.exp(pred_log_ret - 1.645 * sigma_h))
            bull75 = float(cur * np.exp(pred_log_ret + 0.674 * sigma_h))
            bear25 = float(cur * np.exp(pred_log_ret - 0.674 * sigma_h))

            price_forecasts[tf_key] = {
                'price':         round(pred_price, 2),
                'change':        round(chg, 2),
                'changePercent': round(chgp, 2),
                'bullTarget':    round(bull75, 2),
                'bearTarget':    round(bear25, 2),
                'bull95':        round(bull95, 2),
                'bear5':         round(bear5, 2),
                'horizonVol':    round(sigma_h * 100, 2),
                'annualDrift':   round(mu_tf_final * 100, 1),
                'signal':        'BUY' if chgp > 0.3 else 'SELL' if chgp < -0.3 else 'HOLD',
            }
            if tf_key == 'next_year':
                mu_for_chart = mu_tf_final

            print(f"   {tf_key:12s}: clf={clf_dir:+.2f}  w_clf={w_clf:.2f}  w_anchor={w_anchor:.2f}  "
                  f"mu={mu_tf_final*100:+.1f}%/yr  pred={chgp:+.2f}%  "
                  f"price={pred_price:.2f}")

        # ── Step 4: Attach mega accuracy ─────────────────────────────────
        for i, tf_p in enumerate(tf_predictions):
            if i < len(key_order):
                key = key_order[i]
                if key in mega_dir_accs:
                    tf_p['megaDirAcc']       = round(mega_dir_accs[key], 1)
                if key in price_forecasts:
                    tf_p['megaForecastPrice']  = price_forecasts[key]['price']
                    tf_p['megaForecastChgPct'] = price_forecasts[key]['changePercent']

        # ── Step 5: 30-day daily chart via LSTM v2 + drift blend ────────
        # Train/load LSTM v2 for this symbol
        lstm_model_v2, lstm_bundle_v2 = None, None
        try:
            lstm_model_v2, lstm_bundle_v2 = train_lstm_v2(symbol, df)
        except Exception as e:
            print(f"   WARN: LSTM v2 train failed: {e}")

        # Generate 30-day forecast using LSTM v2 (blended with drift)
        lstm_30d = None
        if lstm_model_v2 is not None and lstm_bundle_v2 is not None:
            try:
                lstm_30d = forecast_lstm_v2(lstm_model_v2, lstm_bundle_v2, df, lb=60, days=30)
            except Exception as e:
                print(f"   WARN: LSTM v2 forecast failed: {e}")

        for i in range(30):
            di    = i + 1
            sig_i = daily_vol * np.sqrt(di)
            if lstm_30d is not None and i < len(lstm_30d):
                pred_p = float(lstm_30d[i])
            else:
                # Fallback: plain drift
                lret   = (mu_for_chart / 252.0) * di
                pred_p = float(cur * np.exp(lret))
            daily_forecast.append({
                'day':   f'Day {di}',
                'date':  (datetime.now() + timedelta(days=di)).strftime('%d %b'),
                'price': round(pred_p, 2),
                'bull':  round(float(pred_p * np.exp(0.674 * sig_i)), 2),
                'bear':  round(float(pred_p * np.exp(-0.674 * sig_i)), 2),
            })

        sigs = get_ind_signals(df)
        bv = sum(1 for s in sigs if s['signal'] == 'BUY')
        sv = sum(1 for s in sigs if s['signal'] == 'SELL')
        hv = sum(1 for s in sigs if s['signal'] == 'HOLD')
        latest = df.iloc[-1]
        print(f"   Complete! Overall: {overall} | GARCH vol: {annual_vol*100:.1f}%/yr | XGBoost: {'YES' if XGBOOST_AVAILABLE else 'NO'} | LGBM: {'YES' if LIGHTGBM_AVAILABLE else 'NO'}")


        response_payload = {
            'success': True,
            'symbol': symbol,
            'name': fin.get('name', symbol),
            'sector': fin.get('sector', 'N/A'),
            'industry': fin.get('industry', 'N/A'),
            'description': fin.get('description', ''),
            'website': fin.get('website', ''),
            'financials': fin,
            'timestamp': datetime.now().isoformat(),
            'currentPrice': cur,
            'prevPrice': prev,
            'priceChange': round(cur - prev, 2),
            'priceChangePct': round((cur - prev) / prev * 100 if prev else 0, 2),
            'overallSignal': overall,
            'timeframePredictions': tf_predictions,
            'priceForecastsByTimeframe': price_forecasts,
            'forecast': daily_forecast,
            'dailyVolPct': round(daily_vol * 100, 3),
            'annualVolPct': round(annual_vol * 100, 2),
            'garchVolFitted': ARCH_AVAILABLE,
            'megaModels': list(mega_bundles.keys()),
            'megaDirAccs': {k: round(v, 1) for k, v in mega_dir_accs.items()},
            'buyVotes': bv,
            'sellVotes': sv,
            'holdVotes': hv,
            'indicatorSignals': sigs,
            'indicators': {
                'rsi': round(float(latest.get('RSI', 50)), 2),
                'macd': round(float(latest.get('MACD', 0)), 4),
                'macd_signal': round(float(latest.get('MACD_Signal', 0)), 4),
                'bb_pct': round(float(latest.get('BB_Pct', 0.5)), 3),
                'stoch_k': round(float(latest.get('Stoch_K', 50)), 2),
                'cci': round(float(latest.get('CCI', 0)), 2),
                'williams_r': round(float(latest.get('Williams_R', -50)), 2),
                'atr': round(float(latest.get('ATR', 0)), 2),
                'volume_ratio': round(float(latest.get('Volume_Ratio', 1)), 2),
                'ma20': round(float(latest.get('MA_20', cur)), 2),
                'ma50': round(float(latest.get('MA_50', cur)), 2),
                'ma200': round(float(latest.get('MA_200', cur)), 2),
                'momentum': round(float(latest.get('Momentum_10', 0)), 2),
                # Mega indicators
                'adx': round(float(df_mega.iloc[-1].get('ADX', 25)), 2),
                'cmf': round(float(df_mega.iloc[-1].get('CMF', 0)), 4),
                'obv_slope': round(float(df_mega.iloc[-1].get('OBV_Slope', 0)), 6),
                'rvol_21d': round(float(df_mega.iloc[-1].get('RVol_21d', annual_vol)), 4),
                'vol_regime': int(df_mega.iloc[-1].get('Vol_Regime', 0)),
                'ichimoku_above_cloud': int(df_mega.iloc[-1].get('Ichimoku_Above_Cloud', 0)),
            },
            'chartData': _chart_records(df, tail=120),
            'dataPoints': len(df),
            'dataStartDate': df.index[0].strftime('%Y-%m-%d'),
            'dataEndDate': df.index[-1].strftime('%Y-%m-%d'),
            'modelVersion': f'mega-ensemble-v1 (XGB:{XGBOOST_AVAILABLE}|LGBM:{LIGHTGBM_AVAILABLE}|GARCH:{ARCH_AVAILABLE})',
            'intelligence': intel_data,
        }
        return jsonify(sanitize_for_json(response_payload))

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/ohlc/<symbol>')
def ohlc_data(symbol):
    """Return OHLC + Volume + MA data formatted for lightweight-charts."""
    period = request.args.get('period', '1y')
    valid_periods = {'1mo', '3mo', '6mo', '1y', '2y', '5y'}
    if period not in valid_periods:
        period = '1y'
    try:
        t = yf.Ticker(f"{symbol}.NS")
        df = t.history(period=period, interval='1d')
        if df is None or df.empty:
            return jsonify({'success': False, 'error': f'No data for {symbol}'}), 404
        df = df[['Open', 'High', 'Low', 'Close', 'Volume']].copy()
        df.dropna(inplace=True)
        if len(df) < 5:
            return jsonify({'success': False, 'error': 'Insufficient data'}), 404

        # Compute MAs
        df['MA_20']  = df['Close'].rolling(20).mean()
        df['MA_50']  = df['Close'].rolling(50).mean()
        df['MA_200'] = df['Close'].rolling(200).mean()

        candles = []
        volume_data = []
        ma20_data = []
        ma50_data = []
        ma200_data = []

        for date, row in df.iterrows():
            ts = int(date.timestamp())
            o, h, l, c = float(row['Open']), float(row['High']), float(row['Low']), float(row['Close'])
            candles.append({'time': ts, 'open': round(o, 2), 'high': round(h, 2),
                            'low': round(l, 2), 'close': round(c, 2)})
            vol = int(row['Volume']) if pd.notna(row['Volume']) else 0
            color = 'rgba(34,197,94,0.4)' if c >= o else 'rgba(239,68,68,0.4)'
            volume_data.append({'time': ts, 'value': vol, 'color': color})

            if pd.notna(row.get('MA_20')):
                ma20_data.append({'time': ts, 'value': round(float(row['MA_20']), 2)})
            if pd.notna(row.get('MA_50')):
                ma50_data.append({'time': ts, 'value': round(float(row['MA_50']), 2)})
            if pd.notna(row.get('MA_200')):
                ma200_data.append({'time': ts, 'value': round(float(row['MA_200']), 2)})

        return jsonify({
            'success': True, 'symbol': symbol, 'period': period,
            'candles': candles, 'volume': volume_data,
            'ma20': ma20_data, 'ma50': ma50_data, 'ma200': ma200_data,
            'count': len(candles),
        })
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/scan')
def scan():
    """Scan stocks - supports ALL stocks not just 50"""
    syms_str = request.args.get('symbols','')
    # If 'ALL' passed, scan all NSE stocks (in batches)
    import urllib.parse
    if syms_str.upper()=='ALL':
        all_s = fetch_nse_stocks()
        syms  = [s['symbol'] for s in all_s]
    else:
        syms = [urllib.parse.unquote(s.strip()) for s in syms_str.split(',') if s.strip()]

    limit = int(request.args.get('limit', 100))
    syms  = syms[:limit]  # Configurable limit

    if not syms: return jsonify({'success':False,'error':'No symbols'}),400

    results=[]
    for sym in syms:
        try:
            df=yf.Ticker(f"{sym}.NS").history(period='2y',interval='1d')
            if df is None or df.empty or len(df)<30: continue
            df=df[['Open','High','Low','Close','Volume']].copy(); df.dropna(inplace=True)
            df=add_indicators(df)
            if df.empty or len(df)<2: continue
            row=df.iloc[-1]; cur=float(row['Close']); prev=float(df.iloc[-2]['Close'])
            chg=cur-prev; chgp=(chg/prev)*100
            rsi=float(row.get('RSI',50)); macd=float(row.get('MACD',0))
            ms=float(row.get('MACD_Signal',0)); bb=float(row.get('BB_Pct',0.5))
            vr=float(row.get('Volume_Ratio',1))
            bp=sp=0
            if rsi<35: bp+=2
            elif rsi>65: sp+=2
            if macd>ms: bp+=2
            else: sp+=2
            if bb<0.25: bp+=1
            elif bb>0.75: sp+=1
            for ma in [20,50,200]:
                v=float(row.get(f'MA_{ma}',cur))
                if cur>v: bp+=1
                else: sp+=1
            sig='BUY' if bp>sp+1 else 'SELL' if sp>bp+1 else 'HOLD'
            conf=round(max(bp,sp)/(bp+sp+0.01)*100,1)
            results.append({
                'symbol':sym,'price':round(cur,2),'change':round(chg,2),
                'changePercent':round(chgp,2),'signal':sig,'confidence':conf,
                'rsi':round(rsi,1),'macd':round(macd,2),
                'volume':int(row.get('Volume',0)),'volumeRatio':round(vr,2),
                'sparkline':[{'v':round(float(p),2)} for p in df['Close'].tail(20)],
            })
        except Exception as e:
            print(f"Scan error {sym}: {e}")
    return jsonify({'success':True,'results':results,'count':len(results),'total_requested':len(syms)})



@app.route('/api/models')
def list_models():
    """See all saved models"""
    files = os.listdir(MODELS_DIR) if os.path.exists(MODELS_DIR) else []
    models = {}
    for f in files:
        if f.endswith('_meta.pkl'):
            try:
                meta = joblib.load(os.path.join(MODELS_DIR, f))
                sym  = f.replace('_meta.pkl','').rsplit('_',2)
                models[f] = {'accuracy': round(meta.get('accuracy',0),1), 'trained_at': meta.get('trained_at','unknown')}
            except: pass
    return jsonify({'success':True,'models_dir':MODELS_DIR,'total_files':len(files),'models':models})

@app.route('/api/models/clear/<symbol>')
def clear_model(symbol):
    """Delete saved models for a symbol so it retrains fresh"""
    deleted = []
    for f in os.listdir(MODELS_DIR):
        if f.startswith(symbol+'_'):
            os.remove(os.path.join(MODELS_DIR, f))
            deleted.append(f)
    return jsonify({'success':True,'deleted':deleted})


# ═══════════════════════════════════════════════════════
# HOURLY + EOD BATCH PREDICTIONS
# The /run-batch endpoints are the ones that should be scheduled externally
# (Windows Task Scheduler, cron, or frontend polling). They use the CACHED
# stacked models so per-symbol inference is fast (~100ms), not training-slow.
# Symbols that have no cached model yet are skipped (caller can pre-warm by
# hitting /api/predict/<symbol> once).
# ═══════════════════════════════════════════════════════

def _tomorrow_prediction_from_cache(symbol):
    """
    Fast path: load the cached Tomorrow stacked bundle + v3 LSTM and produce
    a next-day prediction. Returns a dict or None if models aren't cached.
    """
    stack_path = os.path.join(MODELS_DIR, f"{symbol}_tomorrow_{MODEL_VER}_stack.pkl")
    if not os.path.exists(stack_path):
        return None
    try:
        bundle = joblib.load(stack_path)
        df     = _build_analyzed_df(symbol, years='2y')  # 2y is enough for inference
        if df is None:
            return None
        cls_sig, proba = pred_stacked(bundle, df)

        # Next-day price forecast via LSTM-blended drift (if LSTM cached, use it)
        lstm_path   = os.path.join(MODELS_DIR, f"{symbol}_{LSTM_VER}_lstm.h5")
        scaler_path = os.path.join(MODELS_DIR, f"{symbol}_{LSTM_VER}_lstm_sc.pkl")
        pred_price = None
        if os.path.exists(lstm_path) and os.path.exists(scaler_path):
            try:
                m  = load_model(lstm_path)
                sb = joblib.load(scaler_path)
                all_preds = forecast_lstm_v2(m, sb, df, lb=60, days=1)
                if all_preds is not None and len(all_preds) > 0:
                    pred_price = float(all_preds[0])
            except Exception:
                pass
        cur = float(df['Close'].iloc[-1])
        chg_pct = (pred_price - cur) / cur * 100 if pred_price else 0.0

        # Reconcile classifier with forecast
        final_sig, _ = reconcile_signal(cls_sig, proba, chg_pct)

        latest = df.iloc[-1]
        return {
            'symbol':              symbol,
            'currentPrice':        cur,
            'signalTomorrow':      final_sig,
            'classifierSignal':    cls_sig,
            'buyProb':             round(proba.get('BUY',  0) * 100, 1),
            'sellProb':            round(proba.get('SELL', 0) * 100, 1),
            'holdProb':            round(proba.get('HOLD', 0) * 100, 1),
            'predictedNextDayPrice':     round(pred_price, 2) if pred_price else None,
            'predictedNextDayChangePct': round(chg_pct, 3),
            'rsi':                 round(float(latest.get('RSI', 50)), 2),
            'macd':                round(float(latest.get('MACD', 0)), 4),
        }
    except Exception as e:
        print(f"   WARN: _tomorrow_prediction_from_cache({symbol}): {e}")
        return None


@app.route('/api/hourly/run-batch', methods=['POST'])
def run_hourly_batch():
    """
    Body: {"symbols": ["RELIANCE", ...], "hourSlot": 1..6, "sessionDate": "YYYY-MM-DD"}
    If sessionDate is omitted, today is used. If hourSlot is omitted it's
    derived from the current IST clock.
    Skips symbols whose stacked Tomorrow model isn't cached yet.
    """
    data    = request.get_json() or {}
    symbols = data.get('symbols') or []
    if not symbols:
        return jsonify({'success': False, 'error': 'symbols list is required'}), 400

    session_date = data.get('sessionDate')
    if session_date:
        try:
            session_date = datetime.fromisoformat(session_date).date()
        except Exception:
            session_date = datetime.now().date()
    else:
        session_date = datetime.now().date()

    hour_slot = data.get('hourSlot')
    if hour_slot is None:
        # NSE session 9:15–15:30 IST. Map 9→1, 10→2, ..., 14→6.
        hr = datetime.now().hour  # NOTE: server-local; set TZ accordingly
        hour_slot = max(1, min(6, hr - 8)) if 9 <= hr <= 14 else 1
    hour_slot = int(hour_slot)

    saved, skipped, errors, preview = 0, 0, [], []
    try:
        conn = _pyodbc.connect(HOURLY_CONN_STR); cur = conn.cursor()
        for sym in symbols:
            try:
                p = _tomorrow_prediction_from_cache(sym)
                if p is None:
                    skipped += 1
                    errors.append(f"{sym}: no cached Tomorrow model — call /api/predict/{sym} once first")
                    continue
                save_hourly_row(
                    cur,
                    symbol=sym, session_date=session_date, hour_slot=hour_slot,
                    current_price=p['currentPrice'],
                    signal_tomorrow=p['signalTomorrow'],
                    buy_prob=p['buyProb'], sell_prob=p['sellProb'], hold_prob=p['holdProb'],
                    predicted_price=p['predictedNextDayPrice'],
                    predicted_change_pct=p['predictedNextDayChangePct'],
                    rsi=p['rsi'], macd=p['macd'],
                )
                saved += 1
                preview.append(p)
            except Exception as e:
                errors.append(f"{sym}: {e}")
        conn.commit(); conn.close()
        return jsonify({
            'success': True, 'saved': saved, 'skipped': skipped,
            'sessionDate': session_date.isoformat(), 'hourSlot': hour_slot,
            'errors': errors, 'preview': preview,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/dailyavg/run-batch', methods=['POST'])
def run_dailyavg_batch():
    """
    Body: {"symbols": ["RELIANCE", ...], "sessionDate": "YYYY-MM-DD" (optional)}
    Intended to run once after the trading session closes. For each symbol:
      1. Fetch today's OHLC from Yahoo
      2. Compute day's averages: OHLC-avg = (O+H+L+C)/4, typical = (H+L+C)/3,
         open-low avg = (O+L)/2
      3. Use cached stacked model + LSTM to produce a next-day forecast
      4. Upsert one row per (Symbol, SessionDate) into DailyAvgPredictions
    """
    data    = request.get_json() or {}
    symbols = data.get('symbols') or []
    if not symbols:
        return jsonify({'success': False, 'error': 'symbols list is required'}), 400

    session_date = data.get('sessionDate')
    if session_date:
        try:
            session_date = datetime.fromisoformat(session_date).date()
        except Exception:
            session_date = datetime.now().date()
    else:
        session_date = datetime.now().date()

    saved, skipped, errors, preview = 0, 0, [], []
    try:
        conn = _pyodbc.connect(HOURLY_CONN_STR); cur = conn.cursor()
        for sym in symbols:
            try:
                t    = yf.Ticker(f"{sym}.NS")
                hist = t.history(period='5d', interval='1d')
                if hist is None or hist.empty:
                    skipped += 1
                    errors.append(f"{sym}: no Yahoo data")
                    continue
                # Row for the target session date (default: most recent)
                target_row = hist.iloc[-1]
                o = float(target_row['Open']); h = float(target_row['High'])
                l = float(target_row['Low']);  c = float(target_row['Close'])
                ohlc_avg     = round((o + h + l + c) / 4.0, 4)
                typical      = round((h + l + c) / 3.0,   4)
                open_low_avg = round((o + l) / 2.0,       4)

                p = _tomorrow_prediction_from_cache(sym)
                if p is None:
                    skipped += 1
                    errors.append(f"{sym}: no cached model — call /api/predict/{sym} once first")
                    continue

                save_daily_avg_row(
                    cur,
                    symbol               = sym,
                    session_date         = session_date,
                    open_price           = o, high_price = h, low_price = l, close_price = c,
                    ohlc_avg             = ohlc_avg,
                    typical_price        = typical,
                    open_low_avg         = open_low_avg,
                    predicted_price      = p['predictedNextDayPrice'],
                    predicted_change_pct = p['predictedNextDayChangePct'],
                    predicted_signal     = p['signalTomorrow'],
                )
                saved += 1
                preview.append({
                    'symbol': sym, 'sessionDate': session_date.isoformat(),
                    'open': o, 'high': h, 'low': l, 'close': c,
                    'ohlcAvg': ohlc_avg, 'typical': typical, 'openLowAvg': open_low_avg,
                    'predictedNextDayPrice': p['predictedNextDayPrice'],
                    'predictedNextDayChangePct': p['predictedNextDayChangePct'],
                    'predictedNextDaySignal': p['signalTomorrow'],
                })
            except Exception as e:
                errors.append(f"{sym}: {e}")
        conn.commit(); conn.close()
        return jsonify({
            'success': True, 'saved': saved, 'skipped': skipped,
            'sessionDate': session_date.isoformat(),
            'errors': errors, 'preview': preview,
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


app.add_url_rule(
    "/api/prediction/save",
    view_func=save_prediction,
    methods=["POST"]
)
app.add_url_rule(
    "/api/volatile/save-batch",
    view_func=save_volatile_batch,
    methods=["POST"]
)
app.add_url_rule(
    "/api/prediction/history/<symbol>",
    view_func=get_prediction_history,
    methods=["GET"]
)
app.add_url_rule(
    "/api/auth/signup",
    view_func=signup_user,
    methods=["POST"]
)
app.add_url_rule(
    "/api/auth/login",
    view_func=login_user,
    methods=["POST"]
)

# Hourly + daily-avg manual save/read endpoints. The /run-batch endpoints are
# decorated directly above (they need ML helpers from this module).
app.add_url_rule("/api/hourly/save",             view_func=save_hourly_endpoint,        methods=["POST"])
app.add_url_rule("/api/hourly/<symbol>",         view_func=get_hourly_endpoint,         methods=["GET"])
app.add_url_rule("/api/dailyavg/save",           view_func=save_daily_avg_endpoint,     methods=["POST"])
app.add_url_rule("/api/dailyavg/<symbol>",       view_func=get_daily_avg_endpoint,      methods=["GET"])
app.add_url_rule("/api/dailyavg/backfill",       view_func=backfill_daily_avg_actuals,  methods=["POST"])


# ═══════════════════════════════════════════════════════════
# GROQ AI ANALYST REPORT
# ═══════════════════════════════════════════════════════════

@app.route('/api/groq-report/<symbol>', methods=['POST'])
def groq_ai_report(symbol):
    """Generate a Groq-powered AI analyst report for a stock."""
    groq_api_key = os.environ.get('GROQ_API_KEY', '')
    if not groq_api_key:
        return jsonify({'success': False, 'error': 'GROQ_API_KEY not set. Restart Flask after adding it to .env.local'}), 500

    try:
        body = request.get_json(force=True) or {}
        name             = body.get('name', symbol)
        sector           = body.get('sector', 'Unknown')
        current_price    = body.get('currentPrice', 'N/A')
        price_change_pct = body.get('priceChangePct', 0)
        signal           = body.get('signal', 'HOLD')
        data_points      = body.get('dataPoints', 0)
        indicators       = body.get('indicators', {})
        tf_predictions   = body.get('timeframePredictions', [])
        price_forecasts  = body.get('priceForecastsByTimeframe', {})
        buy_votes        = body.get('buyVotes', 0)
        hold_votes       = body.get('holdVotes', 0)
        sell_votes       = body.get('sellVotes', 0)

        # Build timeframe section
        tf_lines = []
        keys = ['tomorrow', 'next_week', 'next_month', 'next_3m', 'next_year']
        for i, tf in enumerate(tf_predictions):
            key = keys[i] if i < len(keys) else ''
            pf = price_forecasts.get(key, {})
            price_str = f"  -> Target: Rs{pf.get('price', '?')} ({pf.get('changePercent', 0):+.1f}%)" if pf else ''
            tf_lines.append(
                f"  - {tf.get('timeframe', '?')}: {tf.get('signal', '?')} | "
                f"B:{tf.get('buyProb', 0)}% H:{tf.get('holdProb', 0)}% S:{tf.get('sellProb', 0)}% | "
                f"Accuracy: {tf.get('accuracy', 0)}%{price_str}"
            )
        tf_section = '\n'.join(tf_lines) if tf_lines else '  No ML predictions loaded yet.'

        prompt = f"""You are a senior equity research analyst at a top Indian brokerage covering NSE stocks.
Write a concise, data-grounded analyst report for {symbol} ({name}) based ONLY on the data below.
Do NOT invent numbers. Be specific and direct.

=== STOCK DATA ===
Symbol: {symbol} | Company: {name} | Sector: {sector}
Current Price: Rs{current_price} ({price_change_pct:+.2f}% today)
Historical Data: {data_points} trading days

=== TECHNICAL INDICATORS ===
RSI(14): {indicators.get('rsi', 'N/A')}
MACD: {indicators.get('macd', 'N/A')} | Signal Line: {indicators.get('macd_signal', 'N/A')}
Bollinger %B: {indicators.get('bb_pct', 'N/A')}
Stoch K: {indicators.get('stoch_k', 'N/A')} | CCI(20): {indicators.get('cci', 'N/A')}
Williams %R: {indicators.get('williams_r', 'N/A')} | ATR: {indicators.get('atr', 'N/A')}
Volume Ratio: {indicators.get('volume_ratio', 'N/A')}x
MA20: Rs{indicators.get('ma20', 'N/A')} | MA50: Rs{indicators.get('ma50', 'N/A')} | MA200: Rs{indicators.get('ma200', 'N/A')}
Momentum: {indicators.get('momentum', 'N/A')}

=== ML SIGNALS ===
Overall Signal: {signal}
Vote Tally: BUY={buy_votes} | HOLD={hold_votes} | SELL={sell_votes}
Timeframe Predictions:
{tf_section}

=== WRITE EXACTLY THESE 5 SECTIONS ===

**Technical Picture**
2-3 sentences covering RSI, MACD crossover, Bollinger position, and MA alignment. Use exact numbers.

**Volume & Momentum**
1-2 sentences on volume ratio, ATR, and momentum.

**ML Model Outlook**
2-3 sentences on what the ensemble signals across timeframes mean. Note any short vs long horizon conflicts. Be honest about accuracy.

**Key Levels to Watch**
Bullet points for support (near MAs) and resistance levels derived from the data.

**Recommendation**
One clear verdict sentence. Then: "This is AI-generated research for educational purposes only. Not SEBI-registered financial advice."
"""

        resp = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers={'Authorization': f'Bearer {groq_api_key}', 'Content-Type': 'application/json'},
            json={'model': 'openai/gpt-oss-120b', 'messages': [{'role': 'user', 'content': prompt}],
                  'max_tokens': 900, 'temperature': 0.45},
            timeout=30,
        )

        if resp.status_code != 200:
            return jsonify({'success': False, 'error': f'Groq API error {resp.status_code}: {resp.text[:300]}'}), 502

        data = resp.json()
        report_text = data['choices'][0]['message']['content']
        usage = data.get('usage', {})
        return jsonify({'success': True, 'report': report_text, 'symbol': symbol,
                        'model': 'openai/gpt-oss-120b', 'tokens': usage.get('total_tokens', 0)})

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════
# MULTI-AGENT SIMULATION + REDDIT SENTIMENT
# ═══════════════════════════════════════════════════════════

try:
    from multi_agent import run_multi_agent_analysis
    from reddit_sentiment import scrape_reddit_sentiment, get_status as get_reddit_status
    MULTI_AGENT_AVAILABLE = True
except ImportError as e:
    print(f"   WARN: Multi-agent module not loaded: {e}")
    MULTI_AGENT_AVAILABLE = False


@app.route('/api/multi-agent-analysis/<symbol>', methods=['POST'])
def multi_agent_analysis(symbol):
    """Run full multi-agent analysis (5 agents + LLM consensus) for a stock."""
    if not MULTI_AGENT_AVAILABLE:
        return jsonify({'success': False, 'error': 'Multi-agent module not available. Check imports.'}), 500

    try:
        body = request.get_json(force=True) or {}

        # Build data dict for agents from POST body (sent by frontend)
        data = {
            'name':                     body.get('name', symbol),
            'sector':                   body.get('sector', 'Unknown'),
            'industry':                 body.get('industry', 'Unknown'),
            'currentPrice':             body.get('currentPrice', 0),
            'priceChangePct':           body.get('priceChangePct', 0),
            'dailyVolPct':              body.get('dailyVolPct', 0),
            'overallSignal':            body.get('overallSignal', 'HOLD'),
            'dataPoints':               body.get('dataPoints', 0),
            'indicators':               body.get('indicators', {}),
            'financials':               body.get('financials', {}),
            'timeframePredictions':      body.get('timeframePredictions', []),
            'priceForecastsByTimeframe': body.get('priceForecastsByTimeframe', {}),
            'buyVotes':                 body.get('buyVotes', 0),
            'holdVotes':                body.get('holdVotes', 0),
            'sellVotes':                body.get('sellVotes', 0),
        }

        result = run_multi_agent_analysis(symbol, data)
        return jsonify(sanitize_for_json(result))

    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reddit-sentiment/<symbol>', methods=['GET'])
def reddit_sentiment_endpoint(symbol):
    """Quick Reddit sentiment lookup for a stock."""
    if not MULTI_AGENT_AVAILABLE:
        return jsonify({'success': False, 'error': 'Reddit sentiment module not available.'}), 500

    try:
        result = scrape_reddit_sentiment(symbol.upper())
        return jsonify(sanitize_for_json({'success': True, **result}))
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/reddit-status', methods=['GET'])
def reddit_status_endpoint():
    """Check Reddit API status and module availability."""
    if not MULTI_AGENT_AVAILABLE:
        return jsonify({'success': False, 'available': False, 'error': 'Module not loaded'})
    try:
        status = get_reddit_status()
        return jsonify({'success': True, **status})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════
# MACRO INDICATORS + OPTIONS FLOW + EARNINGS ENDPOINTS
# ═══════════════════════════════════════════════════════════

@app.route('/api/macro', methods=['GET'])
def macro_endpoint():
    """Get current macro environment data."""
    try:
        from macro_indicators import fetch_macro_data
        data = fetch_macro_data()
        return jsonify(sanitize_for_json({'success': True, **data}))
    except ImportError:
        return jsonify({'success': False, 'error': 'Macro indicators module not available'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/options-flow/<symbol>', methods=['GET'])
def options_flow_endpoint(symbol):
    """Get options chain analysis for a stock."""
    try:
        from options_flow import get_options_flow
        data = get_options_flow(symbol.upper())
        return jsonify(sanitize_for_json({'success': True, **data}))
    except ImportError:
        return jsonify({'success': False, 'error': 'Options flow module not available'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/earnings/<symbol>', methods=['GET'])
def earnings_endpoint(symbol):
    """Get earnings intelligence for a stock."""
    try:
        from earnings_model import get_earnings_intelligence
        data = get_earnings_intelligence(symbol.upper())
        return jsonify(sanitize_for_json({'success': True, **data}))
    except ImportError:
        return jsonify({'success': False, 'error': 'Earnings model module not available'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/market/overview', methods=['GET'])
def market_overview_endpoint():
    """Get market overview data for dashboard."""
    try:
        from macro_indicators import fetch_macro_data
        macro = fetch_macro_data()

        overview = {
            'success': True,
            'nifty50': macro.get('nifty50', {}),
            'niftyBank': macro.get('nifty_bank', {}),
            'indiaVix': macro.get('india_vix', {}),
            'usdInr': macro.get('usdinr', {}),
            'crudeOil': macro.get('crude_oil', {}),
            'gold': macro.get('gold', {}),
            'us10y': macro.get('us_10y', {}),
            'macroSignals': macro.get('signals', {}),
            'macroAlpha': macro.get('macro_alpha', 0),
            'macroLabel': macro.get('macro_label', 'Neutral'),
            'staticMacro': macro.get('static', {}),
            'timestamp': macro.get('timestamp', ''),
        }
        return jsonify(sanitize_for_json(overview))
    except ImportError:
        return jsonify({'success': False, 'error': 'Macro module not available'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/market/sector-heatmap', methods=['GET'])
def sector_heatmap_endpoint():
    """Get sector-level performance data."""
    try:
        import yfinance as _yf2
        sectors = {
            'NIFTY IT':    '^CNXIT',
            'NIFTY BANK':  '^NSEBANK',
            'NIFTY PHARMA':'NIFTY_PHARMA.NS',
            'NIFTY AUTO':  'NIFTY_AUTO.NS',
            'NIFTY FMCG':  'NIFTY_FMCG.NS',
            'NIFTY METAL': 'NIFTY_METAL.NS',
            'NIFTY REALTY': 'NIFTY_REALTY.NS',
            'NIFTY ENERGY': 'NIFTY_ENERGY.NS',
        }
        results = []
        for name, ticker in sectors.items():
            try:
                t = _yf2.Ticker(ticker)
                h = t.history(period='5d')
                if h is not None and len(h) >= 2:
                    latest = float(h['Close'].iloc[-1])
                    prev = float(h['Close'].iloc[-2])
                    chg = ((latest - prev) / prev) * 100
                    results.append({'sector': name, 'value': round(latest, 2), 'changePct': round(chg, 2)})
            except Exception:
                results.append({'sector': name, 'value': None, 'changePct': 0})
        return jsonify({'success': True, 'sectors': results})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ═══════════════════════════════════════════════════════════
# PORTFOLIO & WATCHLIST ENDPOINTS (localStorage-backed)
# ═══════════════════════════════════════════════════════════

@app.route('/api/watchlist/prices', methods=['POST'])
def watchlist_prices_endpoint():
    """Get live prices for a list of symbols (sent by frontend watchlist)."""
    try:
        body = request.get_json(force=True) or {}
        symbols = body.get('symbols', [])
        if not symbols:
            return jsonify({'success': True, 'prices': {}})

        prices = {}
        for sym in symbols[:50]:  # Cap at 50
            try:
                t = yf.Ticker(f"{sym}.NS")
                h = t.history(period='2d')
                if h is not None and not h.empty:
                    latest = float(h['Close'].iloc[-1])
                    prev = float(h['Close'].iloc[-2]) if len(h) > 1 else latest
                    prices[sym] = {
                        'price': round(latest, 2),
                        'change': round(latest - prev, 2),
                        'changePct': round(((latest - prev) / prev) * 100, 2) if prev else 0,
                    }
            except Exception:
                prices[sym] = {'price': None, 'change': 0, 'changePct': 0}

        return jsonify({'success': True, 'prices': prices})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ═══════════════════════════════════════════════════════════
# BACKTESTING ENDPOINT
# ═══════════════════════════════════════════════════════════

@app.route('/api/backtest/<symbol>', methods=['POST'])
def backtest_endpoint(symbol):
    """Run walk-forward backtest for a stock."""
    try:
        from backtesting import run_backtest
        body = request.get_json(force=True) or {}
        start_date = body.get('startDate')
        end_date = body.get('endDate')
        horizon = int(body.get('horizonDays', 5))
        data = run_backtest(symbol.upper(), start_date, end_date, horizon)
        return jsonify(sanitize_for_json(data))
    except ImportError:
        return jsonify({'success': False, 'error': 'Backtesting module not available'}), 500
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("="*55)
    # Avoid UnicodeEncodeError on Windows terminals with cp1252.
    print("AmeyaFX Real ML API v2")
    print("="*55)
    print(f"LSTM: {LSTM_AVAILABLE}")
    print(f"Multi-Agent: {MULTI_AGENT_AVAILABLE}")
    try:
        s=fetch_nse_stocks()
        print(f"{len(s)} real NSE stocks loaded")
    except Exception as e:
        print(f"Startup warning: {e}")
    print("API: http://localhost:5000")
    print("="*55)
    app.run(debug=False, port=5000, host='0.0.0.0', threaded=True)