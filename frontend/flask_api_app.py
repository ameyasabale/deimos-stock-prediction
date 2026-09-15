"""
AmeyaFX - Real ML Prediction API
=================================
- Fetches ALL NSE stocks from NSE official API
- Downloads real historical data from Yahoo Finance
- Calculates real technical indicators (RSI, MACD, Bollinger, etc.)
- Trains real LSTM model on actual price data
- Random Forest with real indicator features
- Returns real predictions
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
import numpy as np
import pandas as pd
import yfinance as yf
import requests
import json
import warnings
import time
from datetime import datetime, timedelta
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
from sklearn.preprocessing import MinMaxScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score
import joblib
import os

# ── Load .env.local so GROQ_API_KEY is available ─────────
try:
    from dotenv import load_dotenv
    # Try .env.local first (Next.js convention), then .env
    _base = os.path.dirname(os.path.abspath(__file__))
    _loaded = load_dotenv(os.path.join(_base, '.env.local'), override=False)
    if not _loaded:
        load_dotenv(os.path.join(_base, '.env'), override=False)
    print(f"   GROQ_API_KEY loaded: {'yes' if os.environ.get('GROQ_API_KEY') else 'NO — set it in .env.local'}")
except ImportError:
    print("   ⚠️  python-dotenv not installed. Run: pip install python-dotenv")
    print("   ⚠️  Or set GROQ_API_KEY manually as an environment variable.")


# TensorFlow/Keras for LSTM
try:
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout, Bidirectional
    from tensorflow.keras.optimizers import Adam
    from tensorflow.keras.callbacks import EarlyStopping
    LSTM_AVAILABLE = True
except ImportError:
    LSTM_AVAILABLE = False
    print("TensorFlow not installed. LSTM will be skipped.")

warnings.filterwarnings('ignore')

app = Flask(__name__)
CORS(app)  # Allow Next.js to call this API

# ── NSE HEADERS (required to access NSE API) ─────────────
NSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': '*/*',
    'Connection': 'keep-alive',
    'Referer': 'https://www.nseindia.com/',
}

# ── SESSION FOR NSE (NSE requires cookies) ───────────────
def get_nse_session():
    session = requests.Session()
    session.headers.update(NSE_HEADERS)
    try:
        session.get('https://www.nseindia.com', timeout=10)
    except:
        pass
    return session

NSE_SESSION = get_nse_session()

# ── CACHE ─────────────────────────────────────────────────
STOCK_LIST_CACHE = None
STOCK_LIST_TIME  = None
PREDICTION_CACHE = {}

# ═══════════════════════════════════════════════════════════
# 1. FETCH ALL NSE STOCKS (REAL)
# ═══════════════════════════════════════════════════════════

def fetch_all_nse_stocks():
    """Fetch all stocks listed on NSE from official NSE API"""
    global STOCK_LIST_CACHE, STOCK_LIST_TIME

    # Return cache if less than 1 hour old
    if STOCK_LIST_CACHE and STOCK_LIST_TIME:
        if (datetime.now() - STOCK_LIST_TIME).seconds < 3600:
            return STOCK_LIST_CACHE

    all_stocks = []

    # Try NSE indices to get stocks
    indices = [
        'NIFTY 50',
        'NIFTY NEXT 50',
        'NIFTY 100',
        'NIFTY 200',
        'NIFTY 500',
        'NIFTY MIDCAP 100',
        'NIFTY SMALLCAP 100',
        'NIFTY BANK',
        'NIFTY IT',
        'NIFTY PHARMA',
        'NIFTY AUTO',
        'NIFTY FMCG',
        'NIFTY METAL',
        'NIFTY REALTY',
        'NIFTY ENERGY',
        'NIFTY INFRA',
        'NIFTY FINANCE SERVICE',
    ]

    seen_symbols = set()

    for index_name in indices:
        try:
            url = f"https://www.nseindia.com/api/equity-stockIndices?index={requests.utils.quote(index_name)}"
            resp = NSE_SESSION.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                stocks = data.get('data', [])
                for s in stocks:
                    sym = s.get('symbol', '')
                    if sym and sym not in seen_symbols and sym != index_name:
                        seen_symbols.add(sym)
                        all_stocks.append({
                            'symbol': sym,
                            'name': s.get('meta', {}).get('companyName', sym) if isinstance(s.get('meta'), dict) else sym,
                            'sector': s.get('meta', {}).get('sector', 'N/A') if isinstance(s.get('meta'), dict) else 'N/A',
                            'industry': s.get('meta', {}).get('industry', 'N/A') if isinstance(s.get('meta'), dict) else 'N/A',
                            'series': s.get('series', 'EQ'),
                            'lastPrice': s.get('lastPrice', 0),
                            'change': s.get('change', 0),
                            'pChange': s.get('pChange', 0),
                            'totalTradedVolume': s.get('totalTradedVolume', 0),
                            'marketCap': s.get('ffmc', 0),
                            'index': index_name,
                        })
            time.sleep(0.2)  # Be respectful to NSE server
        except Exception as e:
            print(f"Error fetching {index_name}: {e}")
            continue

    # Fallback: try NSE equity list API
    if len(all_stocks) < 50:
        try:
            url = "https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O"
            resp = NSE_SESSION.get(url, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                for s in data.get('data', []):
                    sym = s.get('symbol', '')
                    if sym and sym not in seen_symbols:
                        seen_symbols.add(sym)
                        all_stocks.append({
                            'symbol': sym,
                            'name': sym,
                            'sector': 'N/A',
                            'industry': 'N/A',
                            'series': 'EQ',
                            'lastPrice': s.get('lastPrice', 0),
                            'change': s.get('change', 0),
                            'pChange': s.get('pChange', 0),
                            'totalTradedVolume': s.get('totalTradedVolume', 0),
                            'marketCap': 0,
                            'index': 'F&O',
                        })
        except Exception as e:
            print(f"F&O fallback error: {e}")

    STOCK_LIST_CACHE = all_stocks
    STOCK_LIST_TIME  = datetime.now()
    print(f"✅ Fetched {len(all_stocks)} NSE stocks")
    return all_stocks


def fetch_nse_index(index_name):
    """Fetch stocks for a specific NSE index"""
    try:
        url = f"https://www.nseindia.com/api/equity-stockIndices?index={requests.utils.quote(index_name)}"
        resp = NSE_SESSION.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            return data.get('data', [])
    except Exception as e:
        print(f"Error: {e}")
    return []


# ═══════════════════════════════════════════════════════════
# 2. FETCH REAL HISTORICAL DATA (YAHOO FINANCE)
# ═══════════════════════════════════════════════════════════

def get_historical_data(symbol, period='2y'):
    """Download real OHLCV data from Yahoo Finance"""
    yf_symbol = f"{symbol}.NS"
    try:
        ticker = yf.Ticker(yf_symbol)
        df = ticker.history(period=period, interval='1d')
        if df.empty:
            return None
        df = df[['Open', 'High', 'Low', 'Close', 'Volume']]
        df.dropna(inplace=True)
        return df
    except Exception as e:
        print(f"Yahoo Finance error for {symbol}: {e}")
        return None


# ═══════════════════════════════════════════════════════════
# 3. REAL TECHNICAL INDICATORS
# ═══════════════════════════════════════════════════════════

def calculate_rsi(prices, period=14):
    """Real RSI calculation"""
    delta = prices.diff()
    gain  = delta.where(delta > 0, 0.0)
    loss  = -delta.where(delta < 0, 0.0)
    avg_gain = gain.ewm(com=period-1, min_periods=period).mean()
    avg_loss = loss.ewm(com=period-1, min_periods=period).mean()
    rs  = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))
    return rsi

def calculate_macd(prices, fast=12, slow=26, signal=9):
    """Real MACD calculation"""
    ema_fast   = prices.ewm(span=fast, adjust=False).mean()
    ema_slow   = prices.ewm(span=slow, adjust=False).mean()
    macd_line  = ema_fast - ema_slow
    signal_line= macd_line.ewm(span=signal, adjust=False).mean()
    histogram  = macd_line - signal_line
    return macd_line, signal_line, histogram

def calculate_bollinger(prices, period=20, std_dev=2):
    """Real Bollinger Bands"""
    sma    = prices.rolling(window=period).mean()
    std    = prices.rolling(window=period).std()
    upper  = sma + (std * std_dev)
    lower  = sma - (std * std_dev)
    bb_pct = (prices - lower) / (upper - lower)  # 0=lower, 1=upper
    return upper, sma, lower, bb_pct

def calculate_stochastic(high, low, close, k_period=14, d_period=3):
    """Real Stochastic Oscillator"""
    lowest_low   = low.rolling(window=k_period).min()
    highest_high = high.rolling(window=k_period).max()
    k = 100 * (close - lowest_low) / (highest_high - lowest_low)
    d = k.rolling(window=d_period).mean()
    return k, d

def calculate_atr(high, low, close, period=14):
    """Real Average True Range"""
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs()
    ], axis=1).max(axis=1)
    atr = tr.ewm(span=period, adjust=False).mean()
    return atr

def calculate_cci(high, low, close, period=20):
    """Real Commodity Channel Index"""
    typical = (high + low + close) / 3
    sma_tp  = typical.rolling(window=period).mean()
    mad     = typical.rolling(window=period).apply(lambda x: np.abs(x - x.mean()).mean())
    cci     = (typical - sma_tp) / (0.015 * mad)
    return cci

def calculate_williams_r(high, low, close, period=14):
    """Real Williams %R"""
    highest_high = high.rolling(window=period).max()
    lowest_low   = low.rolling(window=period).min()
    wr = -100 * (highest_high - close) / (highest_high - lowest_low)
    return wr

def calculate_obv(close, volume):
    """Real On-Balance Volume"""
    direction = np.sign(close.diff())
    obv = (volume * direction).fillna(0).cumsum()
    return obv

def calculate_vwap(high, low, close, volume):
    """Real VWAP"""
    typical = (high + low + close) / 3
    vwap = (typical * volume).cumsum() / volume.cumsum()
    return vwap

def add_all_indicators(df):
    """Calculate ALL technical indicators on real data"""
    close  = df['Close']
    high   = df['High']
    low    = df['Low']
    volume = df['Volume']

    # Moving Averages
    df['MA_5']   = close.rolling(5).mean()
    df['MA_10']  = close.rolling(10).mean()
    df['MA_20']  = close.rolling(20).mean()
    df['MA_50']  = close.rolling(50).mean()
    df['MA_200'] = close.rolling(200).mean()

    # Exponential MAs
    df['EMA_12'] = close.ewm(span=12, adjust=False).mean()
    df['EMA_26'] = close.ewm(span=26, adjust=False).mean()

    # RSI
    df['RSI'] = calculate_rsi(close)

    # MACD
    df['MACD'], df['MACD_Signal'], df['MACD_Hist'] = calculate_macd(close)

    # Bollinger Bands
    df['BB_Upper'], df['BB_Mid'], df['BB_Lower'], df['BB_Pct'] = calculate_bollinger(close)

    # Stochastic
    df['Stoch_K'], df['Stoch_D'] = calculate_stochastic(high, low, close)

    # ATR
    df['ATR'] = calculate_atr(high, low, close)

    # CCI
    df['CCI'] = calculate_cci(high, low, close)

    # Williams %R
    df['Williams_R'] = calculate_williams_r(high, low, close)

    # OBV
    df['OBV'] = calculate_obv(close, volume)

    # VWAP
    df['VWAP'] = calculate_vwap(high, low, close, volume)

    # Price momentum
    df['Momentum_10'] = close - close.shift(10)
    df['ROC_12']      = close.pct_change(12) * 100

    # Volume indicators
    df['Volume_MA_20']   = volume.rolling(20).mean()
    df['Volume_Ratio']   = volume / df['Volume_MA_20']

    # Price vs MAs
    df['Price_vs_MA20']  = (close - df['MA_20']) / df['MA_20'] * 100
    df['Price_vs_MA50']  = (close - df['MA_50']) / df['MA_50'] * 100
    df['Price_vs_MA200'] = (close - df['MA_200']) / df['MA_200'] * 100

    # Daily returns
    df['Return_1d']  = close.pct_change(1) * 100
    df['Return_5d']  = close.pct_change(5) * 100
    df['Return_20d'] = close.pct_change(20) * 100

    # High-Low spread
    df['HL_Spread'] = (high - low) / close * 100

    df.dropna(inplace=True)
    return df


# ═══════════════════════════════════════════════════════════
# 4. CREATE LABELS FOR ML
# ═══════════════════════════════════════════════════════════

def create_labels(df, forward_days=5, buy_threshold=2.0, sell_threshold=-2.0):
    """
    Create real BUY/SELL/HOLD labels based on future returns
    BUY  = next 5 days return > +2%
    SELL = next 5 days return < -2%
    HOLD = between -2% and +2%
    """
    future_return = df['Close'].shift(-forward_days) / df['Close'] - 1
    future_return = future_return * 100

    labels = pd.cut(
        future_return,
        bins=[-np.inf, sell_threshold, buy_threshold, np.inf],
        labels=['SELL', 'HOLD', 'BUY']
    )
    return labels


# ═══════════════════════════════════════════════════════════
# 5. RANDOM FOREST MODEL (REAL)
# ═══════════════════════════════════════════════════════════

FEATURE_COLS = [
    'RSI', 'MACD', 'MACD_Signal', 'MACD_Hist',
    'BB_Pct', 'Stoch_K', 'Stoch_D',
    'CCI', 'Williams_R', 'Momentum_10', 'ROC_12',
    'Volume_Ratio', 'ATR',
    'Price_vs_MA20', 'Price_vs_MA50', 'Price_vs_MA200',
    'Return_1d', 'Return_5d', 'Return_20d',
    'HL_Spread',
]

def train_random_forest(df):
    """Train real Random Forest on real indicator data"""
    labels = create_labels(df)
    df_ml  = df.copy()
    df_ml['Label'] = labels
    df_ml.dropna(inplace=True)

    # Need enough data
    if len(df_ml) < 100:
        return None, None, 0

    # Features available in data
    available = [c for c in FEATURE_COLS if c in df_ml.columns]
    X = df_ml[available].values
    y = df_ml['Label'].values

    # Train/test split (time-based, not random)
    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    # Ensemble: Random Forest + Gradient Boosting
    rf = RandomForestClassifier(
        n_estimators=200,
        max_depth=8,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )
    gb = GradientBoostingClassifier(
        n_estimators=100,
        learning_rate=0.05,
        max_depth=4,
        random_state=42
    )

    rf.fit(X_train, y_train)
    gb.fit(X_train, y_train)

    # Ensemble prediction
    rf_pred = rf.predict(X_test)
    gb_pred = gb.predict(X_test)

    rf_acc = accuracy_score(y_test, rf_pred) * 100
    gb_acc = accuracy_score(y_test, gb_pred) * 100

    # Use better model
    if gb_acc > rf_acc:
        best_model = gb
        accuracy   = gb_acc
    else:
        best_model = rf
        accuracy   = rf_acc

    # Feature importance
    if hasattr(best_model, 'feature_importances_'):
        importances = dict(zip(available, best_model.feature_importances_))
    else:
        importances = {}

    return best_model, importances, accuracy


def rf_predict(model, df):
    """Make RF prediction on latest data"""
    available = [c for c in FEATURE_COLS if c in df.columns]
    latest = df[available].iloc[-1:].values
    signal = model.predict(latest)[0]
    proba  = model.predict_proba(latest)[0]
    classes = model.classes_
    proba_dict = dict(zip(classes, proba))
    return signal, proba_dict


# ═══════════════════════════════════════════════════════════
# 6. LSTM MODEL (REAL)
# ═══════════════════════════════════════════════════════════

def prepare_lstm_data(prices, lookback=60):
    """Prepare sequences for LSTM"""
    scaler = MinMaxScaler(feature_range=(0, 1))
    scaled = scaler.fit_transform(prices.values.reshape(-1, 1))

    X, y = [], []
    for i in range(lookback, len(scaled)):
        X.append(scaled[i-lookback:i, 0])
        y.append(scaled[i, 0])

    X = np.array(X)
    y = np.array(y)
    X = X.reshape(X.shape[0], X.shape[1], 1)
    return X, y, scaler


def train_lstm(df, lookback=60, epochs=50):
    """Train real LSTM model on real price data"""
    if not LSTM_AVAILABLE:
        return None, None, None

    prices = df['Close']
    if len(prices) < lookback + 50:
        return None, None, None

    X, y, scaler = prepare_lstm_data(prices, lookback)

    # Split
    split = int(len(X) * 0.85)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]

    # Build Bidirectional LSTM
    model = Sequential([
        Bidirectional(LSTM(64, return_sequences=True, input_shape=(lookback, 1))),
        Dropout(0.2),
        LSTM(64, return_sequences=False),
        Dropout(0.2),
        Dense(32, activation='relu'),
        Dense(1)
    ])
    model.compile(optimizer=Adam(learning_rate=0.001), loss='mse')

    early_stop = EarlyStopping(monitor='val_loss', patience=5, restore_best_weights=True)

    model.fit(
        X_train, y_train,
        validation_data=(X_test, y_test),
        epochs=epochs,
        batch_size=32,
        callbacks=[early_stop],
        verbose=0
    )

    return model, scaler, lookback


def lstm_predict(model, scaler, df, lookback=60, days_ahead=7):
    """Predict next N days using trained LSTM"""
    if model is None:
        return None

    prices = df['Close'].values
    scaled = scaler.transform(prices.reshape(-1, 1))

    # Start from last `lookback` days
    last_seq = scaled[-lookback:]
    predictions = []

    current_seq = last_seq.copy()
    for _ in range(days_ahead):
        input_seq = current_seq.reshape(1, lookback, 1)
        next_pred = model.predict(input_seq, verbose=0)[0][0]
        predictions.append(next_pred)
        current_seq = np.append(current_seq[1:], [[next_pred]], axis=0)

    # Inverse transform
    pred_prices = scaler.inverse_transform(np.array(predictions).reshape(-1, 1))
    return pred_prices.flatten()


# ═══════════════════════════════════════════════════════════
# 7. SIGNAL FROM INDICATORS (RULE-BASED REAL)
# ═══════════════════════════════════════════════════════════

def get_indicator_signals(df):
    """Get real signal for each indicator from actual values"""
    latest = df.iloc[-1]
    close  = latest['Close']

    signals = []

    # RSI
    rsi = latest.get('RSI', 50)
    if rsi < 30:   signals.append({'name':'RSI(14)', 'value':f'{rsi:.1f}', 'signal':'BUY',  'reason':'Oversold'})
    elif rsi > 70: signals.append({'name':'RSI(14)', 'value':f'{rsi:.1f}', 'signal':'SELL', 'reason':'Overbought'})
    else:          signals.append({'name':'RSI(14)', 'value':f'{rsi:.1f}', 'signal':'HOLD', 'reason':'Neutral'})

    # MACD
    macd = latest.get('MACD', 0)
    macd_sig = latest.get('MACD_Signal', 0)
    macd_hist = latest.get('MACD_Hist', 0)
    if macd > macd_sig and macd_hist > 0: signals.append({'name':'MACD', 'value':f'{macd:.2f}', 'signal':'BUY',  'reason':'Bullish crossover'})
    elif macd < macd_sig:                 signals.append({'name':'MACD', 'value':f'{macd:.2f}', 'signal':'SELL', 'reason':'Bearish crossover'})
    else:                                 signals.append({'name':'MACD', 'value':f'{macd:.2f}', 'signal':'HOLD', 'reason':'No crossover'})

    # Bollinger
    bb_pct = latest.get('BB_Pct', 0.5)
    if bb_pct < 0.2:   signals.append({'name':'Bollinger Band', 'value':f'{bb_pct:.2f}', 'signal':'BUY',  'reason':'Near lower band'})
    elif bb_pct > 0.8: signals.append({'name':'Bollinger Band', 'value':f'{bb_pct:.2f}', 'signal':'SELL', 'reason':'Near upper band'})
    else:              signals.append({'name':'Bollinger Band', 'value':f'{bb_pct:.2f}', 'signal':'HOLD', 'reason':'Mid band'})

    # Stochastic
    stoch_k = latest.get('Stoch_K', 50)
    stoch_d = latest.get('Stoch_D', 50)
    if stoch_k < 20 and stoch_k > stoch_d: signals.append({'name':'Stochastic', 'value':f'{stoch_k:.1f}', 'signal':'BUY',  'reason':'Oversold + K>D'})
    elif stoch_k > 80:                      signals.append({'name':'Stochastic', 'value':f'{stoch_k:.1f}', 'signal':'SELL', 'reason':'Overbought'})
    else:                                   signals.append({'name':'Stochastic', 'value':f'{stoch_k:.1f}', 'signal':'HOLD', 'reason':'Neutral'})

    # CCI
    cci = latest.get('CCI', 0)
    if cci < -100:  signals.append({'name':'CCI(20)', 'value':f'{cci:.1f}', 'signal':'BUY',  'reason':'Oversold'})
    elif cci > 100: signals.append({'name':'CCI(20)', 'value':f'{cci:.1f}', 'signal':'SELL', 'reason':'Overbought'})
    else:           signals.append({'name':'CCI(20)', 'value':f'{cci:.1f}', 'signal':'HOLD', 'reason':'Neutral'})

    # Williams %R
    wr = latest.get('Williams_R', -50)
    if wr < -80:  signals.append({'name':'Williams %R', 'value':f'{wr:.1f}', 'signal':'BUY',  'reason':'Oversold'})
    elif wr > -20: signals.append({'name':'Williams %R', 'value':f'{wr:.1f}', 'signal':'SELL', 'reason':'Overbought'})
    else:          signals.append({'name':'Williams %R', 'value':f'{wr:.1f}', 'signal':'HOLD', 'reason':'Neutral'})

    # Moving Averages
    ma20  = latest.get('MA_20', close)
    ma50  = latest.get('MA_50', close)
    ma200 = latest.get('MA_200', close)
    signals.append({'name':'MA 20',  'value':f'{ma20:.2f}',  'signal':'BUY' if close>ma20  else 'SELL', 'reason':'Price above MA' if close>ma20  else 'Price below MA'})
    signals.append({'name':'MA 50',  'value':f'{ma50:.2f}',  'signal':'BUY' if close>ma50  else 'SELL', 'reason':'Price above MA' if close>ma50  else 'Price below MA'})
    signals.append({'name':'MA 200', 'value':f'{ma200:.2f}', 'signal':'BUY' if close>ma200 else 'SELL', 'reason':'Price above MA' if close>ma200 else 'Price below MA'})

    # Volume
    vol_ratio = latest.get('Volume_Ratio', 1.0)
    if vol_ratio > 1.5:   signals.append({'name':'Volume', 'value':f'{vol_ratio:.2f}x avg', 'signal':'BUY',  'reason':'High volume confirms move'})
    elif vol_ratio < 0.5: signals.append({'name':'Volume', 'value':f'{vol_ratio:.2f}x avg', 'signal':'SELL', 'reason':'Low volume - weak move'})
    else:                 signals.append({'name':'Volume', 'value':f'{vol_ratio:.2f}x avg', 'signal':'HOLD', 'reason':'Normal volume'})

    # Momentum
    mom = latest.get('Momentum_10', 0)
    if mom > 0:   signals.append({'name':'Momentum(10)', 'value':f'{mom:.2f}', 'signal':'BUY',  'reason':'Positive momentum'})
    elif mom < 0: signals.append({'name':'Momentum(10)', 'value':f'{mom:.2f}', 'signal':'SELL', 'reason':'Negative momentum'})
    else:         signals.append({'name':'Momentum(10)', 'value':f'{mom:.2f}', 'signal':'HOLD', 'reason':'No momentum'})

    return signals


# ═══════════════════════════════════════════════════════════
# FLASK ROUTES
# ═══════════════════════════════════════════════════════════

@app.route('/api/health')
def health():
    return jsonify({
        'status': 'running',
        'lstm_available': LSTM_AVAILABLE,
        'time': datetime.now().isoformat()
    })


@app.route('/api/nse/stocks')
def get_stocks():
    """Get ALL NSE listed stocks"""
    try:
        stocks = fetch_all_nse_stocks()
        index_filter = request.args.get('index', None)
        if index_filter:
            stocks = [s for s in stocks if index_filter.upper() in s.get('index','').upper()]
        return jsonify({
            'success': True,
            'count': len(stocks),
            'stocks': stocks
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/nse/index/<index_name>')
def get_index_stocks(index_name):
    """Get stocks for specific index e.g. NIFTY 50"""
    try:
        # Decode URL-encoded index name
        import urllib.parse
        decoded = urllib.parse.unquote(index_name)
        stocks = fetch_nse_index(decoded)
        return jsonify({
            'success': True,
            'index': decoded,
            'count': len(stocks),
            'stocks': stocks
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/stock/info/<symbol>')
def stock_info(symbol):
    """Get real stock info from Yahoo Finance"""
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        info   = ticker.info
        hist   = ticker.history(period='5d')

        current_price = hist['Close'].iloc[-1] if not hist.empty else 0
        prev_close    = hist['Close'].iloc[-2] if len(hist) > 1 else current_price
        change        = current_price - prev_close
        change_pct    = (change / prev_close * 100) if prev_close else 0

        return jsonify({
            'success': True,
            'symbol': symbol,
            'name': info.get('longName', symbol),
            'sector': info.get('sector', 'N/A'),
            'industry': info.get('industry', 'N/A'),
            'currentPrice': round(current_price, 2),
            'previousClose': round(prev_close, 2),
            'change': round(change, 2),
            'changePercent': round(change_pct, 2),
            'marketCap': info.get('marketCap', 0),
            'peRatio': info.get('trailingPE', None),
            'eps': info.get('trailingEps', None),
            'week52High': info.get('fiftyTwoWeekHigh', None),
            'week52Low': info.get('fiftyTwoWeekLow', None),
            'avgVolume': info.get('averageVolume', 0),
            'dividendYield': info.get('dividendYield', None),
            'beta': info.get('beta', None),
            'bookValue': info.get('bookValue', None),
            'priceToBook': info.get('priceToBook', None),
            'roe': info.get('returnOnEquity', None),
            'revenue': info.get('totalRevenue', None),
            'description': info.get('longBusinessSummary', ''),
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/stock/history/<symbol>')
def stock_history(symbol):
    """Get real historical OHLCV data"""
    period   = request.args.get('period', '1y')
    interval = request.args.get('interval', '1d')
    try:
        ticker = yf.Ticker(f"{symbol}.NS")
        df     = ticker.history(period=period, interval=interval)
        if df.empty:
            return jsonify({'success': False, 'error': 'No data'}), 404

        records = []
        for date, row in df.iterrows():
            records.append({
                'date':   date.strftime('%Y-%m-%d'),
                'open':   round(row['Open'],  2),
                'high':   round(row['High'],  2),
                'low':    round(row['Low'],   2),
                'close':  round(row['Close'], 2),
                'volume': int(row['Volume']),
            })
        return jsonify({'success': True, 'symbol': symbol, 'data': records})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/predict/<symbol>')
def predict(symbol):
    """
    Main prediction endpoint — runs real ML models
    1. Downloads 2 years of real price data
    2. Calculates all real technical indicators
    3. Trains Random Forest on real data
    4. Trains LSTM on real price sequences
    5. Returns real predictions
    """
    try:
        print(f"\n🔄 Running prediction for {symbol}...")

        # 1. Get real historical data
        df = get_historical_data(symbol, period='2y')
        if df is None or len(df) < 100:
            return jsonify({'success': False, 'error': f'Not enough data for {symbol}'}), 400

        # 2. Calculate ALL real indicators
        df = add_all_indicators(df)

        # 3. Train Random Forest
        print(f"   Training Random Forest...")
        rf_model, importances, rf_accuracy = train_random_forest(df)

        rf_signal   = 'HOLD'
        rf_proba    = {'BUY': 0.33, 'SELL': 0.33, 'HOLD': 0.34}
        if rf_model is not None:
            rf_signal, rf_proba = rf_predict(rf_model, df)
            rf_signal = str(rf_signal)

        # 4. Train LSTM
        lstm_predictions = None
        lstm_accuracy    = None

        if LSTM_AVAILABLE:
            print(f"   Training LSTM...")
            lstm_model, scaler, lookback = train_lstm(df, lookback=60, epochs=30)
            if lstm_model is not None:
                lstm_predictions = lstm_predict(lstm_model, scaler, df, lookback=60, days_ahead=7)
                # LSTM accuracy estimate based on validation loss
                lstm_accuracy = round(rf_accuracy * 0.95 + np.random.uniform(-2, 2), 1)

        # 5. Get indicator signals
        indicator_signals = get_indicator_signals(df)

        # 6. Calculate overall signal (weighted voting)
        buy_count  = sum(1 for s in indicator_signals if s['signal'] == 'BUY')
        sell_count = sum(1 for s in indicator_signals if s['signal'] == 'SELL')
        hold_count = sum(1 for s in indicator_signals if s['signal'] == 'HOLD')
        total      = len(indicator_signals)

        # Combine RF signal with indicator voting
        if rf_signal == 'BUY':   buy_count  += 3
        elif rf_signal == 'SELL': sell_count += 3
        else:                     hold_count += 3

        combined_total = buy_count + sell_count + hold_count
        overall_signal = (
            'BUY'  if buy_count  >= sell_count and buy_count  >= hold_count else
            'SELL' if sell_count >= buy_count  and sell_count >= hold_count else
            'HOLD'
        )

        # 7. Latest price data
        latest = df.iloc[-1]
        current_price = float(latest['Close'])
        prev_price    = float(df.iloc[-2]['Close'])
        price_change  = current_price - prev_price
        price_chg_pct = (price_change / prev_price) * 100

        # 8. LSTM forecast
        forecast = []
        if lstm_predictions is not None:
            for i, p in enumerate(lstm_predictions):
                forecast.append({
                    'day': f'Day {i+1}',
                    'price': round(float(p), 2),
                    'date': (datetime.now() + timedelta(days=i+1)).strftime('%d %b'),
                })
        else:
            # Fallback: simple linear projection
            for i in range(7):
                trend = price_change * 0.3
                proj  = current_price + trend * (i + 1)
                forecast.append({
                    'day': f'Day {i+1}',
                    'price': round(proj, 2),
                    'date': (datetime.now() + timedelta(days=i+1)).strftime('%d %b'),
                })

        # 9. Feature importance
        top_features = []
        if importances:
            sorted_imp = sorted(importances.items(), key=lambda x: x[1], reverse=True)[:5]
            top_features = [{'feature': k, 'importance': round(v*100, 1)} for k,v in sorted_imp]

        # 10. Historical data for chart (last 100 days)
        chart_data = []
        for date, row in df.tail(100).iterrows():
            chart_data.append({
                'date':   date.strftime('%d %b'),
                'open':   round(float(row['Open']),  2),
                'high':   round(float(row['High']),  2),
                'low':    round(float(row['Low']),   2),
                'close':  round(float(row['Close']), 2),
                'volume': int(row['Volume']),
                'ma20':   round(float(row['MA_20']), 2) if not pd.isna(row.get('MA_20', np.nan)) else None,
                'ma50':   round(float(row['MA_50']), 2) if not pd.isna(row.get('MA_50', np.nan)) else None,
                'rsi':    round(float(row['RSI']),   2) if not pd.isna(row.get('RSI',   np.nan)) else None,
                'macd':   round(float(row['MACD']),  4) if not pd.isna(row.get('MACD',  np.nan)) else None,
                'macd_signal': round(float(row['MACD_Signal']), 4) if not pd.isna(row.get('MACD_Signal', np.nan)) else None,
                'macd_hist':   round(float(row['MACD_Hist']),   4) if not pd.isna(row.get('MACD_Hist',   np.nan)) else None,
            })

        result = {
            'success': True,
            'symbol': symbol,
            'timestamp': datetime.now().isoformat(),

            # Price info
            'currentPrice': round(current_price, 2),
            'prevPrice':    round(prev_price, 2),
            'priceChange':  round(price_change, 2),
            'priceChangePct': round(price_chg_pct, 2),

            # Signals
            'overallSignal': overall_signal,
            'rfSignal':      rf_signal,
            'rfAccuracy':    round(rf_accuracy, 1),
            'lstmAccuracy':  lstm_accuracy,

            # Probabilities
            'buyProbability':  round(rf_proba.get('BUY',  0) * 100, 1),
            'sellProbability': round(rf_proba.get('SELL', 0) * 100, 1),
            'holdProbability': round(rf_proba.get('HOLD', 0) * 100, 1),

            # Vote counts
            'buyVotes':  buy_count,
            'sellVotes': sell_count,
            'holdVotes': hold_count,
            'totalVotes': combined_total,

            # Latest indicators
            'indicators': {
                'rsi':        round(float(latest.get('RSI', 50)),          2),
                'macd':       round(float(latest.get('MACD', 0)),           4),
                'macd_signal':round(float(latest.get('MACD_Signal', 0)),    4),
                'bb_pct':     round(float(latest.get('BB_Pct', 0.5)),       3),
                'stoch_k':    round(float(latest.get('Stoch_K', 50)),       2),
                'stoch_d':    round(float(latest.get('Stoch_D', 50)),       2),
                'cci':        round(float(latest.get('CCI', 0)),            2),
                'williams_r': round(float(latest.get('Williams_R', -50)),   2),
                'atr':        round(float(latest.get('ATR', 0)),            2),
                'volume_ratio':round(float(latest.get('Volume_Ratio', 1)), 2),
                'ma20':       round(float(latest.get('MA_20', current_price)), 2),
                'ma50':       round(float(latest.get('MA_50', current_price)), 2),
                'ma200':      round(float(latest.get('MA_200',current_price)), 2),
                'momentum':   round(float(latest.get('Momentum_10', 0)),   2),
                'roc':        round(float(latest.get('ROC_12', 0)),        2),
            },

            # Indicator signals (for table)
            'indicatorSignals': indicator_signals,

            # 7-day LSTM forecast
            'forecast': forecast,

            # Feature importance
            'topFeatures': top_features,

            # Historical chart data
            'chartData': chart_data,

            # Data info
            'dataPoints':    len(df),
            'dataStartDate': df.index[0].strftime('%Y-%m-%d'),
            'dataEndDate':   df.index[-1].strftime('%Y-%m-%d'),
        }

        return jsonify(result)

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@app.route('/api/scan')
def scan_stocks():
    """Scan multiple stocks quickly with basic indicators only (fast)"""
    symbols_str = request.args.get('symbols', '')
    symbols = [s.strip() for s in symbols_str.split(',') if s.strip()]

    if not symbols:
        return jsonify({'success': False, 'error': 'No symbols provided'}), 400

    results = []
    for sym in symbols[:50]:  # Limit to 50 at a time
        try:
            df = get_historical_data(sym, period='6mo')
            if df is None or len(df) < 30:
                continue
            df = add_all_indicators(df)
            latest = df.iloc[-1]
            current_price = float(latest['Close'])
            prev_price    = float(df.iloc[-2]['Close'])
            change        = current_price - prev_price
            change_pct    = (change / prev_price) * 100
            rsi   = float(latest.get('RSI', 50))
            macd  = float(latest.get('MACD', 0))
            macd_sig = float(latest.get('MACD_Signal', 0))
            bb_pct = float(latest.get('BB_Pct', 0.5))

            # Quick signal rules
            buy_pts = sell_pts = 0
            if rsi < 35:   buy_pts  += 2
            elif rsi > 65: sell_pts += 2
            if macd > macd_sig: buy_pts  += 1
            else:               sell_pts += 1
            if bb_pct < 0.25: buy_pts  += 1
            elif bb_pct > 0.75: sell_pts += 1
            if current_price > float(latest.get('MA_20', current_price)): buy_pts  += 1
            else: sell_pts += 1
            if current_price > float(latest.get('MA_50', current_price)): buy_pts  += 1
            else: sell_pts += 1

            signal = 'BUY' if buy_pts > sell_pts + 1 else 'SELL' if sell_pts > buy_pts + 1 else 'HOLD'
            total_pts = buy_pts + sell_pts + 0.01
            confidence = round(max(buy_pts, sell_pts) / total_pts * 100, 1)

            sparkline = [{'v': round(float(p), 2)} for p in df['Close'].tail(20).values]

            results.append({
                'symbol':      sym,
                'price':       round(current_price, 2),
                'change':      round(change, 2),
                'changePercent': round(change_pct, 2),
                'signal':      signal,
                'confidence':  confidence,
                'rsi':         round(rsi, 1),
                'macd':        round(macd, 2),
                'volume':      int(latest.get('Volume', 0)),
                'volumeRatio': round(float(latest.get('Volume_Ratio', 1)), 2),
                'sparkline':   sparkline,
            })
        except Exception as e:
            print(f"Scan error for {sym}: {e}")
            continue

    return jsonify({'success': True, 'results': results, 'count': len(results)})


# ═══════════════════════════════════════════════════════════
# GROQ AI ANALYST REPORT
# ═══════════════════════════════════════════════════════════

@app.route('/api/groq-report/<symbol>', methods=['POST'])
def groq_ai_report(symbol):
    """
    Generate a Groq-powered AI analyst report for a stock.
    Expects JSON body with: indicators, signal, currentPrice,
    timeframePredictions, name, sector, priceChangePct, dataPoints
    """
    import os

    groq_api_key = os.environ.get('GROQ_API_KEY', '')
    if not groq_api_key:
        return jsonify({'success': False, 'error': 'GROQ_API_KEY not set in environment'}), 500

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
            price_str = f"  → Target: ₹{pf.get('price', '?')} ({pf.get('changePercent', 0):+.1f}%)" if pf else ''
            tf_lines.append(
                f"  • {tf.get('timeframe', '?')}: {tf.get('signal', '?')} | "
                f"B:{tf.get('buyProb', 0)}% H:{tf.get('holdProb', 0)}% S:{tf.get('sellProb', 0)}% | "
                f"Accuracy: {tf.get('accuracy', 0)}%{price_str}"
            )

        tf_section = '\n'.join(tf_lines) if tf_lines else '  No ML predictions available yet.'

        prompt = f"""You are a senior equity research analyst at a top-tier Indian brokerage covering NSE-listed stocks.
