import requests
s = requests.Session()
s.headers.update({'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'})

# Test 1: old.reddit.com JSON API (current method)
print("=== Test 1: old.reddit.com/search.json ===")
url = 'https://old.reddit.com/r/IndianStockMarket/search.json'
try:
    r = s.get(url, params={'q':'RELIANCE','sort':'relevance','t':'week','restrict_sr':'on','limit':5,'raw_json':1}, timeout=12)
    print(f"Status: {r.status_code}")
    print(f"Content-Type: {r.headers.get('Content-Type','?')}")
    print(f"Body (first 300): {r.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

print()

# Test 2: www.reddit.com JSON API
print("=== Test 2: www.reddit.com/search.json ===")
url2 = 'https://www.reddit.com/r/IndianStockMarket/search.json'
try:
    r2 = s.get(url2, params={'q':'RELIANCE','sort':'relevance','t':'week','restrict_sr':'on','limit':5,'raw_json':1}, timeout=12)
    print(f"Status: {r2.status_code}")
    print(f"Content-Type: {r2.headers.get('Content-Type','?')}")
    print(f"Body (first 300): {r2.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

print()

# Test 3: Reddit OAuth (public, no auth)
print("=== Test 3: oauth.reddit.com ===")
url3 = 'https://oauth.reddit.com/r/IndianStockMarket/search.json'
try:
    r3 = s.get(url3, params={'q':'RELIANCE','sort':'relevance','t':'week','restrict_sr':'on','limit':5}, timeout=12)
    print(f"Status: {r3.status_code}")
    print(f"Body (first 300): {r3.text[:300]}")
except Exception as e:
    print(f"Error: {e}")

print()

# Test 4: hot.json (no search)
print("=== Test 4: hot.json (no search) ===")
url4 = 'https://www.reddit.com/r/IndianStockMarket/hot.json'
try:
    r4 = s.get(url4, params={'limit':5,'raw_json':1}, timeout=12)
    print(f"Status: {r4.status_code}")
    print(f"Content-Type: {r4.headers.get('Content-Type','?')}")
    has_data = '"children"' in r4.text[:1000]
    print(f"Has children key: {has_data}")
    if has_data:
        import json
        d = r4.json()
        posts = d.get('data',{}).get('children',[])
        print(f"Posts found: {len(posts)}")
        for p in posts[:2]:
            print(f"  - {p['data'].get('title','?')[:80]}")
    else:
        print(f"Body: {r4.text[:300]}")
except Exception as e:
    print(f"Error: {e}")
