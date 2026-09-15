import { NextResponse } from 'next/server'

const FLASK = 'http://127.0.0.1:5000'

// ─── Tool Definitions ─────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_stock_quote',
      description: 'Get live price, today\'s change %, volume, open, day high/low, 52-week high/low for any NSE stock. Use when asked about current price or basic quote.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'NSE stock symbol in UPPERCASE e.g. RELIANCE, TCS, INFY, HDFCBANK, WIPRO' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_financials',
      description: 'Get fundamental data: P/E ratio, P/B, market cap, EPS, dividend yield, ROE, debt/equity, revenue, net profit, free cashflow, book value. Use for valuation or fundamental analysis.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'NSE stock symbol e.g. RELIANCE' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_technical_indicators',
      description: 'Get full technical analysis: RSI(14), MACD, Bollinger %B, Stochastic K, CCI, Williams %R, ATR, MA20/50/200, volume ratio, momentum. Use for technical analysis questions.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'NSE stock symbol' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_price_history',
      description: 'Get historical price performance summary: period return, high, low, start/end price. Use when asked about past performance or returns over a period.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'NSE stock symbol' },
          period: {
            type: 'string',
            enum: ['1mo', '3mo', '6mo', '1y', '2y', '5y'],
            description: 'Time period for history'
          }
        },
        required: ['symbol', 'period']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'compare_stocks',
      description: 'Compare two NSE stocks side by side: price, % change, P/E, market cap, RSI, overall buy/sell signal. Use when asked to compare two stocks.',
      parameters: {
        type: 'object',
        properties: {
          symbol1: { type: 'string', description: 'First NSE stock symbol' },
          symbol2: { type: 'string', description: 'Second NSE stock symbol' }
        },
        required: ['symbol1', 'symbol2']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web (Google) for latest news, analysis, expert opinions, or recent developments about a stock or market topic. Use this when user asks about recent events, news, should I buy/sell questions, upcoming IPOs, quarterly results, or anything needing current information beyond price data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query e.g. "Reliance Industries latest news 2026", "should I buy TCS stock", "HDFC Bank quarterly results"' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_reddit_sentiment',
      description: 'Get real social media sentiment from Reddit - scrapes posts from r/IndianStockMarket, r/IndianStreetBets, r/DalalStreetBets and analyzes bullish vs bearish sentiment using AI NLP. Use when asked about market buzz, social sentiment, what people are saying, or retail investor opinion.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'NSE stock symbol e.g. RELIANCE, TCS, INFY' }
        },
        required: ['symbol']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'get_ml_prediction',
      description: 'Run full ML prediction engine for a stock - trains XGBoost+LightGBM+RandomForest ensemble, generates BUY/HOLD/SELL signals with probabilities across 5 timeframes (tomorrow, week, month, 3 months, 1 year), price targets with bull/bear ranges. Use when asked for predictions, forecasts, or should I buy/sell.',
      parameters: {
        type: 'object',
        properties: {
          symbol: { type: 'string', description: 'NSE stock symbol e.g. RELIANCE' }
        },
        required: ['symbol']
      }
    }
  }
]