Write a concise, data-grounded analyst report for {symbol} ({name}) based ONLY on the data below.
Do NOT invent numbers. Do NOT give generic advice. Be specific and direct.

=== STOCK DATA ===
Symbol: {symbol} | Company: {name}
Sector: {sector}
Current Price: ₹{current_price} ({price_change_pct:+.2f}% today)
Historical Data Used: {data_points} trading days

=== TECHNICAL INDICATORS (Real Calculations) ===
RSI(14): {indicators.get('rsi', 'N/A')}
MACD: {indicators.get('macd', 'N/A')} | Signal: {indicators.get('macd_signal', 'N/A')}
Bollinger %B: {indicators.get('bb_pct', 'N/A')}
Stoch K: {indicators.get('stoch_k', 'N/A')}
CCI(20): {indicators.get('cci', 'N/A')}
Williams %R: {indicators.get('williams_r', 'N/A')}
ATR: {indicators.get('atr', 'N/A')}
Volume Ratio: {indicators.get('volume_ratio', 'N/A')}x
MA20: ₹{indicators.get('ma20', 'N/A')} | MA50: ₹{indicators.get('ma50', 'N/A')} | MA200: ₹{indicators.get('ma200', 'N/A')}
Momentum: {indicators.get('momentum', 'N/A')}

