"""
Reddit Sentiment Analysis Module for AmeyaFX
Uses Reddit's PUBLIC JSON API (no credentials needed!) to scrape posts
from Indian stock market subreddits, then runs VADER sentiment analysis
and returns aggregated sentiment scores.

No API keys required — works out of the box.
"""
import os
import time
import re
import requests
from datetime import datetime, timedelta

try:
    from finance_nlp import analyze_financial_text, get_nlp_status
    FINANCE_NLP_AVAILABLE = True
except ImportError:
    FINANCE_NLP_AVAILABLE = False

# Legacy fallback
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
    VADER_AVAILABLE = True
    _vader = SentimentIntensityAnalyzer()
except ImportError:
    VADER_AVAILABLE = False
    _vader = None

# ── Sentiment cache (2-hour TTL) ──────────────────────
_SENT_CACHE = {}       # symbol -> result dict
_SENT_CACHE_TIME = {}  # symbol -> datetime

CACHE_TTL_SECONDS = 7200  # 2 hours

# Reddit request session — Reddit's JSON API REQUIRES a bot-like User-Agent
# Browser-like UAs get 403'd. Must look like: "platform:appid:version (by /u/user)"
_session = requests.Session()
_session.headers.update({
    'User-Agent': 'python:ameyafx.stocksentiment:v2.0 (by /u/ameyafx_bot)',
    'Accept': 'application/json',
})

# Indian stock market subreddits (searched first)
SUBREDDITS = [
    'IndianStockMarket',
    'IndianStreetBets',
    'DalalStreetBets',
    'IndiaInvestments',
]

# Global fallback subreddits (only 1 to avoid rate limits)
GLOBAL_SUBREDDITS = [
    'wallstreetbets',
]

# Stock ticker aliases — common alternate names on Reddit
TICKER_ALIASES = {
    'RELIANCE': ['reliance', 'ril', 'reliance industries', 'mukesh ambani'],
    'TCS': ['tcs', 'tata consultancy', 'tata consulting'],
    'INFY': ['infy', 'infosys'],
    'HDFCBANK': ['hdfc bank', 'hdfcbank', 'hdfc'],
    'ICICIBANK': ['icici bank', 'icicibank', 'icici'],
    'SBIN': ['sbi', 'sbin', 'state bank'],
    'WIPRO': ['wipro'],
    'LT': ['l&t', 'larsen', 'larsen & toubro', 'larsen and toubro'],
    'HCLTECH': ['hcl tech', 'hcltech', 'hcl technologies'],
    'BAJFINANCE': ['bajaj finance', 'bajfinance'],
    'TATAMOTORS': ['tata motors', 'tatamotors'],
    'TATASTEEL': ['tata steel', 'tatasteel'],
    'ADANIENT': ['adani', 'adani enterprises', 'adanient'],
    'MARUTI': ['maruti', 'maruti suzuki'],
    'ITC': ['itc'],
    'AXISBANK': ['axis bank', 'axisbank'],
    'KOTAKBANK': ['kotak', 'kotak bank', 'kotak mahindra'],
    'TITAN': ['titan'],
    'ASIANPAINT': ['asian paints', 'asianpaint'],
    'BHARTIARTL': ['airtel', 'bharti airtel', 'bhartiartl'],
}


# PUBLIC RSS API — JSON API is blocked, RSS still works!
# ═══════════════════════════════════════════════════════

