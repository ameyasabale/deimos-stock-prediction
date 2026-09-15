import sys
sys.path.insert(0, '.')
from reddit_sentiment import scrape_reddit_sentiment

r = scrape_reddit_sentiment('RELIANCE')
print(f"Posts found: {r['post_count']}")
print(f"Sentiment: {r['sentiment_score']:.3f} ({r['sentiment_label']})")
print(f"Bullish: {r['bullish_count']} | Bearish: {r['bearish_count']} | Neutral: {r['neutral_count']}")
print()
for p in r.get('top_posts', []):
    sub = p['subreddit']
    sent = p['sentiment']
    title = p['title'][:75]
    print(f"  [{sub}] {sent:+.3f} | {title}")
