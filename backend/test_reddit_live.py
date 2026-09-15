"""Test real Reddit scraping via public JSON API."""
import sys, io
if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
if sys.stderr.encoding and sys.stderr.encoding.lower() != 'utf-8':
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from reddit_sentiment import scrape_reddit_sentiment, get_status

print("=" * 60)
print("REAL REDDIT SENTIMENT TEST (Public JSON API)")
print("=" * 60)

status = get_status()
print(f"Method:              {status['method']}")
print(f"Requires credentials: {status['requires_credentials']}")
print(f"VADER installed:      {status['vader_installed']}")
print(f"Demo mode:            {status['demo_mode']}")
print(f"Subreddits:           {', '.join(status['subreddits'])}")

symbols = ['RELIANCE', 'TCS', 'INFY']

for sym in symbols:
    print(f"\n{'─' * 60}")
    print(f"Scraping Reddit for {sym}...")
    r = scrape_reddit_sentiment(sym)

    print(f"  Source:    {r.get('source', '?')}")
    print(f"  Score:     {r['sentiment_score']:+.4f}")
    print(f"  Label:     {r['sentiment_label']}")
    print(f"  Posts:     {r['post_count']}")
    print(f"  Bullish:   {r['bullish_count']}")
    print(f"  Bearish:   {r['bearish_count']}")
    print(f"  Neutral:   {r['neutral_count']}")
    print(f"  Subs:      {', '.join(r['subreddits_searched'])}")

    if r['top_posts']:
        print(f"\n  Top {min(3, len(r['top_posts']))} posts:")
        for i, p in enumerate(r['top_posts'][:3]):
            sent_icon = '🟢' if p['sentiment'] > 0.15 else '🔴' if p['sentiment'] < -0.15 else '🟡'
            print(f"    {sent_icon} [{p['score']:>4} pts] r/{p['subreddit']}: {p['title'][:70]}")
    else:
        print("  (No posts found)")

print(f"\n{'=' * 60}")
print("DONE — All real Reddit data!")
print(f"{'=' * 60}")
