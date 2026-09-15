"""Quick smoke test for reddit_sentiment + multi_agent modules."""
import json, sys, io

# Fix Windows cp1252 encoding
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

print("=" * 55)
print("TEST 1: Reddit Sentiment Module")
print("=" * 55)
from reddit_sentiment import scrape_reddit_sentiment, get_status

status = get_status()
print(f"PRAW installed:     {status['praw_installed']}")
print(f"VADER installed:    {status['vader_installed']}")
print(f"Reddit connected:   {status['reddit_connected']}")
print(f"Demo mode:          {status['demo_mode']}")

r = scrape_reddit_sentiment('RELIANCE')
print(f"\nSentiment for RELIANCE:")
print(f"  Score:   {r['sentiment_score']:+.4f}")
print(f"  Label:   {r['sentiment_label']}")
print(f"  Posts:   {r['post_count']}")
print(f"  Bullish: {r['bullish_count']}")
print(f"  Bearish: {r['bearish_count']}")
print(f"  Neutral: {r['neutral_count']}")
if r['top_posts']:
    print(f"  Top:     {r['top_posts'][0]['title'][:70]}...")

print()
print("=" * 55)
print("TEST 2: Multi-Agent Simulation")
print("=" * 55)
from multi_agent import run_all_agents

# Mock data simulating what frontend sends
mock_data = {
    'name': 'Reliance Industries',
    'sector': 'Energy',
    'industry': 'Oil & Gas',
    'currentPrice': 2850.5,
    'priceChangePct': 1.25,
    'dailyVolPct': 1.8,
    'overallSignal': 'BUY',
    'dataPoints': 1200,
    'indicators': {
        'rsi': 45.2, 'macd': 12.5, 'macd_signal': 10.1,
        'bb_pct': 0.55, 'stoch_k': 42.0, 'cci': -15.3,
        'williams_r': -55.0, 'volume_ratio': 1.2, 'momentum': 35.0,
        'ma20': 2800, 'ma50': 2750, 'ma200': 2600, 'atr': 45.0,
    },
    'financials': {
        'pe': 28.5, 'pb': 2.1, 'roe': 0.12,
        'debtToEquity': 0.45, 'dividendYield': 0.008,
        'marketCap': 19200000000000, 'eps': 100.0,
        'profitMargin': 0.08, 'freeCashflow': 50000000000,
    },
    'timeframePredictions': [
        {'timeframe': 'Tomorrow', 'signal': 'BUY', 'accuracy': 55, 'key': 'tomorrow'},
        {'timeframe': 'Next Week', 'signal': 'HOLD', 'accuracy': 52, 'key': 'next_week'},
        {'timeframe': 'Next Month', 'signal': 'BUY', 'accuracy': 58, 'key': 'next_month'},
    ],
    'priceForecastsByTimeframe': {
        'tomorrow': {'price': 2865, 'changePercent': 0.5},
        'next_week': {'price': 2900, 'changePercent': 1.7},
        'next_month': {'price': 3050, 'changePercent': 7.0},
    },
    'buyVotes': 3, 'holdVotes': 1, 'sellVotes': 1,
}

reports = run_all_agents('RELIANCE', mock_data)
print(f"\n{len(reports)} agent reports generated:")
for r in reports:
    print(f"  {r['emoji']} {r['agent']:25s} -> {r['verdict']:4s} ({r['confidence']:.0f}%) | {r['summary'][:60]}...")

print()
print("=" * 55)
print("ALL TESTS PASSED")
print("=" * 55)
