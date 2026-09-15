import { NextResponse } from 'next/server'

export async function POST(request, { params }) {
  const { symbol } = await params
  const groqKey = process.env.GROQ_API_KEY

  if (!groqKey) {
    return NextResponse.json({ success: false, error: 'GROQ_API_KEY not set in .env.local' }, { status: 500 })
  }

  try {
    const body = await request.json()
    const {
      name = symbol, sector = 'Unknown',
      currentPrice = 'N/A', priceChangePct = 0,
      signal = 'HOLD', dataPoints = 0,
      indicators = {}, timeframePredictions = [],
      priceForecastsByTimeframe = {},
      buyVotes = 0, holdVotes = 0, sellVotes = 0,
    } = body

    // Build timeframe section
    const keys = ['tomorrow', 'next_week', 'next_month', 'next_3m', 'next_year']
    const tfLines = timeframePredictions.map((tf, i) => {
      const pf = priceForecastsByTimeframe[keys[i]] || {}
      const priceStr = pf.price ? `  -> Target: Rs${pf.price} (${pf.changePercent >= 0 ? '+' : ''}${Number(pf.changePercent).toFixed(1)}%)` : ''
      return `  - ${tf.timeframe}: ${tf.signal} | B:${tf.buyProb}% H:${tf.holdProb}% S:${tf.sellProb}% | Accuracy: ${tf.accuracy}%${priceStr}`
    })
    const tfSection = tfLines.length ? tfLines.join('\n') : '  No ML predictions loaded yet.'

    const prompt = `You are a senior equity research analyst at a top Indian brokerage covering NSE stocks.
Write a concise, data-grounded analyst report for ${symbol} (${name}) based ONLY on the data below.
Do NOT invent numbers. Be specific and direct.

=== STOCK DATA ===
Symbol: ${symbol} | Company: ${name} | Sector: ${sector}
Current Price: Rs${currentPrice} (${Number(priceChangePct) >= 0 ? '+' : ''}${Number(priceChangePct).toFixed(2)}% today)
Historical Data: ${dataPoints} trading days

=== TECHNICAL INDICATORS ===
RSI(14): ${indicators.rsi ?? 'N/A'}
MACD: ${indicators.macd ?? 'N/A'} | Signal Line: ${indicators.macd_signal ?? 'N/A'}
Bollinger %B: ${indicators.bb_pct ?? 'N/A'}
Stoch K: ${indicators.stoch_k ?? 'N/A'} | CCI(20): ${indicators.cci ?? 'N/A'}
Williams %R: ${indicators.williams_r ?? 'N/A'} | ATR: ${indicators.atr ?? 'N/A'}
Volume Ratio: ${indicators.volume_ratio ?? 'N/A'}x
MA20: Rs${indicators.ma20 ?? 'N/A'} | MA50: Rs${indicators.ma50 ?? 'N/A'} | MA200: Rs${indicators.ma200 ?? 'N/A'}
Momentum: ${indicators.momentum ?? 'N/A'}

=== ML SIGNALS ===
Overall Signal: ${signal}
Vote Tally: BUY=${buyVotes} | HOLD=${holdVotes} | SELL=${sellVotes}
Timeframe Predictions:
${tfSection}

=== WRITE EXACTLY THESE 5 SECTIONS ===

**Technical Picture**
2-3 sentences covering RSI level, MACD crossover status, Bollinger position, and MA alignment. Use exact numbers from above.

**Volume & Momentum**
1-2 sentences on volume ratio, ATR volatility, and momentum reading.

**ML Model Outlook**
2-3 sentences on what the ensemble signals across timeframes imply. Flag any short vs long horizon conflicts. Be honest about accuracy — random baseline is 33%.

**Key Levels to Watch**
Bullet points for key support levels (near MA20/MA50/MA200) and resistance. Derive directly from the data.

**Recommendation**
One clear verdict sentence. Then exactly this disclaimer: "This is AI-generated research for educational purposes only. Not SEBI-registered financial advice."
`

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${groqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 900,
        temperature: 0.45,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      let errMsg = errText.slice(0, 300)
      try { errMsg = JSON.parse(errText)?.error?.message || errMsg } catch {}
      if (groqRes.status === 401 || groqRes.status === 403) {
        return NextResponse.json({ success: false, error: 'Groq API key is invalid or expired. Generate a new key at https://console.groq.com/keys and update GROQ_API_KEY in .env.local' }, { status: 401 })
      }
      return NextResponse.json({ success: false, error: `Groq API error ${groqRes.status}: ${errMsg}` }, { status: 502 })
    }

    const data = await groqRes.json()
    const report = data.choices[0].message.content
    const tokens = data.usage?.total_tokens ?? 0

    return NextResponse.json({
      success: true,
      report,
      symbol,
      model: 'openai/gpt-oss-120b',
      tokens,
    })

  } catch (err) {
    console.error('Groq report error:', err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