def _parse_rss_posts(rss_text, subreddit):
    """Parse Reddit RSS feed XML into post dicts matching the JSON API format."""
    posts = []
    try:
        # Extract entries using regex (lightweight, no xml lib needed)
        entries = re.findall(r'<entry>(.*?)</entry>', rss_text, re.DOTALL)
        for entry in entries:
            title_match = re.search(r'<title>(.*?)</title>', entry)
            link_match = re.search(r'<link href="(.*?)"', entry)
            content_match = re.search(r'<content[^>]*>(.*?)</content>', entry, re.DOTALL)
            updated_match = re.search(r'<updated>(.*?)</updated>', entry)

            title = title_match.group(1) if title_match else ''
            # Decode HTML entities
            title = title.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>').replace('&#39;', "'").replace('&quot;', '"')

            link = link_match.group(1) if link_match else ''
            content_raw = content_match.group(1) if content_match else ''
            # Strip HTML tags from content to get selftext
            selftext = re.sub(r'<[^>]+>', ' ', content_raw).strip()
            selftext = selftext.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')

            # Try to parse timestamp
            created_utc = 0
            if updated_match:
                try:
                    from datetime import timezone
                    dt = datetime.fromisoformat(updated_match.group(1).replace('Z', '+00:00'))
                    created_utc = int(dt.timestamp())
                except Exception:
                    created_utc = int(time.time())

            # Extract score/comments from content if present
            score = 1
            num_comments = 0
            score_match = re.search(r'(\d+)\s*(?:points?|upvotes?|score)', content_raw, re.I)
            if score_match:
                score = int(score_match.group(1))
            comments_match = re.search(r'(\d+)\s*comments?', content_raw, re.I)
            if comments_match:
                num_comments = int(comments_match.group(1))

            posts.append({
                'title': title[:200],
                'selftext': selftext[:500],
                'score': score,
                'num_comments': num_comments,
                'created_utc': created_utc,
                'permalink': link.replace('https://www.reddit.com', ''),
                'upvote_ratio': 0.7,  # not available in RSS
                'subreddit': subreddit,
            })
    except Exception as e:
        print(f"   RSS parse error: {e}")
    return posts


def _reddit_search_json(subreddit, query, sort='relevance', time_filter='week', limit=25):
    """
    Search a subreddit using Reddit's RSS feed (JSON API is blocked).
    No login or API key required.
    """
    url = f'https://www.reddit.com/r/{subreddit}/search.rss'
    params = {
        'q': query,
        'sort': sort,
        't': time_filter,
        'restrict_sr': 'on',
        'limit': min(limit, 25),  # RSS caps at ~25
    }

    try:
        resp = _session.get(url, params=params, timeout=12)

        if resp.status_code == 429:
            retry_after = int(resp.headers.get('Retry-After', 3))
            time.sleep(min(retry_after, 5))
            resp = _session.get(url, params=params, timeout=12)

        if resp.status_code != 200:
            print(f"   Reddit RSS r/{subreddit}: HTTP {resp.status_code}")
            return []

        return _parse_rss_posts(resp.text, subreddit)

    except requests.exceptions.Timeout:
        print(f"   Reddit timeout r/{subreddit}")
        return []
    except Exception as e:
        print(f"   Reddit error r/{subreddit}: {e}")
        return []


def _reddit_hot_json(subreddit, limit=25):
    """Fetch hot posts from a subreddit via RSS."""
    url = f'https://www.reddit.com/r/{subreddit}/hot.rss'
    params = {'limit': min(limit, 25)}

    try:
        resp = _session.get(url, params=params, timeout=12)
        if resp.status_code != 200:
            return []
        return _parse_rss_posts(resp.text, subreddit)
    except Exception:
        return []


# ═══════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════

def _get_search_terms(symbol):
    """Get search terms for a stock symbol."""
    terms = [symbol, symbol.lower()]
    aliases = TICKER_ALIASES.get(symbol.upper(), [])
    terms.extend(aliases)
    terms.append(f"NSE:{symbol}")
    terms.append(f"${symbol}")
    return list(set(terms))


def _analyze_sentiment(text):
    """Run finance-aware sentiment on text. Returns compound score (-1 to +1)."""
    if not text:
        return 0.0
    # Prefer finance-domain NLP (FinBERT or FinanceVADER)
    if FINANCE_NLP_AVAILABLE:
        result = analyze_financial_text(text)
        return result.get('score', 0.0)
    # Legacy fallback to raw VADER
    if VADER_AVAILABLE and _vader:
        scores = _vader.polarity_scores(text)
        return scores['compound']
    return 0.0