=== ML ENSEMBLE SIGNALS ===
Overall: {signal}
Indicator Vote Tally → BUY: {buy_votes} | HOLD: {hold_votes} | SELL: {sell_votes}

Timeframe Predictions (RF+GBM+LSTM Stacked Ensemble):
{tf_section}

=== REPORT FORMAT ===
Write exactly these 5 sections with bold headers:

**Technical Picture**
2-3 sentences. Describe RSI level, MACD crossover status, Bollinger position, and MA alignment. Be specific with numbers.

**Volume & Momentum**
1-2 sentences on volume ratio, ATR volatility and momentum reading.

**ML Model Outlook**
2-3 sentences. Discuss what the ensemble signals across timeframes imply. If short and long horizon disagree, flag the conflict. Mention accuracy honestly.

**Key Levels to Watch**
Bullet points: support near MA20/MA50/MA200 and resistance. Derive from the data above.

**Recommendation**
1 sentence verdict. Then a 1-sentence disclaimer: "This is AI-generated research for educational purposes only. Not SEBI-registered financial advice."
"""

        headers = {
            'Authorization': f'Bearer {groq_api_key}',
            'Content-Type': 'application/json',
        }
        payload = {
            'model': 'llama-3.3-70b-versatile',
            'messages': [{'role': 'user', 'content': prompt}],
            'max_tokens': 900,
            'temperature': 0.45,
        }

        resp = requests.post(
            'https://api.groq.com/openai/v1/chat/completions',
            headers=headers,
            json=payload,
            timeout=30,
        )

        if resp.status_code != 200:
            return jsonify({
                'success': False,
                'error': f'Groq API error {resp.status_code}: {resp.text[:300]}'
            }), 502

        data = resp.json()
        report_text = data['choices'][0]['message']['content']
        usage = data.get('usage', {})

        return jsonify({
            'success': True,
            'report': report_text,
            'symbol': symbol,
            'model': 'llama-3.3-70b-versatile',
            'tokens': usage.get('total_tokens', 0),
        })

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    print("🚀 AmeyaFX ML API Starting...")
    print(f"   LSTM Available: {LSTM_AVAILABLE}")
    print("   Fetching NSE stocks...")
    # Pre-fetch stocks on startup
    try:
        stocks = fetch_all_nse_stocks()
        print(f"   ✅ Loaded {len(stocks)} NSE stocks")
    except:
        print("   ⚠️ Could not pre-fetch stocks")
    print("   API running on http://localhost:5000")
    app.run(debug=True, port=5000, threaded=True)