// ─── Tool Executor ─────────────────────────────────────────────────────────────
async function flaskFetch(path, timeoutMs = 25000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(`${FLASK}${path}`, { signal: ctrl.signal })
    clearTimeout(t)
    if (!res.ok) throw new Error(`Flask ${res.status}`)
    return await res.json()
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

async function executeTool(name, args) {
  try {
    // ── get_stock_quote ──────────────────────────────────────
    if (name === 'get_stock_quote') {
      const sym = args.symbol.toUpperCase().trim()
      const d = await flaskFetch(`/api/stock/overview/${sym}`)
      if (!d.success) return { error: `No data found for ${sym}. It may not be listed on NSE.` }
      const f = d.financials || {}
      return {
        symbol: sym,
        name: d.name,
        currentPrice: `₹${d.currentPrice}`,
        change: `₹${d.priceChange}`,
        changePercent: `${d.priceChangePct > 0 ? '+' : ''}${d.priceChangePct}%`,
        open: f.open ? `₹${f.open}` : 'N/A',
        dayHigh: f.dayHigh ? `₹${f.dayHigh}` : 'N/A',
        dayLow: f.dayLow ? `₹${f.dayLow}` : 'N/A',
        volume: f.volume?.toLocaleString() || 'N/A',
        avgVolume: f.avgVolume?.toLocaleString() || 'N/A',
        week52High: f.week52High ? `₹${f.week52High}` : 'N/A',
        week52Low: f.week52Low ? `₹${f.week52Low}` : 'N/A',
        sector: d.sector || 'N/A',
        industry: d.industry || 'N/A',
      }
    }

    // ── get_financials ───────────────────────────────────────
    if (name === 'get_financials') {
      const sym = args.symbol.toUpperCase().trim()
      const d = await flaskFetch(`/api/stock/overview/${sym}`)
      if (!d.success) return { error: `No data for ${sym}` }
      const f = d.financials || {}
      return {
        symbol: sym,
        name: d.name,
        marketCap: f.marketCap ? `₹${(f.marketCap / 1e7).toFixed(0)} Cr` : 'N/A',
        peRatio: f.peRatio ?? 'N/A',
        forwardPE: f.forwardPE ?? 'N/A',
        pbRatio: f.pbRatio ?? 'N/A',
        eps: f.eps ? `₹${f.eps}` : 'N/A',
        dividendYield: f.dividendYield ? `${(f.dividendYield * 100).toFixed(2)}%` : 'N/A',
        bookValue: f.bookValue ? `₹${f.bookValue}` : 'N/A',
        roe: f.roe ? `${(f.roe * 100).toFixed(1)}%` : 'N/A',
        debtToEquity: f.debtToEquity ?? 'N/A',
        profitMargins: f.profitMargins ? `${(f.profitMargins * 100).toFixed(1)}%` : 'N/A',
        revenueGrowth: f.revenueGrowth ? `${(f.revenueGrowth * 100).toFixed(1)}%` : 'N/A',
        totalRevenue: f.totalRevenue ? `₹${(f.totalRevenue / 1e7).toFixed(0)} Cr` : 'N/A',
        netIncome: f.netIncome ? `₹${(f.netIncome / 1e7).toFixed(0)} Cr` : 'N/A',
        freeCashflow: f.freeCashflow ? `₹${(f.freeCashflow / 1e7).toFixed(0)} Cr` : 'N/A',
        currentRatio: f.currentRatio ?? 'N/A',
        employees: f.employees?.toLocaleString() || 'N/A',
        businessSummary: (d.description || '').slice(0, 250) || 'N/A',
      }
    }

    // ── get_technical_indicators ─────────────────────────────
    if (name === 'get_technical_indicators') {
      const sym = args.symbol.toUpperCase().trim()
      const d = await flaskFetch(`/api/stock/overview/${sym}`)
      if (!d.success) return { error: `No data for ${sym}` }
      const ind = d.indicators || {}
      const sigs = d.indicatorSignals || []
      const buyCount = d.buyVotes || 0
      const sellCount = d.sellVotes || 0
      const holdCount = d.holdVotes || 0
      return {
        symbol: sym,
        currentPrice: `₹${d.currentPrice}`,
        overallVote: `${buyCount} BUY / ${holdCount} HOLD / ${sellCount} SELL`,
        rsi14: ind.rsi,
        rsiSignal: ind.rsi < 30 ? 'Oversold (bullish)' : ind.rsi > 70 ? 'Overbought (bearish)' : 'Neutral',
        macd: ind.macd,
        macdSignal: ind.macd_signal,
        macdCross: ind.macd > ind.macd_signal ? 'Bullish crossover' : 'Bearish crossover',
        bollingerPctB: ind.bb_pct,
        bollingerSignal: ind.bb_pct < 0.2 ? 'Near lower band (oversold)' : ind.bb_pct > 0.8 ? 'Near upper band (overbought)' : 'Mid range',
        stochasticK: ind.stoch_k,
        cci: ind.cci,
        williamsR: ind.williams_r,
        atr: ind.atr,
        volumeRatio: `${ind.volume_ratio}x average`,
        ma20: `₹${ind.ma20}`,
        ma50: `₹${ind.ma50}`,
        ma200: `₹${ind.ma200}`,
        priceVsMA20: d.currentPrice > ind.ma20 ? 'ABOVE MA20 (bullish)' : 'BELOW MA20 (bearish)',
        priceVsMA200: d.currentPrice > ind.ma200 ? 'ABOVE MA200 (long-term bullish)' : 'BELOW MA200 (long-term bearish)',
        momentum10d: ind.momentum,
      }
    }

    // ── get_price_history ────────────────────────────────────
    if (name === 'get_price_history') {
      const sym = args.symbol.toUpperCase().trim()
      const period = args.period || '1y'
      const d = await flaskFetch(`/api/stock/history/${sym}?period=${period}`)
      if (!d.success || !d.data?.length) return { error: `No history for ${sym}` }
      const prices = d.data.map(r => r.close).filter(Boolean)
      if (!prices.length) return { error: 'No price data' }
      const first = prices[0], last = prices[prices.length - 1]
      const ret = ((last - first) / first * 100).toFixed(2)
      const high = Math.max(...prices).toFixed(2)
      const low = Math.min(...prices).toFixed(2)
      const avg = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2)
      return {
        symbol: sym,
        period,
        startPrice: `₹${first?.toFixed(2)}`,
        latestPrice: `₹${last?.toFixed(2)}`,
        periodReturn: `${ret}%`,
        periodHigh: `₹${high}`,
        periodLow: `₹${low}`,
        avgPrice: `₹${avg}`,
        tradingDays: prices.length,
        trend: Number(ret) > 10 ? 'Strong uptrend' : Number(ret) > 0 ? 'Mild uptrend' : Number(ret) > -10 ? 'Mild downtrend' : 'Strong downtrend',
      }
    }

    // ── compare_stocks ───────────────────────────────────────
    if (name === 'compare_stocks') {
      const [d1, d2] = await Promise.all([
        flaskFetch(`/api/stock/overview/${args.symbol1.toUpperCase()}`),
        flaskFetch(`/api/stock/overview/${args.symbol2.toUpperCase()}`),
      ])
      const fmt = (d) => {
        if (!d.success) return { error: `No data for ${d.symbol || '?'}` }
        const f = d.financials || {}
        const ind = d.indicators || {}
        return {
          symbol: d.symbol,
          name: d.name,
          price: `₹${d.currentPrice}`,
          changeToday: `${d.priceChangePct > 0 ? '+' : ''}${d.priceChangePct}%`,
          peRatio: f.peRatio ?? 'N/A',
          marketCap: f.marketCap ? `₹${(f.marketCap / 1e7).toFixed(0)} Cr` : 'N/A',
          rsi: ind.rsi,
          ma200: `₹${ind.ma200}`,
          priceVsMA200: d.currentPrice > ind.ma200 ? 'Above MA200' : 'Below MA200',
          sector: d.sector,
          overallSignal: d.buyVotes > d.sellVotes ? 'BUY' : d.sellVotes > d.buyVotes ? 'SELL' : 'HOLD',
          buyVotes: d.buyVotes,
          sellVotes: d.sellVotes,
        }
      }
      return { stock1: fmt(d1), stock2: fmt(d2) }
    }

    // ── search_web ──────────────────────────────────────────
    if (name === 'search_web') {
      const query = args.query || ''
      try {
        // Use Google search via a simple scrape of search results
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query + ' site:moneycontrol.com OR site:economictimes.com OR site:livemint.com OR site:screener.in')}&num=8`
        const res = await fetch(searchUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36' },
          signal: AbortSignal.timeout(10000),
        })
        const html = await res.text()
        // Extract snippets from Google results
        const snippets = []
        const titleRegex = /<h3[^>]*>(.*?)<\/h3>/gi
        const snippetRegex = /<span[^>]*class="[^"]*"[^>]*>((?:(?!<\/span>).)*)<\/span>/gi
        let match
        while ((match = titleRegex.exec(html)) !== null && snippets.length < 8) {
          const title = match[1].replace(/<[^>]+>/g, '').trim()
          if (title && title.length > 10) snippets.push(title)
        }
        // Also try to grab DuckDuckGo as fallback for better snippets
        if (snippets.length < 3) {
          try {
            const ddgRes = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`, {
              signal: AbortSignal.timeout(8000),
            })
            const ddgData = await ddgRes.json()
            if (ddgData.AbstractText) snippets.push(`Summary: ${ddgData.AbstractText.slice(0, 300)}`)
            if (ddgData.RelatedTopics) {
              for (const topic of ddgData.RelatedTopics.slice(0, 5)) {
                if (topic.Text) snippets.push(topic.Text.slice(0, 200))
              }
            }
          } catch {}
        }
        return {
          query,
          results: snippets.length > 0 ? snippets : ['No specific results found. Try rephrasing the query.'],
          source: 'Google + DuckDuckGo',
          note: 'These are real-time web search results. Analyze them to form your opinion.',
        }
      } catch (e) {
        return { query, error: `Web search failed: ${e.message}`, fallback: 'Use your existing knowledge to answer.' }
      }
    }

    // ── get_reddit_sentiment ─────────────────────────────────
    if (name === 'get_reddit_sentiment') {
      const sym = args.symbol.toUpperCase().trim()
      const d = await flaskFetch(`/api/reddit-sentiment/${sym}`, 30000)
      if (!d.success) return { error: d.error || `Reddit sentiment failed for ${sym}` }
      return {
        symbol: sym,
        sentimentScore: d.sentiment_score,
        sentimentLabel: d.sentiment_label,
        postCount: d.post_count,
        bullishPosts: d.bullish_count,
        bearishPosts: d.bearish_count,
        neutralPosts: d.neutral_count,
        topPosts: (d.top_posts || []).slice(0, 5).map(p => ({
          title: p.title,
          subreddit: `r/${p.subreddit}`,
          upvotes: p.score,
          comments: p.num_comments,
          sentiment: p.sentiment > 0.15 ? 'Bullish' : p.sentiment < -0.15 ? 'Bearish' : 'Neutral',
        })),
        subredditsSearched: d.subreddits_searched,
        source: 'Reddit Public JSON API (real data)',
      }
    }

    // ── get_ml_prediction ────────────────────────────────────
    if (name === 'get_ml_prediction') {
      const sym = args.symbol.toUpperCase().trim()
      const d = await flaskFetch(`/api/predict/${sym}`, 60000)
      if (!d.success) return { error: d.error || `ML prediction failed for ${sym}` }
      const forecasts = d.priceForecastsByTimeframe || {}
      const tfPreds = d.timeframePredictions || []
      const result = {
        symbol: sym,
        currentPrice: `₹${d.currentPrice}`,
        overallSignal: d.overallSignal,
        dataPoints: d.dataPoints,
        timeframes: {},
      }
      const keys = ['tomorrow', 'next_week', 'next_month', 'next_3m', 'next_year']
      const labels = ['Tomorrow', 'Next Week', 'Next Month', 'Next 3 Months', 'Next Year']
      keys.forEach((k, i) => {
        const fc = forecasts[k]
        const tf = tfPreds[i]
        if (fc) {
          result.timeframes[labels[i]] = {
            predictedPrice: `₹${fc.price}`,
            change: `${fc.changePercent >= 0 ? '+' : ''}${fc.changePercent}%`,
            signal: fc.signal,
            bullTarget: `₹${fc.bullTarget}`,
            bearTarget: `₹${fc.bearTarget}`,
            accuracy: tf ? `${tf.accuracy}%` : 'N/A',
            buyProb: tf ? `${tf.buyProb}%` : 'N/A',
            sellProb: tf ? `${tf.sellProb}%` : 'N/A',
          }
        }
      })
      if (d.intelligence) {
        result.intelligenceAlpha = `${d.intelligence.totalIntelAlphaPct >= 0 ? '+' : ''}${d.intelligence.totalIntelAlphaPct}%/yr`
        result.redditSentiment = d.intelligence.redditData?.sentiment_label || 'N/A'
      }
      return result
    }

    return { error: `Unknown tool: ${name}` }
  } catch (e) {
    return { error: `Could not fetch data — Flask may not be running. Start it with: python app.py in flask_v3 folder. Error: ${e.message}` }
  }
}