def _is_relevant(text, search_terms):
    """Check if text mentions any of the search terms."""
    text_lower = text.lower()
    for term in search_terms:
        if len(term) < 5:
            pattern = r'\b' + re.escape(term.lower()) + r'\b'
            if re.search(pattern, text_lower):
                return True
        else:
            if term.lower() in text_lower:
                return True
    return False


# ═══════════════════════════════════════════════════════
# MAIN SCRAPING FUNCTION
# ═══════════════════════════════════════════════════════

def scrape_reddit_sentiment(symbol, days_back=7, max_posts=100):
    """
    Scrape Reddit for posts mentioning a stock and return sentiment analysis.
    Uses the PUBLIC JSON API — no credentials needed.

    Returns dict with:
    - sentiment_score: float (-1 to +1)
    - sentiment_label: str ('Bullish', 'Bearish', 'Neutral')
    - post_count: int
    - top_posts: list of dicts
    - subreddits_searched: list
    - bullish_count, bearish_count, neutral_count: int
    """
    symbol = symbol.upper().strip()

    # Check cache
    if symbol in _SENT_CACHE and symbol in _SENT_CACHE_TIME:
        age = (datetime.now() - _SENT_CACHE_TIME[symbol]).total_seconds()
        if age < CACHE_TTL_SECONDS:
            cached = _SENT_CACHE[symbol].copy()
            cached['cached'] = True
            cached['cache_age_seconds'] = int(age)
            return cached

    search_terms = _get_search_terms(symbol)
    posts = []
    subreddits_searched = []
    api_errors = 0

    # Build search query — use first 3 terms joined by OR
    search_query = ' OR '.join(search_terms[:3])

    # Time filter based on days_back
    if days_back <= 1:
        time_filter = 'day'
    elif days_back <= 7:
        time_filter = 'week'
    else:
        time_filter = 'month'

    # Scrape Indian subreddits first, then global (skip globals if enough Indian posts)
    all_subs = SUBREDDITS.copy()
    for sub_name in all_subs:
        subreddits_searched.append(sub_name)

        # Search for symbol
        raw_posts = _reddit_search_json(
            sub_name, search_query,
            sort='relevance', time_filter=time_filter,
            limit=max_posts // len(all_subs),
        )

        if raw_posts is None:
            api_errors += 1
            continue

        for post in raw_posts:
            # Check age
            created = post.get('created_utc', 0)
            post_time = datetime.fromtimestamp(created) if created else datetime.now()
            if (datetime.now() - post_time).days > days_back:
                continue

            full_text = f"{post.get('title', '')} {post.get('selftext', '')}"
            if not _is_relevant(full_text, search_terms):
                continue

            sentiment = _analyze_sentiment(full_text)
            posts.append({
                'title': post.get('title', '')[:200],
                'subreddit': sub_name,
                'score': post.get('score', 0),
                'num_comments': post.get('num_comments', 0),
                'sentiment': round(sentiment, 4),
                'created_utc': created,
                'url': f"https://reddit.com{post.get('permalink', '')}",
                'upvote_ratio': post.get('upvote_ratio', 0.5),
                'selftext_preview': (post.get('selftext', '') or '')[:100],
            })

        # Rate limit courtesy — 1.5s between requests
        time.sleep(1.5)

        if len(posts) >= max_posts:
            break

    # Also check hot posts from Indian subs and global fallback for broader sentiment
    if len(posts) < 5:
        extra_subs = SUBREDDITS[:2] + GLOBAL_SUBREDDITS
        for sub_name in extra_subs:
            hot_posts = _reddit_hot_json(sub_name, limit=15)
            for post in hot_posts:
                full_text = f"{post.get('title', '')} {post.get('selftext', '')}"
                if _is_relevant(full_text, search_terms):
                    sentiment = _analyze_sentiment(full_text)
                    posts.append({
                        'title': post.get('title', '')[:200],
                        'subreddit': sub_name,
                        'score': post.get('score', 0),
                        'num_comments': post.get('num_comments', 0),
                        'sentiment': round(sentiment, 4),
                        'created_utc': post.get('created_utc', 0),
                        'url': f"https://reddit.com{post.get('permalink', '')}",
                        'upvote_ratio': post.get('upvote_ratio', 0.5),
                        'selftext_preview': (post.get('selftext', '') or '')[:100],
                    })
            time.sleep(1.5)

    # Deduplicate by URL
    seen_urls = set()
    unique_posts = []
    for p in posts:
        if p['url'] not in seen_urls:
            seen_urls.add(p['url'])
            unique_posts.append(p)
    posts = unique_posts

    # Aggregate results
    if not posts:
        result = {
            'symbol': symbol,
            'sentiment_score': 0.0,
            'sentiment_label': 'Neutral',
            'post_count': 0,
            'top_posts': [],
            'subreddits_searched': subreddits_searched,
            'bullish_count': 0,
            'bearish_count': 0,
            'neutral_count': 0,
            'weighted_sentiment': 0.0,
            'source': 'reddit_public_json',
            'api_errors': api_errors,
            'cached': False,
            'timestamp': datetime.now().isoformat(),
        }
    else:
        # Weight sentiment by upvotes (popular posts carry more weight)
        total_weight = 0
        weighted_sum = 0
        bullish = 0
        bearish = 0
        neutral = 0

        for p in posts:
            weight = max(1, p['score']) * p.get('upvote_ratio', 0.5)
            weighted_sum += p['sentiment'] * weight
            total_weight += weight

            if p['sentiment'] > 0.15:
                bullish += 1
            elif p['sentiment'] < -0.15:
                bearish += 1
            else:
                neutral += 1

        weighted_sentiment = weighted_sum / (total_weight + 1e-10)
        avg_sentiment = sum(p['sentiment'] for p in posts) / len(posts)

        final_score = round(weighted_sentiment, 4)

        if final_score > 0.15:
            label = 'Bullish'
        elif final_score < -0.15:
            label = 'Bearish'
        else:
            label = 'Neutral'

        # Sort top posts by engagement (score * comments)
        top_posts = sorted(posts, key=lambda x: x['score'] * (1 + x['num_comments']), reverse=True)[:10]

        result = {
            'symbol': symbol,
            'sentiment_score': final_score,
            'sentiment_label': label,
            'post_count': len(posts),
            'top_posts': top_posts,
            'subreddits_searched': subreddits_searched,
            'bullish_count': bullish,
            'bearish_count': bearish,
            'neutral_count': neutral,
            'weighted_sentiment': round(weighted_sentiment, 4),
            'avg_sentiment': round(avg_sentiment, 4),
            'source': 'reddit_public_json',
            'api_errors': api_errors,
            'cached': False,
            'timestamp': datetime.now().isoformat(),
        }

    # Cache result
    _SENT_CACHE[symbol] = result
    _SENT_CACHE_TIME[symbol] = datetime.now()

    return result


def get_status():
    """Return status of Reddit sentiment module."""
    nlp_status = get_nlp_status() if FINANCE_NLP_AVAILABLE else {}
    return {
        'vader_installed': VADER_AVAILABLE,
        'finance_nlp_available': FINANCE_NLP_AVAILABLE,
        'nlp_method': nlp_status.get('active_method', 'raw_vader'),
        'nlp_lexicon_size': nlp_status.get('lexicon_size', 0),
        'method': 'public_json_api',
        'requires_credentials': False,
        'cached_symbols': list(_SENT_CACHE.keys()),
        'subreddits': SUBREDDITS + GLOBAL_SUBREDDITS,
        'demo_mode': False,  # Always real data now!
    }
