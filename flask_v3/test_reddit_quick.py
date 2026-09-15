import sys
sys.path.insert(0, '.')
from reddit_sentiment import scrape_reddit_sentiment

result = scrape_reddit_sentiment('RELIANCE')
print(f"Score: {result['sentiment_score']:.3f}")
print(f"Label: {result['sentiment_label']}")
print(f"Posts: {result['post_count']}")
print(f"Bullish: {result.get('bullish_count', 0)} | Bearish: {result.get('bearish_count', 0)} | Neutral: {result.get('neutral_count', 0)}")
print(f"Subreddits: {result.get('subreddits_searched', [])}")
for p in result.get('top_posts', [])[:3]:
    print(f"  [{p.get('subreddit')}] {p['title'][:70]}  sent={p['sentiment']:.3f}")