// ─── Main Handler ──────────────────────────────────────────────────────────────
const PRIMARY_MODEL  = 'openai/gpt-oss-20b'    // Smaller model to fit free Groq tier (8k TPM)
const FALLBACK_MODEL = 'openai/gpt-oss-20b'

export async function POST(request) {
  const groqKey = process.env.GROQ_API_KEY
  if (!groqKey) return NextResponse.json({ error: 'GROQ_API_KEY not set in .env.local. Add it to nextjs_sidebyside/.env.local' }, { status: 500 })

  try {
    const { messages, stockContext } = await request.json()

    // Build context block with current stock data
    let contextBlock = ''
    if (stockContext) {
      const s = stockContext
      const forecasts = s.priceForecastsByTimeframe || {}
      const tfPreds = s.timeframePredictions || []
      const ind = s.indicators || {}

      const fmtFc = (key, label) => {
        const f = forecasts[key]
        if (!f) return null
        return `  ${label}: ₹${f.price} (${f.changePercent >= 0 ? '+' : ''}${Number(f.changePercent).toFixed(2)}%) | Bull ₹${f.bullTarget || '?'} / Bear ₹${f.bearTarget || '?'} → ${f.signal}`
      }
      const fcLines = [
        fmtFc('tomorrow', 'Tomorrow  '),
        fmtFc('next_week', 'Next Week '),
        fmtFc('next_month', 'Next Month'),
        fmtFc('next_3m', 'Next 3M   '),
        fmtFc('next_year', 'Next Year '),
      ].filter(Boolean).join('\n')

      contextBlock = `
Viewing: ${s.symbol} | ₹${s.currentPrice} (${s.priceChangePct >= 0 ? '+' : ''}${Number(s.priceChangePct || 0).toFixed(1)}%) | Signal: ${s.overallSignal || 'N/A'} | Sector: ${s.sector || 'N/A'}
${fcLines ? 'Forecasts:\n' + fcLines : ''}`
    }

    const systemPrompt = `You are DEIMOS AI, an NSE stock analyst with live data tools.
${contextBlock}

8 tools: get_stock_quote, get_financials, get_technical_indicators, get_price_history, compare_stocks, search_web (Google news), get_reddit_sentiment (Reddit buzz), get_ml_prediction (ML forecasts).

Rules:
- For buy/sell questions: call get_stock_quote + search_web + get_reddit_sentiment. Synthesize data into a clear answer.
- search_web for any news/events questions. get_reddit_sentiment for social buzz.
- NEVER invent data. Use tools. Be concise with bullets and emojis.
- End trading views with: "Not SEBI-registered financial advice."`

    // ─── Agentic Tool Loop (non-streaming, max 5 iterations) ───────────────────
    // Sanitize incoming messages: strip tool_calls/tool metadata from history
    // Groq rejects assistant messages that contain 'tool_calls' or 'tools' props
    const cleanMessages = messages
      .filter(m => m.role !== 'tool')  // Remove any tool-result messages from history
      .map(m => {
        if (m.role === 'assistant') {
          // Strip tool_calls and any other unsupported props — keep only role + content
          return { role: 'assistant', content: m.content || '' }
        }
        return { role: m.role, content: m.content }
      })

    // Only keep last 6 messages to save tokens on free tier
    const trimmedMessages = cleanMessages.slice(-6)

    // ─── Two-Phase Approach (no tool loop — 100% reliable) ───────────────────────
    // Phase 1: Detect intent from question → execute tools deterministically
    // Phase 2: Feed all tool data to model in a single text-only call
    const lastUserMsg = (trimmedMessages.filter(m => m.role === 'user').pop()?.content || '').toLowerCase()

    // Detect stock symbols in the question (NSE symbols are uppercase 2-20 char words)
    const symbolMatch = lastUserMsg.match(/\b([A-Z]{2,20})\b/i)
    let detectedSymbol = symbolMatch ? symbolMatch[1].toUpperCase() : ''

    // Common stock name mappings
    const NAME_MAP = {
      'reliance': 'RELIANCE', 'tcs': 'TCS', 'infosys': 'INFY', 'infy': 'INFY',
      'hdfc': 'HDFCBANK', 'hdfc bank': 'HDFCBANK', 'icici': 'ICICIBANK',
      'wipro': 'WIPRO', 'sbi': 'SBIN', 'airtel': 'BHARTIARTL', 'bharti': 'BHARTIARTL',
      'tatamotors': 'TATAMOTORS', 'tata motors': 'TATAMOTORS', 'tata steel': 'TATASTEEL',
      'bajaj': 'BAJFINANCE', 'kotak': 'KOTAKBANK', 'adani': 'ADANIENT',
      'maruti': 'MARUTI', 'lt': 'LT', 'axis': 'AXISBANK', 'itc': 'ITC',
      'sunpharma': 'SUNPHARMA', 'hcl': 'HCLTECH', 'asian paints': 'ASIANPAINT',
      'ultratech': 'ULTRACEMCO', 'titan': 'TITAN', 'nestle': 'NESTLEIND',
      'power grid': 'POWERGRID', 'ntpc': 'NTPC', 'ongc': 'ONGC', 'coal india': 'COALINDIA',
      'hindalco': 'HINDALCO', 'jsw': 'JSWSTEEL', 'tech mahindra': 'TECHM',
      'mahindra': 'M&M', 'indusind': 'INDUSINDBK', 'zomato': 'ZOMATO', 'paytm': 'PAYTM',
    }
    for (const [name, sym] of Object.entries(NAME_MAP)) {
      if (lastUserMsg.includes(name)) { detectedSymbol = sym; break }
    }

    // Detect intent
    const isBuySellQuestion = /\b(buy|sell|invest|hold|worth|should|long\s*term|short\s*term|good|bad|opinion|recommend)\b/i.test(lastUserMsg)
    const isPriceQuestion = /\b(price|current|live|quote|today|value|trading)\b/i.test(lastUserMsg)
    const isCompare = /\b(compare|vs|versus|better|between)\b/i.test(lastUserMsg)
    const isTechnical = /\b(technical|rsi|macd|indicator|chart|support|resistance|momentum)\b/i.test(lastUserMsg)
    const isFundamental = /\b(fundamental|pe|ratio|eps|revenue|profit|financials|valuation|balance\s*sheet|dividend)\b/i.test(lastUserMsg)
    const isNews = /\b(news|latest|recent|update|event|quarter|result|announcement|ipo)\b/i.test(lastUserMsg)
    const isPrediction = /\b(predict|forecast|target|tomorrow|next\s*week|next\s*month|future)\b/i.test(lastUserMsg)
    const isSentiment = /\b(sentiment|reddit|buzz|social|people|opinion|retail|discuss)\b/i.test(lastUserMsg)
    const isHistory = /\b(history|past|return|performance|year|month|ago)\b/i.test(lastUserMsg)

    // Detect second symbol for comparison
    let symbol2 = ''
    if (isCompare) {
      const allSymbols = lastUserMsg.match(/\b[A-Z]{2,20}\b/gi) || []
      if (allSymbols.length >= 2) {
        symbol2 = allSymbols[1].toUpperCase()
      }
    }

    // Phase 1: Execute relevant tools based on intent
    const toolResults = {}
    const toolsUsed = []

    if (detectedSymbol) {
      const toolsToRun = []

      if (isBuySellQuestion) {
        // Comprehensive analysis for buy/sell questions
        toolsToRun.push('get_stock_quote', 'get_financials', 'get_technical_indicators', 'search_web', 'get_reddit_sentiment')
      } else {
        if (isPriceQuestion) toolsToRun.push('get_stock_quote')
        if (isTechnical) toolsToRun.push('get_stock_quote', 'get_technical_indicators')
        if (isFundamental) toolsToRun.push('get_stock_quote', 'get_financials')
        if (isNews) toolsToRun.push('search_web')
        if (isPrediction) toolsToRun.push('get_stock_quote', 'get_ml_prediction')
        if (isSentiment) toolsToRun.push('get_reddit_sentiment')
        if (isHistory) toolsToRun.push('get_price_history')
        if (isCompare && symbol2) toolsToRun.push('compare_stocks')
        // Default: at least get quote + technicals
        if (toolsToRun.length === 0) toolsToRun.push('get_stock_quote', 'get_technical_indicators')
      }

      // Deduplicate
      const uniqueTools = [...new Set(toolsToRun)]

      // Execute all tools in parallel
      const execPromises = uniqueTools.map(async (toolName) => {
        try {
          let args = { symbol: detectedSymbol }
          if (toolName === 'search_web') args = { query: `${detectedSymbol} stock latest news analysis 2026` }
          if (toolName === 'get_price_history') args = { symbol: detectedSymbol, period: '1y' }
          if (toolName === 'compare_stocks') args = { symbol1: detectedSymbol, symbol2 }

          const result = await executeTool(toolName, args)
          toolResults[toolName] = result
          toolsUsed.push({ name: toolName, args, symbol: detectedSymbol })
        } catch (e) {
          toolResults[toolName] = { error: e.message }
        }
      })

      await Promise.all(execPromises)
    }

    // Phase 2: Build a data-rich prompt and get a single text response
    let dataBlock = ''
    if (Object.keys(toolResults).length > 0) {
      dataBlock = '\n\n=== LIVE DATA FETCHED ===\n'
      for (const [tool, result] of Object.entries(toolResults)) {
        dataBlock += `\n--- ${tool} ---\n${JSON.stringify(result, null, 1)}\n`
      }
      dataBlock += '\n=== END DATA ===\n\nUse the above data to answer. Do NOT invent numbers — only cite data shown above.'
    }

    const finalMessages = [
      { role: 'system', content: systemPrompt + dataBlock },
      ...trimmedMessages,
    ]

    let activeModel = PRIMARY_MODEL

    // Single LLM call — no tools, just text response
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: activeModel,
            messages: finalMessages,
            max_tokens: 900,
            temperature: 0.55,
          }),
        })

        if (!resp.ok) {
          const errText = await resp.text()
          let errJson = {}
          try { errJson = JSON.parse(errText) } catch {}
          const errMsg = errJson?.error?.message || errText.slice(0, 200)

          if (resp.status === 401) {
            return NextResponse.json({ error: 'Groq API key is invalid or expired. Generate a new key at https://console.groq.com/keys' }, { status: 401 })
          }
          if (resp.status === 429 && attempt === 0) {
            activeModel = FALLBACK_MODEL
            continue
          }
          if (resp.status === 503) {
            return NextResponse.json({ error: 'Groq servers overloaded. Try again in a few seconds.' }, { status: 503 })
          }
          return NextResponse.json({ error: `AI error (${resp.status}): ${errMsg}` }, { status: 502 })
        }

        const data = await resp.json()
        const answer = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a response. Please try again.'
        return _buildSSEResponse(toolsUsed, answer)

      } catch (e) {
        if (attempt === 0) continue
        return NextResponse.json({ error: `Chat failed: ${e.message}` }, { status: 500 })
      }
    }

    return NextResponse.json({ error: 'Unable to generate a response. Please try again.' }, { status: 500 })
  } catch (err) {
    console.error('Chat handler error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// Helper: Build an SSE response from tools + final text (simulates streaming)
function _buildSSEResponse(toolsUsed, text) {
  const encoder = new TextEncoder()
  const { readable, writable } = new TransformStream()
  const writer = writable.getWriter()

  ;(async () => {
    try {
      // Send tools-used event first
      if (toolsUsed.length > 0) {
        const toolEvent = `data: ${JSON.stringify({ type: 'tools_used', tools: toolsUsed })}\n\n`
        await writer.write(encoder.encode(toolEvent))
      }
      // Simulate streaming by sending the text in small chunks
      const words = text.split(' ')
      for (let i = 0; i < words.length; i += 3) {
        const chunk = words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '')
        const sseData = {
          choices: [{ delta: { content: chunk } }]
        }
        await writer.write(encoder.encode(`data: ${JSON.stringify(sseData)}\n\n`))
      }
      await writer.write(encoder.encode('data: [DONE]\n\n'))
    } catch (e) {
      console.error('SSE stream error:', e)
    } finally {
      await writer.close()
    }
  })()

  return new NextResponse(readable, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  })
}
