'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import DeimosNav from '../../components/DeimosNav'
import '../deimos-app.css'
import {
  AreaChart, Area, LineChart, Line, BarChart, Bar,
  ComposedChart, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine
} from 'recharts'

const FLASK_CANDIDATES = ['http://127.0.0.1:5000', 'http://localhost:5000']
const PREDICT_TIMEOUT_MS = 600000  // 10 min — first-time training (5 timeframes × stacked ensembles + LSTM) can take several minutes on CPU

// ── SIGNAL BADGE ──────────────────────────────────────
function SignalBadge({ signal, size = 'sm' }) {
  const c = {
    BUY:  { bg:'rgba(34,197,94,0.12)',  border:'rgba(34,197,94,0.35)',  color:'#22c55e', icon:'▲' },
    SELL: { bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.35)',  color:'#ef4444', icon:'▼' },
    HOLD: { bg:'rgba(240,180,41,0.12)', border:'rgba(240,180,41,0.35)', color:'#f0b429', icon:'●' },
  }[signal] || { bg:'rgba(255,255,255,0.05)', border:'rgba(255,255,255,0.1)', color:'#6b7f90', icon:'?' }
  return (
    <span style={{background:c.bg,border:`1px solid ${c.border}`,color:c.color,
      padding:size==='lg'?'0.5rem 1.4rem':size==='xl'?'0.7rem 2rem':'0.2rem 0.6rem',
      borderRadius:100,fontFamily:'Space Grotesk, sans-serif',fontWeight:800,
      fontSize:size==='xl'?'1.2rem':size==='lg'?'1rem':'0.68rem',
      display:'inline-flex',alignItems:'center',gap:'0.3rem'}}>
      {c.icon} {signal}
    </span>
  )
}

// ── ACCURACY GAUGE ────────────────────────────────────
function AccGauge({ value, label }) {
  const v = parseFloat(value)||0
  const color = v>=75?'#22c55e':v>=60?'#f0b429':'#ef4444'
  const angle = -135+(v/100)*270
  return (
    <div style={{textAlign:'center'}}>
      <svg viewBox="0 0 120 80" style={{width:130,height:90}}>
        <path d="M10,70 A50,50 0 0,1 110,70" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="12" strokeLinecap="round"/>
        <path d="M10,70 A50,50 0 0,1 110,70" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
          strokeDasharray={`${(v/100)*157} 157`} opacity="0.9"/>
        <circle cx={60+38*Math.cos((angle-90)*Math.PI/180)} cy={70+38*Math.sin((angle-90)*Math.PI/180)}
          r="5" fill={color} style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
        <text x="60" y="58" textAnchor="middle" fill="#e8edf2" fontSize="15" fontFamily="Space Grotesk,sans-serif" fontWeight="800">{v.toFixed(1)}%</text>
        <text x="60" y="72" textAnchor="middle" fill={color} fontSize="6.5" fontFamily="Space Grotesk,sans-serif" fontWeight="700">ACCURACY</text>
      </svg>
      {label && <div style={{fontSize:'0.65rem',color:'#6b7f90',marginTop:'-0.25rem'}}>{label}</div>}
    </div>
  )
}

// ── TRADINGVIEW CHART ─────────────────────────────────
function TVChart({ symbol }) {
  const containerRef = useRef(null)
  useEffect(() => {
    if (!containerRef.current) return
    containerRef.current.innerHTML = ''

    const wrapper = document.createElement('div')
    wrapper.className = 'tradingview-widget-container'
    wrapper.style.cssText = 'width:100%;height:100%'

    const widgetEl = document.createElement('div')
    widgetEl.className = 'tradingview-widget-container__widget'
    widgetEl.style.cssText = 'width:100%;height:calc(100% - 32px)'
    wrapper.appendChild(widgetEl)

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.textContent = JSON.stringify({
      autosize: true,
      symbol: 'NSE:' + symbol,
      interval: 'D',
      timezone: 'Asia/Kolkata',
      theme: 'dark',
      style: '1',
      locale: 'en',
      allow_symbol_change: true,
      calendar: false,
      support_host: 'https://www.tradingview.com'
    })
    wrapper.appendChild(script)
    containerRef.current.appendChild(wrapper)

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [symbol])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

// ── STOCK PRICE CHART (Own data from Yahoo Finance) ───
function StockChart({ data, symbol }) {
  if (!data || data.length === 0) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100%',color:'#6b7f90',fontSize:'0.85rem'}}>No chart data available</div>
  const chartData = data.slice(-120).map(d => ({
    date: d.date || d.Date,
    close: d.close || d.Close,
    high: d.high || d.High,
    low: d.low || d.Low,
    open: d.open || d.Open,
    volume: d.volume || d.Volume,
  }))
  const prices = chartData.map(d => d.close).filter(Boolean)
  const minP = Math.min(...prices) * 0.98
  const maxP = Math.max(...prices) * 1.02
  const firstP = prices[0], lastP = prices[prices.length - 1]
  const up = lastP >= firstP
  const color = up ? '#22c55e' : '#ef4444'
  return (
    <div style={{width:'100%',height:'100%',display:'flex',flexDirection:'column'}}>
      <div style={{flex:1,minHeight:0}}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{top:5,right:10,bottom:5,left:10}}>
            <defs>
              <linearGradient id={`grad_${symbol}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.25}/>
                <stop offset="100%" stopColor={color} stopOpacity={0.02}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="date" tick={{fontSize:9,fill:'#6b7f90'}} tickLine={false} axisLine={{stroke:'rgba(255,255,255,0.06)'}}
              tickFormatter={v => { try { const d = new Date(v); return `${d.getDate()} ${d.toLocaleString('en',{month:'short'})}` } catch { return v?.slice(5) || '' }}} interval={Math.floor(chartData.length/6)} />
            <YAxis domain={[minP, maxP]} tick={{fontSize:9,fill:'#6b7f90'}} tickLine={false} axisLine={{stroke:'rgba(255,255,255,0.06)'}}
              tickFormatter={v => `₹${v?.toFixed(0)}`} width={55} />
            <Tooltip content={<ChartTip />} />
            <Area type="monotone" dataKey="close" stroke={color} strokeWidth={2} fill={`url(#grad_${symbol})`} dot={false} />
            <Line type="monotone" dataKey="high" stroke="rgba(34,197,94,0.25)" strokeWidth={1} dot={false} strokeDasharray="2 4" />
            <Line type="monotone" dataKey="low" stroke="rgba(239,68,68,0.25)" strokeWidth={1} dot={false} strokeDasharray="2 4" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── TV TECHNICAL ANALYSIS ─────────────────────────────
function TVTechnical({ symbol }) {
  const ref = useRef(null)
  useEffect(()=>{
    if(!ref.current) return
    ref.current.innerHTML=''
    const s=document.createElement('script')
    s.src='https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js'
    s.async=true
    s.innerHTML=JSON.stringify({interval:'1D',width:'100%',isTransparent:true,height:'100%',symbol:`NSE:${symbol}`,showIntervalTabs:true,locale:'en',colorTheme:'dark'})
    ref.current.appendChild(s)
    return()=>{if(ref.current) ref.current.innerHTML=''}
  },[symbol])
  return <div ref={ref} style={{height:'100%',width:'100%'}}><div className="tradingview-widget-container__widget" style={{height:'100%',width:'100%'}}/></div>
}

// ── CHART TOOLTIP ─────────────────────────────────────
function ChartTip({ active, payload, label }) {
  if(!active||!payload?.length) return null
  return (
    <div style={{background:'rgba(4,8,16,0.97)',border:'1px solid rgba(255,45,85,0.2)',borderRadius:8,padding:'0.6rem 0.9rem',fontSize:'0.72rem'}}>
      <div style={{color:'#6b7f90',marginBottom:'0.3rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>{label}</div>
      {payload.map(p=><div key={p.dataKey} style={{color:p.color||'#e8edf2',marginBottom:'0.1rem'}}>{p.name}: <strong>{typeof p.value==='number'?p.value.toFixed(2):p.value}</strong></div>)}
    </div>
  )
}

// ── FORMAT NUMBER ─────────────────────────────────────
function fmtN(n) {
  if(!n&&n!==0) return '—'
  if(n>=1e12) return `₹${(n/1e12).toFixed(2)}T`
  if(n>=1e9)  return `₹${(n/1e9).toFixed(2)}B`
  if(n>=1e7)  return `₹${(n/1e7).toFixed(2)}Cr`
  if(n>=1e5)  return `₹${(n/1e5).toFixed(2)}L`
  if(n>=1000) return `₹${(n/1000).toFixed(1)}K`
  return `₹${n.toFixed(2)}`
}
function fmtPct(n) { return n!=null ? `${(n*100).toFixed(2)}%` : '—' }
function fmtR(n,d=2) { return n!=null ? n.toFixed(d) : '—' }

// ─────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────
export default function PredictPage() {
  const [flaskBase, setFlaskBase] = useState(FLASK_CANDIDATES[0])
  const [apiStatus, setApiStatus] = useState('checking')
  const [totalStocks, setTotalStocks] = useState(0)
  const [allStocks, setAllStocks]   = useState([])
  const [loadingStocks, setLoadingStocks] = useState(false)
  const [search, setSearch]         = useState('')
  const [page, setPage]             = useState(1)
  const [selIndex, setSelIndex]     = useState('ALL')
  const [indexStocks, setIndexStocks]= useState([])
  const [loadingIndex, setLoadingIndex] = useState(false)
  const [selected, setSelected]     = useState(null)
  const [result, setResult]         = useState(null)
  const [loading, setLoading]       = useState(false)   // overview (fast path)
  const [error, setError]           = useState(null)
  const [mlLoading, setMlLoading]   = useState(false)   // /api/predict (slow ML)
  const [mlError, setMlError]       = useState(null)
  const [mlLoaded, setMlLoaded]     = useState(false)
  const [chartTab, setChartTab]     = useState('tv')
  const [activeTab, setActiveTab]   = useState('predict')
  const [scanResults, setScanResults]= useState([])
  const [scanning, setScanning]     = useState(false)
  const [scanLimit, setScanLimit]   = useState(50)

  // Groq AI Report
  const [groqReport, setGroqReport] = useState(null)
  const [groqLoading, setGroqLoading] = useState(false)
  const [groqError, setGroqError]   = useState(null)
  const [groqModel, setGroqModel]   = useState('')
  const [groqTokens, setGroqTokens] = useState(0)
  // AI Chat
  const [chatOpen, setChatOpen]     = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput]   = useState('')
  const [chatStreaming, setChatStreaming] = useState(false)
  const chatEndRef = useRef(null)
  const chatInputRef = useRef(null)
  const [chatToolsUsed, setChatToolsUsed] = useState([])
  const [chatFetching, setChatFetching]   = useState(false)

  // Multi-Agent Analysis
  const [agentResult, setAgentResult]     = useState(null)
  const [agentLoading, setAgentLoading]   = useState(false)
  const [agentError, setAgentError]       = useState(null)

  // Reddit Sentiment
  const [redditData, setRedditData]         = useState(null)
  const [redditLoading, setRedditLoading]   = useState(false)
  const [redditError, setRedditError]       = useState(null)

  // Backtest
  const [backtestResult, setBacktestResult]   = useState(null)
  const [backtestLoading, setBacktestLoading] = useState(false)
  const [backtestError, setBacktestError]     = useState(null)
  const [btStartDate, setBtStartDate]         = useState('')
  const [btEndDate, setBtEndDate]             = useState('')
  const [btHorizon, setBtHorizon]             = useState(5)

  const INDICES = ['ALL','NIFTY 50','NIFTY NEXT 50','NIFTY MIDCAP 100',
    'NIFTY SMALLCAP 100','NIFTY BANK','NIFTY IT','NIFTY PHARMA',
    'NIFTY AUTO','NIFTY FMCG','NIFTY METAL','NIFTY REALTY',
    'NIFTY ENERGY','NIFTY FINANCE SERVICE']

  async function fetchFlask(path, options = {}) {
    let lastErr = null
    for (const base of FLASK_CANDIDATES) {
      try {
        const res = await fetch(`${base}${path}`, options)
        setFlaskBase(base)
        return res
      } catch (err) {
        lastErr = err
      }
    }
    throw lastErr || new Error('Unable to reach Flask API')
  }

  // Check API health
  useEffect(()=>{
    fetchFlask('/api/health')
      .then(r=>r.json())
      .then(d=>{ setApiStatus(d.status==='running'?'online':'offline'); setTotalStocks(d.total_stocks||0) })
      .catch(()=>setApiStatus('offline'))
  },[])

  // Load all stocks
  useEffect(()=>{ loadStocks(1,'') },[])

  async function loadStocks(pg,srch) {
    setLoadingStocks(true)
    try {
      const url=`/api/nse/all?page=${pg}&per_page=200${srch?`&search=${encodeURIComponent(srch)}`:''}`
      const d=await (await fetchFlask(url)).json()
      if(d.success) {
        if(pg===1) setAllStocks(d.stocks)
        else setAllStocks(prev=>[...prev,...d.stocks])
        setTotalStocks(d.total)
      }
    } catch(e){}
    setLoadingStocks(false)
  }

  // Load index stocks
  useEffect(()=>{
    if(selIndex==='ALL'){ setIndexStocks([]); return }
    setLoadingIndex(true)
    fetchFlask(`/api/nse/index/${encodeURIComponent(selIndex)}`)
      .then(r=>r.json())
      .then(d=>{ if(d.success) setIndexStocks(d.stocks) })
      .catch(()=>{})
      .finally(()=>setLoadingIndex(false))
  },[selIndex])

  // Search debounce
  useEffect(()=>{
    const t=setTimeout(()=>{ loadStocks(1,search); setPage(1) },400)
    return()=>clearTimeout(t)
  },[search])


  const displayList = selIndex==='ALL' ? allStocks : indexStocks

  // Fetch helper that returns parsed JSON with clear errors.
  async function fetchJson(path, { timeoutMs = 60000, ...options } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetchFlask(path, { ...options, signal: controller.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } })
      const raw = await res.text()
      let d = null
      try { d = JSON.parse(raw) } catch {}
      if (!res.ok) throw new Error(d?.error || `HTTP ${res.status} from Flask`)
      if (!d) {
        const ct = res.headers.get('content-type') || 'unknown-content-type'
        const preview = (raw || '').replace(/\s+/g, ' ').slice(0, 140)
        throw new Error(`Invalid JSON (HTTP ${res.status}, ${ct}): ${preview || '[empty response]'}`)
      }
      return d
    } finally {
      clearTimeout(timer)
    }
  }

  // Stage 1 (fast): overview — fills price / chartData / indicators / financials.
  // TradingView tab renders instantly from `selected` alone; the rest of the
  // tabs become functional once this finishes (~3–8s).
  async function runPrediction(sym) {
    const isNewSymbol = sym !== selected
    setSelected(sym)
    setLoading(true); setResult(null); setError(null)
    setMlLoading(false); setMlError(null); setMlLoaded(false)
    setGroqReport(null); setGroqError(null); setGroqLoading(false)
    setAgentResult(null); setAgentError(null); setAgentLoading(false)
    if (isNewSymbol) setChartTab('tv')
    try {
      const d = await fetchJson(`/api/stock/overview/${sym}`, { timeoutMs: 45000 })
      if (d.success) setResult(d)
      else setError(d.error || 'Overview failed')
    } catch (e) {
      if (e.name === 'AbortError') setError('Overview request timed out. Retry or try another stock.')
      else setError(`Overview failed: ${e.message}`)
    }
    setLoading(false)
  }

  // Stage 2 (slow): ML predictions — triggered on demand when the ML Prediction
  // tab is first opened. Merges into `result` so all existing render code works.
  async function loadMl(sym) {
    if (!sym || mlLoading) return
    setMlLoading(true); setMlError(null)
    try {
      const d = await fetchJson(`/api/predict/${sym}`, { timeoutMs: PREDICT_TIMEOUT_MS })
      if (d.success) {
        setResult(prev => ({ ...(prev || {}), ...d, financials: prev?.financials, chartData: prev?.chartData, indicators: prev?.indicators, indicatorSignals: prev?.indicatorSignals }))
        setMlLoaded(true)
      } else {
        setMlError(d.error || 'Prediction failed')
      }
    } catch (e) {
      if (e.name === 'AbortError') setMlError('ML prediction timed out. Retry or try another stock.')
      else setMlError(`ML prediction failed: ${e.message}`)
    }
    setMlLoading(false)
  }

  // Auto-trigger ML fetch the first time the user opens the ML Prediction tab.
  useEffect(() => {
    if (chartTab === 'prediction' && selected && !mlLoaded && !mlLoading && !mlError) {
      loadMl(selected)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTab, selected, mlLoaded, mlLoading, mlError])

  // Auto-fetch Groq report when AI Report tab opened (needs overview data at minimum)
  useEffect(() => {
    if (chartTab === 'groq' && selected && result && !groqReport && !groqLoading && !groqError) {
      fetchGroqReport()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTab, selected, result])

  // Auto-fetch multi-agent when agents tab opened
  useEffect(() => {
    if (chartTab === 'agents' && selected && result && !agentResult && !agentLoading && !agentError) {
      fetchMultiAgent()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTab, selected, result, agentResult, agentLoading, agentError])

  // Auto-fetch Reddit sentiment when reddit tab opened
  useEffect(() => {
    if (chartTab === 'reddit' && selected && !redditData && !redditLoading && !redditError) {
      fetchRedditSentiment()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartTab, selected, redditData, redditLoading, redditError])

  async function fetchRedditSentiment() {
    if (!selected) return
    setRedditLoading(true)
    setRedditError(null)
    try {
      const d = await fetchJson(`/api/reddit-sentiment/${selected}`, { timeoutMs: 30000 })
      if (d.success !== false) {
        setRedditData(d)
      } else {
        setRedditError(d.error || 'Reddit sentiment fetch failed')
      }
    } catch (e) {
      setRedditError(`Reddit sentiment failed: ${e.message}`)
    }
    setRedditLoading(false)
  }

  async function fetchMultiAgent() {
    if (!result || !selected) return
    setAgentLoading(true)
    setAgentError(null)
    try {
      const payload = {
        name: result.name || selected,
        sector: result.sector || 'Unknown',
        industry: result.industry || 'Unknown',
        currentPrice: result.currentPrice,
        priceChangePct: result.priceChangePct,
        dailyVolPct: result.dailyVolPct || 0,
        overallSignal: result.overallSignal,
        dataPoints: result.dataPoints,
        indicators: result.indicators || {},
        financials: result.financials || {},
        timeframePredictions: result.timeframePredictions || [],
        priceForecastsByTimeframe: result.priceForecastsByTimeframe || {},
        buyVotes: result.buyVotes || 0,
        holdVotes: result.holdVotes || 0,
        sellVotes: result.sellVotes || 0,
      }
      const d = await fetchJson(`/api/multi-agent-analysis/${selected}`, {
        timeoutMs: 120000,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (d.success) {
        setAgentResult(d)
      } else {
        setAgentError(d.error || 'Multi-agent analysis failed')
      }
    } catch (e) {
      setAgentError(`Multi-agent analysis failed: ${e.message}`)
    }
    setAgentLoading(false)
  }

  async function fetchGroqReport() {
    if (!result || !selected) return
    setGroqLoading(true)
    setGroqError(null)
    try {
      const payload = {
        name: result.name || selected,
        sector: result.sector || 'Unknown',
        currentPrice: result.currentPrice,
        priceChangePct: result.priceChangePct,
        signal: result.overallSignal,
        dataPoints: result.dataPoints,
        indicators: result.indicators || {},
        timeframePredictions: result.timeframePredictions || [],
        priceForecastsByTimeframe: result.priceForecastsByTimeframe || {},
        buyVotes: result.buyVotes || 0,
        holdVotes: result.holdVotes || 0,
        sellVotes: result.sellVotes || 0,
      }
      // Call Next.js API route (server-side → no CORS, reads .env.local natively)
      const res = await fetch(`/api/groq-report/${selected}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json()
      if (d.success) {
        setGroqReport(d.report)
        setGroqModel(d.model)
        setGroqTokens(d.tokens)
      } else {
        setGroqError(d.error || 'Groq report failed')
      }
    } catch (e) {
      setGroqError(`Failed to generate report: ${e.message}`)
    }
    setGroqLoading(false)
  }

  // Scan
  async function runScan() {
    setScanning(true); setScanResults([])
    try {
      const syms = displayList.slice(0,scanLimit).map(s=>s.symbol||s).join(',')
      const d=await (await fetchFlask(`/api/scan?symbols=${syms}&limit=${scanLimit}`)).json()
      if(d.success) setScanResults(d.results)
    } catch(e){ setError('Scan failed') }
    setScanning(false)
  }

  async function savePredictionToDb() {
    if (!result || !selected) return
    try {
      const payload = {
        symbol: selected,
        companyName: result.name || selected,
        timeframePredictions: result.timeframePredictions || [],
        priceForecastsByTimeframe: result.priceForecastsByTimeframe || {},
        signal: result.overallSignal,
        currentPrice: result.currentPrice ?? null,
        rsi: result.indicators?.rsi ?? null,
        macd: result.indicators?.macd ?? null,
        overallSignal: result.overallSignal,
        userNote: '',
      }
      const res = await fetchFlask('/api/prediction/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Save failed')
      alert(data.message || 'Saved to database successfully')
    } catch (e) {
      alert(`Save failed: ${e.message}`)
    }
  }

  async function saveScanBatchToDb() {
    if (!scanResults.length) return
    try {
      const res = await fetchFlask('/api/volatile/save-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stocks: scanResults }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(data.error || 'Batch save failed')
      alert(data.message || `Saved ${data.saved}/${data.total}`)
    } catch (e) {
      alert(`Batch save failed: ${e.message}`)
    }
  }

  const pc = result?(result.priceChangePct>=0?'#22c55e':'#ef4444'):'#e8edf2'
  const fin = result?.financials || {}

  const TOOL_LABELS = {
    get_stock_quote:          '📈 Fetching live quote',
    get_financials:           '💰 Fetching financials',
    get_technical_indicators: '📊 Fetching indicators',
    get_price_history:        '📅 Fetching price history',
    compare_stocks:           '⚖️ Comparing stocks',
  }

  async function sendChatMessage(e) {
    e?.preventDefault()
    const text = chatInput.trim()
    if (!text || chatStreaming) return
    const userMsg = { role: 'user', content: text }
    const newHistory = [...chatMessages, userMsg]
    setChatMessages(newHistory)
    setChatInput('')
    setChatStreaming(true)
    setChatToolsUsed([])
    setChatFetching(false)
    try {
      const stockContext = result ? {
        symbol: selected,
        name: result.name,
        currentPrice: result.currentPrice,
        priceChangePct: result.priceChangePct,
        overallSignal: result.overallSignal,
        sector: result.sector,
        indicators: result.indicators,
        priceForecastsByTimeframe: result.priceForecastsByTimeframe || {},
        timeframePredictions: result.timeframePredictions || [],
        buyVotes: result.buyVotes,
        sellVotes: result.sellVotes,
        holdVotes: result.holdVotes,
        dailyVolPct: result.dailyVolPct,
      } : selected ? { symbol: selected } : null

      // Show a placeholder while tool loop runs (can take 5-15s)
      setChatFetching(true)
      setChatMessages(h => [...h, { role: 'assistant', content: '', fetching: true }])

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newHistory, stockContext }),
      })
      if (!res.ok) {
        let errMsg = `Chat error ${res.status}`
        try { const errData = await res.json(); errMsg = errData.error || errMsg } catch {}
        throw new Error(errMsg)
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let assistantText = ''
      let toolsReceived = []
      let streamStarted = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = dec.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (raw === '[DONE]') break
          try {
            const parsed = JSON.parse(raw)
            // Tool event — show which tools ran
            if (parsed.type === 'tools_used') {
              toolsReceived = parsed.tools || []
              setChatToolsUsed(toolsReceived)
              setChatFetching(false)
              // Replace fetching placeholder with empty streaming msg
              setChatMessages(h => [
                ...h.slice(0, -1),
                { role: 'assistant', content: '', tools: toolsReceived }
              ])
              streamStarted = true
              continue
            }
            // Regular streaming token
            const delta = parsed.choices?.[0]?.delta?.content || ''
            if (delta) {
              if (!streamStarted) {
                // First token with no tool calls — replace placeholder
                setChatFetching(false)
                setChatMessages(h => [
                  ...h.slice(0, -1),
                  { role: 'assistant', content: '', tools: [] }
                ])
                streamStarted = true
              }
              assistantText += delta
              setChatMessages(h => [
                ...h.slice(0, -1),
                { ...h[h.length - 1], content: assistantText }
              ])
            }
          } catch {}
        }
      }
    } catch (err) {
      setChatFetching(false)
      setChatMessages(h => [
        ...h.slice(0, -1),
        { role: 'assistant', content: `⚠️ ${err.message}` }
      ])
    }
    setChatStreaming(false)
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMessages])

  // Focus input when chat opens
  useEffect(() => { if (chatOpen) setTimeout(() => chatInputRef.current?.focus(), 100) }, [chatOpen])

  return (
    <main className="deimos-app">

      <DeimosNav active="predict" apiStatus={apiStatus} totalStocks={totalStocks} />


      {apiStatus==='offline'&&(
        <div style={{background:'rgba(239,68,68,0.1)',borderBottom:'1px solid rgba(239,68,68,0.3)',padding:'0.6rem 1.5rem',display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
          <span style={{color:'#ef4444',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem'}}>⚠️ Flask not running!</span>
          <code style={{background:'rgba(0,0,0,0.3)',color:'#22c55e',padding:'0.2rem 0.6rem',borderRadius:5,fontSize:'0.75rem'}}>cd ..\flask_v3 && python app.py</code>
        </div>
      )}

      {/* Header */}
      <div style={{background:'#0f0a12',borderBottom:'1px solid rgba(255,255,255,0.06)',padding:'0.85rem 1.5rem',textAlign:'center'}}>
        <div style={{display:'inline-flex',alignItems:'center',gap:'0.5rem',background:'rgba(196,30,58,0.08)',border:'1px solid rgba(196,30,58,0.2)',color:'#c41e3a',padding:'0.25rem 1rem',borderRadius:100,fontSize:'0.7rem',fontWeight:600,marginBottom:'0.4rem',fontFamily:'Space Grotesk,sans-serif'}}>
          <span style={{width:5,height:5,background:'#c41e3a',borderRadius:'50%',animation:'pulse 2s infinite',display:'inline-block'}}/>
          Real LSTM + RF • {totalStocks}+ NSE Stocks • Multi-Timeframe: Tomorrow → Next Year • Model saved
        </div>
        <h1 style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1.5rem',margin:0,letterSpacing:'-0.02em'}}>Deimos AI Prediction Engine</h1>
      </div>

      {/* Mode tabs */}
      <div style={{background:'#0f0a12',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',padding:'0 1.5rem'}}>
        {[['predict','🎯 Predict Stock'],['scan','🔍 Scan Stocks']].map(([id,label])=>(
          <button key={id} onClick={()=>setActiveTab(id)}
            style={{padding:'0.65rem 1.2rem',background:'transparent',border:'none',borderBottom:`2px solid ${activeTab===id?'#c41e3a':'transparent'}`,color:activeTab===id?'#c41e3a':'#6b7f90',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.8rem',whiteSpace:'nowrap'}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{display:'flex',height:'calc(100vh - 182px)',overflow:'hidden'}}>

        {/* LEFT: ALL NSE STOCKS */}
        <div style={{width:'265px',flexShrink:0,background:'#0a0a0f',borderRight:'1px solid rgba(255,255,255,0.05)',display:'flex',flexDirection:'column',overflow:'hidden'}}>
          <div style={{padding:'0.6rem',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0}}>
            <select value={selIndex} onChange={e=>setSelIndex(e.target.value)}
              style={{width:'100%',background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',color:'#e8edf2',padding:'0.4rem 0.6rem',borderRadius:7,fontSize:'0.75rem',outline:'none',marginBottom:'0.4rem',cursor:'pointer'}}>
              {INDICES.map(i=><option key={i} value={i}>{i==='ALL'?`ALL NSE Stocks (${totalStocks}+)`:i}</option>)}
            </select>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder={`🔍 Search ${totalStocks}+ NSE stocks...`}
              style={{width:'100%',background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',color:'#e8edf2',padding:'0.4rem 0.65rem',borderRadius:7,fontSize:'0.75rem',outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div style={{padding:'0.3rem 0.75rem',display:'flex',justifyContent:'space-between',alignItems:'center',borderBottom:'1px solid rgba(255,255,255,0.04)',flexShrink:0}}>
            <span style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>
              {loadingStocks||loadingIndex?'Loading from NSE...':`${displayList.length} stocks`}
            </span>
            {activeTab==='scan'&&(
              <div style={{display:'flex',alignItems:'center',gap:'0.3rem'}}>
                <select value={scanLimit} onChange={e=>setScanLimit(parseInt(e.target.value))}
                  style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',color:'#e8edf2',padding:'0.1rem 0.3rem',borderRadius:4,fontSize:'0.6rem',outline:'none'}}>
                  {[25,50,100,200].map(n=><option key={n} value={n}>{n}</option>)}
                </select>
                <button onClick={runScan} disabled={scanning||displayList.length===0}
                  style={{background:'rgba(196,30,58,0.1)',border:'1px solid rgba(196,30,58,0.25)',color:'#c41e3a',padding:'0.2rem 0.5rem',borderRadius:5,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.6rem'}}>
                  {scanning?'...':'🚀 Scan'}
                </button>
              </div>
            )}
          </div>
          <div style={{flex:1,overflowY:'auto'}}>
            {(loadingStocks||loadingIndex)&&displayList.length===0?(
              <div style={{padding:'2rem',textAlign:'center'}}>
                <div style={{width:28,height:28,border:'2px solid rgba(196,30,58,0.2)',borderTopColor:'#c41e3a',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 0.75rem'}}/>
                <div style={{fontSize:'0.72rem',color:'#6b7f90'}}>Loading all NSE stocks...</div>
              </div>
            ):displayList.length===0?(
              <div style={{padding:'2rem',textAlign:'center',color:'#4a5a6a',fontSize:'0.75rem'}}>No stocks found</div>
            ):(
              <>
                {displayList.map(stock=>{
                  const sym=stock.symbol||stock
                  const name=stock.name||stock.meta?.companyName||sym
                  const pct=stock.pChange||0
                  const price=stock.lastPrice||0
                  return(
                    <div key={sym} onClick={()=>{ setActiveTab('predict'); runPrediction(sym) }}
                      style={{padding:'0.5rem 0.75rem',cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',background:selected===sym?'rgba(196,30,58,0.08)':'transparent',borderBottom:'1px solid rgba(255,255,255,0.03)',borderLeft:`2px solid ${selected===sym?'#c41e3a':'transparent'}`,transition:'all 0.1s'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.8rem',color:selected===sym?'#c41e3a':'#e8edf2'}}>{sym}</div>
                        <div style={{fontSize:'0.58rem',color:'#4a5a6a',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:145}}>{name}</div>
                      </div>
                      {price>0&&(
                        <div style={{textAlign:'right',flexShrink:0}}>
                          <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem'}}>₹{price.toFixed(0)}</div>
                          <div style={{fontSize:'0.6rem',color:pct>=0?'#22c55e':'#ef4444',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>{pct>=0?'▲':'▼'}{Math.abs(pct).toFixed(1)}%</div>
                        </div>
                      )}
                    </div>
                  )
                })}
                {selIndex==='ALL'&&allStocks.length<totalStocks&&(
                  <div style={{padding:'0.75rem',textAlign:'center'}}>
                    <button onClick={()=>{ const np=page+1; setPage(np); loadStocks(np,search) }}
                      style={{background:'rgba(255,45,85,0.1)',border:'1px solid rgba(255,45,85,0.2)',color:'#ff2d55',padding:'0.4rem 1rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.7rem'}}>
                      Load More ({totalStocks-allStocks.length} remaining)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'}}>

          {/* PREDICT TAB */}
          {activeTab==='predict'&&(
            <>
              {!selected&&(
                <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',padding:'2rem'}}>
                  <div style={{fontSize:'5rem'}}>🤖</div>
                  <h2 style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.4rem',textAlign:'center'}}>Select any NSE stock</h2>
                  <p style={{color:'#6b7f90',fontSize:'0.85rem',textAlign:'center',maxWidth:500,lineHeight:1.8}}>
                    <strong style={{color:'#ff2d55'}}>{totalStocks}+ real NSE stocks</strong> from NSE official CSV<br/>
                    Get predictions for <strong style={{color:'#c41e3a'}}>Tomorrow • Next Week • Next Month • Next Year</strong><br/>
                    TradingView chart + Recharts ML charts + Complete financials
                  </p>
                </div>
              )}

              {selected&&(
                <>
                  {/* Header */}
                  <div style={{padding:'0.6rem 1.25rem',background:'#0f0a12',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap',flexShrink:0}}>
                    <div>
                      <div style={{display:'flex',alignItems:'center',gap:'0.75rem',flexWrap:'wrap'}}>
                        <h2 style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',margin:0}}>{selected}</h2>
                        {result?.overallSignal&&<SignalBadge signal={result.overallSignal}/>}
                        {result&&(
                          <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.95rem',color:pc}}>
                            ₹{result.currentPrice}
                            <span style={{fontSize:'0.72rem',marginLeft:'0.4rem'}}>{result.priceChangePct>=0?'▲':'▼'}{Math.abs(result.priceChangePct).toFixed(2)}%</span>
                          </span>
                        )}
                        {result&&<span style={{fontSize:'0.65rem',color:'#6b7f90'}}>{result.name}</span>}
                      </div>
                      {result&&<div style={{fontSize:'0.62rem',color:'#6b7f90',marginTop:'0.2rem'}}>{result.sector} • {result.industry} • NSE • {result.dataPoints} days data</div>}
                    </div>
                    <div style={{marginLeft:'auto',display:'flex',gap:'0.5rem'}}>
                      <button onClick={savePredictionToDb} disabled={!mlLoaded}
                        title={mlLoaded?'Save prediction':'Open the ML Prediction tab first'}
                        style={{background:mlLoaded?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.04)',border:`1px solid ${mlLoaded?'rgba(34,197,94,0.35)':'rgba(255,255,255,0.08)'}`,color:mlLoaded?'#22c55e':'#4a5a6a',padding:'0.35rem 0.85rem',borderRadius:7,cursor:mlLoaded?'pointer':'not-allowed',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.7rem'}}>
                        💾 Save
                      </button>
                      <button onClick={()=>runPrediction(selected)}
                        style={{background:'linear-gradient(135deg,#c41e3a,#ff2d55)',color:'#fff',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',padding:'0.35rem 0.85rem',borderRadius:7,border:'none',cursor:'pointer',fontSize:'0.7rem'}}>
                        🔄 Re-Run
                      </button>
                    </div>
                  </div>

                  {/* Sub tabs */}
                  <div style={{display:'flex',background:'#0f0a12',borderBottom:'1px solid rgba(255,255,255,0.05)',flexShrink:0,overflowX:'auto'}}>
                    {[['tv','📈 TradingView'],['price','📊 ML Chart'],['prediction','🤖 ML Prediction'],['agents','🧠 Multi-Agent'],['reddit','📰 Reddit'],['groq','📋 AI Report'],['indicators','🔬 Indicators'],['financials','💰 Financials'],['historical','🗂️ Historical'],['backtest','📊 Backtest']].map(([id,label])=>(
                      <button key={id} onClick={()=>setChartTab(id)}
                        style={{padding:'0.5rem 0.85rem',background:'transparent',border:'none',borderBottom:`2px solid ${chartTab===id?'#c41e3a':'transparent'}`,color:chartTab===id?'#c41e3a':'#6b7f90',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.7rem',whiteSpace:'nowrap',flexShrink:0}}>
                        {label}
                      </button>
                    ))}
                  </div>

                  {loading&&(
                    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem'}}>
                      <div style={{width:55,height:55,border:'3px solid rgba(196,30,58,0.2)',borderTopColor:'#c41e3a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                      <p style={{color:'#c41e3a',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1rem'}}>Loading {selected}...</p>
                      <div style={{color:'#6b7f90',fontSize:'0.78rem',textAlign:'center',lineHeight:2,background:'#120a14',padding:'1rem 1.5rem',borderRadius:10,border:'1px solid rgba(255,255,255,0.07)'}}>
                        📥 Fetching 5y OHLCV + financials from Yahoo<br/>
                        📊 Computing indicators + regime features<br/>
                        ⏳ Chart / Indicators / Financials ready in a few seconds<br/>
                        🤖 ML predictions load when you open the <strong style={{color:'#c41e3a'}}>ML Prediction</strong> tab
                      </div>
                    </div>
                  )}

                  {error&&!loading&&(
                    <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:'1.5rem 2rem',textAlign:'center',maxWidth:400}}>
                        <div style={{fontSize:'2rem',marginBottom:'0.75rem'}}>⚠️</div>
                        <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:'#ef4444',marginBottom:'0.5rem'}}>Error</div>
                        <div style={{fontSize:'0.8rem',color:'#8899aa',marginBottom:'1rem'}}>{error}</div>
                        <button onClick={()=>runPrediction(selected)} style={{background:'rgba(196,30,58,0.1)',border:'1px solid rgba(196,30,58,0.2)',color:'#c41e3a',padding:'0.5rem 1rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.78rem'}}>Retry</button>
                      </div>
                    </div>
                  )}

                  {!loading&&!error&&result&&(
                    <div style={{flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>

                      {/* ── TRADINGVIEW + RECHARTS SIDE BY SIDE ── */}
                      {chartTab==='tv'&&(
                        <div style={{flex:1,display:'grid',gridTemplateColumns:'1fr 1fr',overflow:'hidden',gap:0}}>

                          {/* LEFT: TradingView */}
                          <div style={{display:'flex',flexDirection:'column',overflow:'hidden',borderRight:'1px solid rgba(255,255,255,0.06)'}}>
                            <div style={{padding:'0.5rem 1rem',background:'#0f0a12',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                              <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem'}}>📈 TradingView Chart</span>
                              <span style={{background:'rgba(255,45,85,0.1)',color:'#ff2d55',padding:'0.1rem 0.45rem',borderRadius:4,fontSize:'0.6rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>LIVE</span>
                            </div>
                            <div style={{flex:1,minHeight:0}}><TVChart symbol={selected}/></div>
                          </div>

                          {/* RIGHT: Recharts ML Charts */}
                          <div style={{display:'flex',flexDirection:'column',overflow:'hidden'}}>
                            <div style={{padding:'0.5rem 1rem',background:'#0f0a12',borderBottom:'1px solid rgba(255,255,255,0.05)',display:'flex',alignItems:'center',gap:'0.5rem',flexShrink:0}}>
                              <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem'}}>📊 ML Charts (Real Data)</span>
                              <span style={{background:'rgba(196,30,58,0.1)',color:'#c41e3a',padding:'0.1rem 0.45rem',borderRadius:4,fontSize:'0.6rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>{result.dataPoints} days</span>
                            </div>
                            <div style={{flex:1,overflowY:'auto',padding:'0.75rem'}}>
                              {/* Price chart */}
                              <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'0.75rem',marginBottom:'0.75rem'}}>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                  <span>Price + MA20 + MA50</span>
                                  <SignalBadge signal={result.overallSignal}/>
                                </div>
                                <ResponsiveContainer width="100%" height={160}>
                                  <ComposedChart data={result.chartData}>
                                    <defs><linearGradient id="pg2" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={pc} stopOpacity={0.3}/><stop offset="100%" stopColor={pc} stopOpacity={0}/></linearGradient></defs>
                                    <CartesianGrid stroke="rgba(255,255,255,0.04)"/>
                                    <XAxis dataKey="date" tick={{fill:'#4a5a6a',fontSize:8}} tickLine={false} interval="preserveStartEnd"/>
                                    <YAxis tick={{fill:'#4a5a6a',fontSize:9}} tickLine={false} axisLine={false} width={55} tickFormatter={v=>'₹'+v.toFixed(0)}/>
                                    <Tooltip content={<ChartTip/>}/>
                                    <Area dataKey="close" name="Price" stroke={pc} strokeWidth={2} fill="url(#pg2)" dot={false}/>
                                    <Line dataKey="ma20" name="MA20" stroke="#ff2d55" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                                    <Line dataKey="ma50" name="MA50" stroke="#f0b429" strokeWidth={1.5} dot={false} strokeDasharray="6 3"/>
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>
                              {/* RSI */}
                              <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'0.75rem',marginBottom:'0.75rem'}}>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem',marginBottom:'0.5rem'}}>
                                  RSI(14): <span style={{color:result.indicators.rsi<30?'#22c55e':result.indicators.rsi>70?'#ef4444':'#f0b429'}}>{result.indicators.rsi}</span>
                                </div>
                                <ResponsiveContainer width="100%" height={90}>
                                  <LineChart data={result.chartData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.04)"/>
                                    <XAxis dataKey="date" tick={{fill:'#4a5a6a',fontSize:8}} tickLine={false} interval="preserveStartEnd"/>
                                    <YAxis domain={[0,100]} tick={{fill:'#4a5a6a',fontSize:9}} tickLine={false} axisLine={false} width={25}/>
                                    <Tooltip content={<ChartTip/>}/>
                                    <ReferenceLine y={70} stroke="rgba(239,68,68,0.4)" strokeDasharray="3 3"/>
                                    <ReferenceLine y={30} stroke="rgba(34,197,94,0.4)" strokeDasharray="3 3"/>
                                    <Line dataKey="rsi" name="RSI" stroke="#c41e3a" strokeWidth={1.5} dot={false}/>
                                  </LineChart>
                                </ResponsiveContainer>
                              </div>
                              {/* MACD */}
                              <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'0.75rem',marginBottom:'0.75rem'}}>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem',marginBottom:'0.5rem'}}>
                                  MACD: <span style={{color:result.indicators.macd>=0?'#22c55e':'#ef4444'}}>{result.indicators.macd.toFixed(3)}</span>
                                </div>
                                <ResponsiveContainer width="100%" height={90}>
                                  <ComposedChart data={result.chartData}>
                                    <CartesianGrid stroke="rgba(255,255,255,0.04)"/>
                                    <XAxis dataKey="date" tick={{fill:'#4a5a6a',fontSize:8}} tickLine={false} interval="preserveStartEnd"/>
                                    <YAxis tick={{fill:'#4a5a6a',fontSize:9}} tickLine={false} axisLine={false} width={30}/>
                                    <Tooltip content={<ChartTip/>}/>
                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)"/>
                                    <Bar dataKey="macd_hist" name="Hist" fill="rgba(255,45,85,0.4)" radius={[1,1,0,0]}/>
                                    <Line dataKey="macd" name="MACD" stroke="#ff2d55" strokeWidth={1.5} dot={false}/>
                                    <Line dataKey="macd_signal" name="Signal" stroke="#f0b429" strokeWidth={1} dot={false} strokeDasharray="3 2"/>
                                  </ComposedChart>
                                </ResponsiveContainer>
                              </div>
                              {/* Multi-timeframe quick signals */}
                              <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'0.75rem'}}>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem',marginBottom:'0.6rem',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                                  <span>ML Signals by Timeframe</span>
                                  {mlLoading&&<span style={{fontSize:'0.58rem',color:'#c41e3a'}}>training…</span>}
                                </div>
                                {(result.timeframePredictions||[]).length>0 ? (result.timeframePredictions||[]).map(tf=>(
                                  <div key={tf.timeframe} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.3rem 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                    <span style={{fontSize:'0.68rem',color:'#8899aa'}}>{tf.timeframe}</span>
                                    <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                                      <span style={{fontSize:'0.6rem',color:'#4a5a6a'}}>{tf.accuracy}% acc</span>
                                      <SignalBadge signal={tf.signal}/>
                                    </div>
                                  </div>
                                )) : (
                                  <button onClick={()=>setChartTab('prediction')}
                                    style={{width:'100%',background:'rgba(196,30,58,0.08)',border:'1px dashed rgba(196,30,58,0.25)',color:'#c41e3a',padding:'0.55rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.65rem'}}>
                                    🤖 Load ML Predictions →
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}



                      {/* ── ML PRICE CHART ── */}
                      {chartTab==='price'&&result.chartData&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>
                          <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'1.25rem',marginBottom:'1rem'}}>
                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'1rem',display:'flex',justifyContent:'space-between'}}>
                              <span>Real Price + MA20 + MA50 ({result.dataPoints} days)</span>
                              <span style={{fontSize:'0.65rem',color:'#6b7f90'}}>{result.dataStartDate} → {result.dataEndDate}</span>
                            </div>
                            <ResponsiveContainer width="100%" height={260}>
                              <ComposedChart data={result.chartData}>
                                <defs><linearGradient id="pg" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={pc} stopOpacity={0.3}/><stop offset="100%" stopColor={pc} stopOpacity={0}/></linearGradient></defs>
                                <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3"/>
                                <XAxis dataKey="date" tick={{fill:'#4a5a6a',fontSize:9}} tickLine={false} interval="preserveStartEnd"/>
                                <YAxis tick={{fill:'#4a5a6a',fontSize:10}} tickLine={false} axisLine={false} width={65} tickFormatter={v=>'₹'+v.toFixed(0)}/>
                                <Tooltip content={<ChartTip/>}/>
                                <Area dataKey="close" name="Price" stroke={pc} strokeWidth={2.5} fill="url(#pg)" dot={false}/>
                                <Line dataKey="ma20" name="MA 20" stroke="#ff2d55" strokeWidth={1.5} dot={false} strokeDasharray="5 3"/>
                                <Line dataKey="ma50" name="MA 50" stroke="#f0b429" strokeWidth={1.5} dot={false} strokeDasharray="8 4"/>
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                          {/* RSI */}
                          <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'1.25rem',marginBottom:'1rem'}}>
                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem',marginBottom:'0.75rem'}}>RSI(14) — Current: <span style={{color:result.indicators.rsi<30?'#22c55e':result.indicators.rsi>70?'#ef4444':'#f0b429'}}>{result.indicators.rsi}</span></div>
                            <ResponsiveContainer width="100%" height={130}>
                              <LineChart data={result.chartData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.04)"/>
                                <XAxis dataKey="date" tick={{fill:'#4a5a6a',fontSize:9}} tickLine={false} interval="preserveStartEnd"/>
                                <YAxis domain={[0,100]} tick={{fill:'#4a5a6a',fontSize:10}} tickLine={false} axisLine={false} width={28}/>
                                <Tooltip content={<ChartTip/>}/>
                                <ReferenceLine y={70} stroke="rgba(239,68,68,0.4)" strokeDasharray="4 4"/>
                                <ReferenceLine y={30} stroke="rgba(34,197,94,0.4)" strokeDasharray="4 4"/>
                                <Line dataKey="rsi" name="RSI" stroke="#c41e3a" strokeWidth={2} dot={false}/>
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                          {/* MACD */}
                          <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'1.25rem'}}>
                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem',marginBottom:'0.75rem'}}>MACD(12,26,9) — Current: <span style={{color:result.indicators.macd>=0?'#22c55e':'#ef4444'}}>{result.indicators.macd.toFixed(3)}</span></div>
                            <ResponsiveContainer width="100%" height={130}>
                              <ComposedChart data={result.chartData}>
                                <CartesianGrid stroke="rgba(255,255,255,0.04)"/>
                                <XAxis dataKey="date" tick={{fill:'#4a5a6a',fontSize:9}} tickLine={false} interval="preserveStartEnd"/>
                                <YAxis tick={{fill:'#4a5a6a',fontSize:10}} tickLine={false} axisLine={false} width={40}/>
                                <Tooltip content={<ChartTip/>}/>
                                <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)"/>
                                <Bar dataKey="macd_hist" name="Hist" fill="rgba(255,45,85,0.4)" radius={[1,1,0,0]}/>
                                <Line dataKey="macd" name="MACD" stroke="#ff2d55" strokeWidth={2} dot={false}/>
                                <Line dataKey="macd_signal" name="Signal" stroke="#f0b429" strokeWidth={1.5} dot={false} strokeDasharray="4 2"/>
                              </ComposedChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )}

                      {/* ── ML PREDICTION TAB ── */}
                      {chartTab==='prediction'&&mlLoading&&(
                        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:'1rem',padding:'2rem'}}>
                          <div style={{width:55,height:55,border:'3px solid rgba(196,30,58,0.2)',borderTopColor:'#c41e3a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                          <p style={{color:'#c41e3a',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1rem'}}>Training stacked ensemble for {selected}...</p>
                          <div style={{color:'#6b7f90',fontSize:'0.78rem',textAlign:'center',lineHeight:2,background:'#120a14',padding:'1rem 1.5rem',borderRadius:10,border:'1px solid rgba(255,255,255,0.07)',maxWidth:560}}>
                            🌲 RF + GBM + ExtraTrees → LogReg meta (5-fold walk-forward)<br/>
                            🧠 Log-return Bidirectional LSTM (3 layers, 60-epoch early-stop)<br/>
                            📅 Per-timeframe models: Tomorrow / Week / Month / 3M / Year<br/>
                            ⏳ First run: ~60–180s • Reruns: instant (models cached to disk)
                          </div>
                        </div>
                      )}
                      {chartTab==='prediction'&&!mlLoading&&mlError&&(
                        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'2rem'}}>
                          <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:'1.5rem 2rem',textAlign:'center',maxWidth:420}}>
                            <div style={{fontSize:'2rem',marginBottom:'0.75rem'}}>⚠️</div>
                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:'#ef4444',marginBottom:'0.5rem'}}>ML prediction error</div>
                            <div style={{fontSize:'0.8rem',color:'#8899aa',marginBottom:'1rem'}}>{mlError}</div>
                            <button onClick={()=>loadMl(selected)} style={{background:'rgba(196,30,58,0.1)',border:'1px solid rgba(196,30,58,0.2)',color:'#c41e3a',padding:'0.5rem 1rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.78rem'}}>Retry</button>
                          </div>
                        </div>
                      )}
                      {chartTab==='prediction'&&!mlLoading&&!mlError&&mlLoaded&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>

                          {/* Overall signal banner */}
                          <div style={{background:'linear-gradient(135deg,rgba(196,30,58,0.1),rgba(255,45,85,0.05))',border:'1px solid rgba(196,30,58,0.25)',borderRadius:14,padding:'1.5rem',textAlign:'center',marginBottom:'1.5rem',display:'flex',alignItems:'center',justifyContent:'space-around',flexWrap:'wrap',gap:'1rem'}}>
                            <div>
                              <div style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,textTransform:'uppercase',marginBottom:'0.5rem'}}>Overall Recommendation</div>
                              <SignalBadge signal={result.overallSignal} size="xl"/>
                            </div>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'2rem',color:'#ff2d55'}}>₹{result.currentPrice}</div>
                              <div style={{fontSize:'0.8rem',color:pc,fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>{result.priceChangePct>=0?'▲':'▼'} {Math.abs(result.priceChangePct).toFixed(2)}% today</div>
                            </div>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,marginBottom:'0.3rem'}}>Based on {result.dataPoints} days real data</div>
                              <div style={{fontSize:'0.65rem',color:'#4a5a6a'}}>Model saved — accuracy never changes</div>
                            </div>
                          </div>

                          {/* Multi-timeframe predictions */}
                          <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.9rem',marginBottom:'1rem'}}>📅 Predictions by Timeframe</div>
                          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
                            {(result.timeframePredictions||[]).map((tf,i)=>{
                              const pf = result.priceForecastsByTimeframe
                              const key = ['tomorrow','next_week','next_month','next_3m','next_year'][i]
                              const pfData = pf?.[key]
                              return(
                                <div key={tf.timeframe} style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1.1rem',textAlign:'center'}}>
                                  <div style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,textTransform:'uppercase',marginBottom:'0.5rem'}}>{tf.timeframe}</div>
                                  <SignalBadge signal={tf.signal} size="sm"/>
                                  <div style={{margin:'0.5rem 0'}}>
                                    <AccGauge value={tf.accuracy}/>
                                  </div>
                                  {pfData&&(
                                    <div>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.9rem',color:'#ff2d55'}}>₹{pfData.price}</div>
                                      <div style={{fontSize:'0.7rem',color:pfData.changePercent>=0?'#22c55e':'#ef4444',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>
                                        {pfData.changePercent>=0?'▲':'▼'} {Math.abs(pfData.changePercent).toFixed(1)}%
                                      </div>
                                    </div>
                                  )}
                                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0.2rem',marginTop:'0.5rem',fontSize:'0.6rem'}}>
                                    <div style={{color:'#22c55e'}}>B:{tf.buyProb}%</div>
                                    <div style={{color:'#f0b429'}}>H:{tf.holdProb}%</div>
                                    <div style={{color:'#ef4444'}}>S:{tf.sellProb}%</div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {/* 30-day price forecast chart with bull/bear bands */}
                          {result.forecast?.length>0&&(
                            <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1.25rem',marginBottom:'1rem'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'0.5rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                <span>📈 30-Day Price Forecast with Confidence Bands</span>
                                <div style={{display:'flex',gap:'0.75rem',fontSize:'0.6rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif'}}>
                                  <span><span style={{display:'inline-block',width:10,height:3,background:'#c41e3a',borderRadius:1,marginRight:3}}/>Base</span>
                                  <span><span style={{display:'inline-block',width:10,height:3,background:'#22c55e',borderRadius:1,marginRight:3}}/>Bull (75th)</span>
                                  <span><span style={{display:'inline-block',width:10,height:3,background:'#ef4444',borderRadius:1,marginRight:3}}/>Bear (25th)</span>
                                </div>
                              </div>
                              <div style={{fontSize:'0.65rem',color:'#4a5a6a',marginBottom:'0.75rem',fontFamily:'Space Grotesk,sans-serif'}}>
                                Drift-based forecast · GARCH volatility bands · Mega-ensemble calibrated
                              </div>
                              <ResponsiveContainer width="100%" height={240}>
                                <ComposedChart data={result.forecast.slice(0,30)}>
                                  <defs>
                                    <linearGradient id="fg_base" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#c41e3a" stopOpacity={0.25}/><stop offset="100%" stopColor="#c41e3a" stopOpacity={0.02}/></linearGradient>
                                    <linearGradient id="fg_bull" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#22c55e" stopOpacity={0.12}/><stop offset="100%" stopColor="#22c55e" stopOpacity={0}/></linearGradient>
                                    <linearGradient id="fg_bear" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#ef4444" stopOpacity={0.12}/><stop offset="100%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                                  </defs>
                                  <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3"/>
                                  <XAxis dataKey="date" tick={{fill:'#6b7f90',fontSize:10}} tickLine={false} interval={4}/>
                                  <YAxis tick={{fill:'#6b7f90',fontSize:10}} tickLine={false} axisLine={false} width={65}
                                    domain={[d => { const prices = result.forecast.slice(0,30).map(f=>f.bear||f.price); return Math.min(...prices)*0.995 },
                                             d => { const prices = result.forecast.slice(0,30).map(f=>f.bull||f.price); return Math.max(...prices)*1.005 }]}
                                    tickFormatter={v=>'₹'+v?.toFixed(0)}/>
                                  <Tooltip content={({active,payload,label})=>{
                                    if(!active||!payload?.length) return null
                                    return(
                                      <div style={{background:'rgba(4,8,16,0.97)',border:'1px solid rgba(196,30,58,0.2)',borderRadius:8,padding:'0.6rem 0.9rem',fontSize:'0.72rem'}}>
                                        <div style={{color:'#6b7f90',marginBottom:'0.3rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>{label}</div>
                                        {payload.map(p=><div key={p.dataKey} style={{color:p.color||'#e8edf2',marginBottom:'0.1rem'}}>{p.name}: <strong>₹{parseFloat(p.value).toFixed(2)}</strong></div>)}
                                      </div>
                                    )
                                  }}/>
                                  <ReferenceLine y={result.currentPrice} stroke="rgba(255,255,255,0.15)" strokeDasharray="4 4" label={{value:'Current',fill:'#4a5a6a',fontSize:9,position:'right'}}/>
                                  <Area dataKey="bull" name="Bull (75th)" stroke="#22c55e" strokeWidth={1.5} fill="url(#fg_bull)" dot={false} strokeDasharray="4 2"/>
                                  <Area dataKey="bear" name="Bear (25th)" stroke="#ef4444" strokeWidth={1.5} fill="url(#fg_bear)" dot={false} strokeDasharray="4 2"/>
                                  <Area dataKey="price" name="Base Forecast" stroke="#c41e3a" strokeWidth={2.5} fill="url(#fg_base)" dot={false}/>
                                </ComposedChart>
                              </ResponsiveContainer>
                              {/* Timeframe milestone markers */}
                              {result.priceForecastsByTimeframe && (
                                <div style={{display:'flex',gap:'0.5rem',marginTop:'0.75rem',flexWrap:'wrap',justifyContent:'center'}}>
                                  {[['tomorrow','Tomorrow'],['next_week','1 Week'],['next_month','1 Month'],['next_3m','3 Months'],['next_year','1 Year']].map(([key,label])=>{
                                    const pf = result.priceForecastsByTimeframe[key]
                                    if (!pf) return null
                                    const up = pf.changePercent >= 0
                                    return(
                                      <div key={key} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:8,padding:'0.4rem 0.65rem',textAlign:'center',minWidth:75}}>
                                        <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,marginBottom:'0.15rem'}}>{label}</div>
                                        <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.78rem',color:up?'#22c55e':'#ef4444'}}>₹{pf.price}</div>
                                        <div style={{fontSize:'0.6rem',color:up?'#22c55e':'#ef4444',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>{up?'▲':'▼'}{Math.abs(pf.changePercent).toFixed(1)}%</div>
                                        {pf.bullTarget && <div style={{fontSize:'0.5rem',color:'#4a5a6a',marginTop:'0.1rem'}}>Bull: ₹{pf.bullTarget} · Bear: ₹{pf.bearTarget}</div>}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Indicator vote summary */}
                          <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1.25rem',marginBottom:'1rem'}}>
                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'0.75rem'}}>Indicator Vote Count</div>
                            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'1rem',textAlign:'center'}}>
                              {[['BUY',result.buyVotes,'#22c55e'],['HOLD',result.holdVotes,'#f0b429'],['SELL',result.sellVotes,'#ef4444']].map(([s,v,c])=>(
                                <div key={s} style={{background:`${c}10`,border:`1px solid ${c}25`,borderRadius:10,padding:'1rem'}}>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.8rem',color:c}}>{v}</div>
                                  <div style={{fontSize:'0.7rem',color:'#8899aa',marginTop:'0.25rem'}}>{s} signals</div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* ── INTELLIGENCE PANEL ─────────────────────────── */}
                          {result.intelligence && (
                            <div style={{marginBottom:'1rem'}}>

                              {/* Section header */}
                              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.75rem'}}>
                                <span style={{fontSize:'1rem'}}>🧠</span>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',color:'#e8edf2'}}>Intelligence Layer</div>
                                <div style={{flex:1,height:'1px',background:'rgba(255,255,255,0.07)'}}/>
                                <div style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif'}}>
                                  7-Source Blend
                                </div>
                              </div>

                              {/* Alpha summary bar */}
                              {(() => {
                                const intel = result.intelligence
                                const total = intel.totalIntelAlphaPct || 0
                                const color = total >= 0 ? '#22c55e' : '#ef4444'
                                return (
                                  <div style={{background:'#120a14',border:`1px solid ${color}25`,borderRadius:10,padding:'0.85rem 1rem',marginBottom:'0.75rem',display:'flex',flexWrap:'wrap',gap:'0.75rem',alignItems:'center'}}>
                                    <div style={{flex:'1 1 auto'}}>
                                      <div style={{fontSize:'0.6rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,textTransform:'uppercase',marginBottom:'0.2rem'}}>Total Intelligence Alpha</div>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.2rem',color}}>{total >= 0 ? '+' : ''}{total?.toFixed(2)}%/yr</div>
                                      <div style={{fontSize:'0.62rem',color:'#6b7f90',marginTop:'0.1rem'}}>Adjusted momentum: <strong style={{color:'#e8edf2'}}>{intel.muBasePct >= 0 ? '+' : ''}{intel.muBasePct?.toFixed(1)}%/yr</strong></div>
                                    </div>
                                    <div style={{display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
                                      {[
                                        {label:'Fundamental',val:intel.fundAlphaPct,icon:'📊'},
                                        {label:'News',val:intel.newsAlphaPct,icon:'📰'},
                                        {label:'FII/DII',val:intel.fiiAlphaPct,icon:'🏛️'},
                                        {label:'Macro',val:intel.macroAlphaPct,icon:'🌍'},
                                        {label:'Options',val:intel.optionsAlphaPct,icon:'📋'},
                                        {label:'Earnings',val:intel.earningsAlphaPct,icon:'💹'},
                                        {label:'Reddit',val:intel.redditAlphaPct,icon:'🔥'},
                                      ].filter(({val})=> val != null && val !== undefined).map(({label,val,icon})=>{
                                        const c2 = val >= 0 ? '#22c55e' : '#ef4444'
                                        return (
                                          <div key={label} style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.07)',borderRadius:8,padding:'0.4rem 0.7rem',textAlign:'center',minWidth:70}}>
                                            <div style={{fontSize:'0.75rem',marginBottom:'0.1rem'}}>{icon}</div>
                                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:c2}}>{val >= 0 ? '+' : ''}{val?.toFixed(2)}%</div>
                                            <div style={{fontSize:'0.55rem',color:'#6b7f90'}}>{label}</div>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })()}

                              {/* 3-column grid: Fundamentals | News | FII/DII */}
                              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:'0.75rem',marginBottom:'0.75rem'}}>

                                {/* ── Fundamentals ── */}
                                {result.intelligence.fundamentals && Object.keys(result.intelligence.fundamentals).length > 0 && (
                                  <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'0.85rem'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:'#e8edf2',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                      📊 Fundamentals
                                      {result.intelligence.fundamentals.sector && (
                                        <span style={{fontSize:'0.55rem',color:'#6b7f90',background:'rgba(255,255,255,0.05)',padding:'0.1rem 0.4rem',borderRadius:4}}>
                                          {result.intelligence.fundamentals.sector}
                                        </span>
                                      )}
                                    </div>
                                    <div style={{display:'flex',flexDirection:'column',gap:'0.35rem'}}>
                                      {[
                                        {label:'P/E Ratio', val: result.intelligence.fundamentals.pe_ratio, fmt: v => v?.toFixed(1)+'x'},
                                        {label:'Fwd P/E',   val: result.intelligence.fundamentals.fwd_pe,   fmt: v => v?.toFixed(1)+'x'},
                                        {label:'EPS Growth',val: result.intelligence.fundamentals.eps_growth,fmt: v => v != null ? `${(v*100).toFixed(1)}%` : null, isPct:true},
                                        {label:'Rev Growth', val: result.intelligence.fundamentals.rev_growth, fmt: v => v != null ? `${(v*100).toFixed(1)}%` : null, isPct:true},
                                        {label:'Net Margin', val: result.intelligence.fundamentals.profit_margin, fmt: v => v != null ? `${(v*100).toFixed(1)}%` : null},
                                        {label:'ROE',       val: result.intelligence.fundamentals.roe,       fmt: v => v != null ? `${(v*100).toFixed(1)}%` : null, isPct:true},
                                        {label:'Debt/Equity',val:result.intelligence.fundamentals.de_ratio,  fmt: v => v?.toFixed(2)},
                                        {label:'Market Cap', val: result.intelligence.fundamentals.market_cap,fmt: v => {
                                          if(!v) return null
                                          if(v>=1e12) return `₹${(v/1e12).toFixed(1)}T`
                                          if(v>=1e9) return `₹${(v/1e9).toFixed(1)}B`
                                          if(v>=1e7) return `₹${(v/1e7).toFixed(1)}Cr`
                                          return `₹${v}`
                                        }},
                                      ].filter(r => r.val != null && r.val !== 'N/A').map(({label,val,fmt,isPct}) => {
                                        const display = fmt ? fmt(val) : val
                                        if(!display) return null
                                        const isPositive = isPct && val > 0
                                        const isNegative = isPct && val < 0
                                        return (
                                          <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                            <span style={{fontSize:'0.65rem',color:'#6b7f90'}}>{label}</span>
                                            <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.68rem',color: isPositive?'#22c55e':isNegative?'#ef4444':'#e8edf2'}}>{display}</span>
                                          </div>
                                        )
                                      })}
                                      <div style={{marginTop:'0.25rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between'}}>
                                        <span style={{fontSize:'0.6rem',color:'#6b7f90'}}>Fund. Alpha</span>
                                        <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.68rem',color: result.intelligence.fundAlphaPct >= 0?'#22c55e':'#ef4444'}}>
                                          {result.intelligence.fundAlphaPct >= 0?'+':''}{result.intelligence.fundAlphaPct?.toFixed(2)}%/yr
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* ── News Sentiment ── */}
                                <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'0.85rem'}}>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:'#e8edf2',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                    📰 News Sentiment
                                    {result.intelligence.newsSentiment != null && (
                                      <span style={{
                                        fontSize:'0.6rem',fontWeight:800,
                                        color: result.intelligence.newsSentiment > 0.1 ? '#22c55e' : result.intelligence.newsSentiment < -0.1 ? '#ef4444' : '#f0b429',
                                        background: result.intelligence.newsSentiment > 0.1 ? 'rgba(34,197,94,0.1)' : result.intelligence.newsSentiment < -0.1 ? 'rgba(239,68,68,0.1)' : 'rgba(240,180,41,0.1)',
                                        padding:'0.1rem 0.4rem',borderRadius:4
                                      }}>
                                        {result.intelligence.newsSentiment > 0.1 ? '▲ POSITIVE' : result.intelligence.newsSentiment < -0.1 ? '▼ NEGATIVE' : '● NEUTRAL'}
                                      </span>
                                    )}
                                  </div>
                                  {result.intelligence.newsSentiment != null && (
                                    <div style={{marginBottom:'0.5rem'}}>
                                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}>
                                        <span style={{fontSize:'0.62rem',color:'#6b7f90'}}>Composite Score</span>
                                        <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.7rem',
                                          color: result.intelligence.newsSentiment > 0.1?'#22c55e':result.intelligence.newsSentiment < -0.1?'#ef4444':'#f0b429'}}>
                                          {result.intelligence.newsSentiment?.toFixed(3)}
                                        </span>
                                      </div>
                                      <div style={{height:4,background:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden'}}>
                                        <div style={{
                                          height:'100%',borderRadius:2,
                                          width: `${Math.abs(result.intelligence.newsSentiment)*100}%`,
                                          marginLeft: result.intelligence.newsSentiment < 0 ? `${(1+result.intelligence.newsSentiment)*100}%` : '50%',
                                          background: result.intelligence.newsSentiment > 0 ? '#22c55e' : '#ef4444',
                                        }}/>
                                      </div>
                                    </div>
                                  )}
                                  <div style={{display:'flex',flexDirection:'column',gap:'0.3rem',maxHeight:160,overflowY:'auto'}}>
                                    {(result.intelligence.newsItems||[]).map((item,i)=>(
                                      <div key={i} style={{background:'rgba(255,255,255,0.03)',borderRadius:6,padding:'0.35rem 0.5rem',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.5rem'}}>
                                        <span style={{fontSize:'0.6rem',color:'#8899aa',lineHeight:1.4,flex:1}}>{item.title?.slice(0,80)}{item.title?.length>80?'…':''}</span>
                                        <span style={{
                                          fontSize:'0.58rem',fontWeight:800,fontFamily:'Space Grotesk,sans-serif',flexShrink:0,
                                          color: item.score > 0.05?'#22c55e':item.score < -0.05?'#ef4444':'#f0b429'
                                        }}>{item.score?.toFixed(2)}</span>
                                      </div>
                                    ))}
                                    {(result.intelligence.newsItems||[]).length === 0 && (
                                      <div style={{fontSize:'0.63rem',color:'#6b7f90',textAlign:'center',padding:'1rem 0'}}>No recent news found</div>
                                    )}
                                  </div>
                                </div>

                                {/* ── FII/DII Flows ── */}
                                <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'0.85rem'}}>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:'#e8edf2',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                    🏛️ FII/DII Flows
                                    <span style={{fontSize:'0.55rem',color:'#6b7f90',background:'rgba(255,255,255,0.05)',padding:'0.1rem 0.4rem',borderRadius:4}}>
                                      {result.intelligence.fiiDiiFlows?.source === 'nse' ? 'Live NSE' : 'No data'}
                                    </span>
                                  </div>
                                  {(() => {
                                    const fii = result.intelligence.fiiDiiFlows || {}
                                    const fiiNet = fii.fii_5d_net_cr || 0
                                    const diiNet = fii.dii_5d_net_cr || 0
                                    const combined = fii.combined_5d || 0
                                    const fiiColor = fiiNet >= 0 ? '#22c55e' : '#ef4444'
                                    const diiColor = diiNet >= 0 ? '#22c55e' : '#ef4444'
                                    const combColor = combined >= 0 ? '#22c55e' : '#ef4444'
                                    const fmtCr = v => {
                                      const abs = Math.abs(v)
                                      const sign = v >= 0 ? '+' : '-'
                                      if(abs >= 10000) return `${sign}₹${(abs/1000).toFixed(1)}K Cr`
                                      return `${sign}₹${abs.toFixed(0)} Cr`
                                    }
                                    return (
                                      <div style={{display:'flex',flexDirection:'column',gap:'0.5rem'}}>
                                        {fii.latest_date && (
                                          <div style={{fontSize:'0.58rem',color:'#6b7f90',marginBottom:'0.1rem'}}>
                                            📅 As of {fii.latest_date}
                                          </div>
                                        )}
                                        {[
                                          {label:'FII/FPI Net', val:fiiNet, color:fiiColor},
                                          {label:'DII Net',     val:diiNet, color:diiColor},
                                          {label:'Combined',    val:combined, color:combColor},
                                        ].map(({label,val,color})=>(
                                          <div key={label}>
                                            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.2rem'}}>
                                              <span style={{fontSize:'0.63rem',color:'#6b7f90'}}>{label}</span>
                                              <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.7rem',color}}>{fmtCr(val)}</span>
                                            </div>
                                            <div style={{height:4,background:'rgba(255,255,255,0.07)',borderRadius:2,overflow:'hidden'}}>
                                              <div style={{height:'100%',borderRadius:2,width:`${Math.min(Math.abs(val)/20000*100,100)}%`,background:color,opacity:0.8}}/>
                                            </div>
                                          </div>
                                        ))}
                                        {result.intelligence.fiiDiiFlows?.source !== 'nse' && (
                                          <div style={{fontSize:'0.6rem',color:'#6b7f90',textAlign:'center',marginTop:'0.25rem'}}>
                                            NSE API unavailable — using neutral signal
                                          </div>
                                        )}
                                        <div style={{marginTop:'0.25rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between'}}>
                                          <span style={{fontSize:'0.6rem',color:'#6b7f90'}}>FII Alpha</span>
                                          <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.68rem',
                                            color:result.intelligence.fiiAlphaPct>=0?'#22c55e':'#ef4444'}}>
                                            {result.intelligence.fiiAlphaPct>=0?'+':''}{result.intelligence.fiiAlphaPct?.toFixed(2)}%/yr
                                          </span>
                                        </div>
                                      </div>
                                    )
                                  })()}
                                </div>

                                {/* ── Macro Indicators ── */}
                                {result.intelligence.macroData && result.intelligence.macroData.macro_alpha != null && (
                                  <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'0.85rem'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:'#e8edf2',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                      🌍 Macro Indicators
                                      <span style={{
                                        fontSize:'0.55rem',fontWeight:800,
                                        color: result.intelligence.macroData.macro_label === 'Bullish' ? '#22c55e' : result.intelligence.macroData.macro_label === 'Bearish' ? '#ef4444' : '#f0b429',
                                        background: result.intelligence.macroData.macro_label === 'Bullish' ? 'rgba(34,197,94,0.1)' : result.intelligence.macroData.macro_label === 'Bearish' ? 'rgba(239,68,68,0.1)' : 'rgba(240,180,41,0.1)',
                                        padding:'0.1rem 0.4rem',borderRadius:4
                                      }}>
                                        {result.intelligence.macroData.macro_label || 'Neutral'}
                                      </span>
                                    </div>
                                    <div style={{display:'flex',flexDirection:'column',gap:'0.35rem'}}>
                                      {(() => {
                                        const md = result.intelligence.macroData
                                        const signals = md.signals || {}
                                        const items = [
                                          {label:'India VIX', val: md.india_vix?.value, fmt: v => v?.toFixed(1), extra: signals.vix?.label},
                                          {label:'Nifty 50', val: md.nifty50?.value, fmt: v => v?.toFixed(0), extra: signals.market_trend?.label},
                                          {label:'USD/INR', val: md.usdinr?.value, fmt: v => '₹'+v?.toFixed(2), extra: signals.currency?.label},
                                          {label:'Crude Oil', val: md.crude_oil?.value, fmt: v => '$'+v?.toFixed(1), extra: signals.crude?.label},
                                          {label:'RBI Rate', val: md.static?.rbi_repo_rate, fmt: v => v+'%', extra: signals.monetary?.label},
                                          {label:'CPI', val: md.static?.cpi_inflation, fmt: v => v+'%', extra: signals.inflation?.label},
                                        ]
                                        return items.filter(r => r.val != null).map(({label, val, fmt, extra}) => {
                                          const display = fmt ? fmt(val) : val
                                          return (
                                            <div key={label}>
                                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                                <span style={{fontSize:'0.63rem',color:'#6b7f90'}}>{label}</span>
                                                <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.68rem',color:'#e8edf2'}}>{display}</span>
                                              </div>
                                              {extra && <div style={{fontSize:'0.52rem',color:'#4a5a6a',marginTop:'0.05rem'}}>{extra}</div>}
                                            </div>
                                          )
                                        })
                                      })()}
                                      <div style={{marginTop:'0.25rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between'}}>
                                        <span style={{fontSize:'0.6rem',color:'#6b7f90'}}>Macro Alpha</span>
                                        <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.68rem',
                                          color:result.intelligence.macroAlphaPct>=0?'#22c55e':'#ef4444'}}>
                                          {result.intelligence.macroAlphaPct>=0?'+':''}{result.intelligence.macroAlphaPct?.toFixed(2)}%/yr
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {/* ── Options Flow ── */}
                                {result.intelligence.optionsData && result.intelligence.optionsData.available && (
                                  <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'0.85rem'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:'#e8edf2',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                      📋 Options Flow
                                      <span style={{
                                        fontSize:'0.55rem',fontWeight:800,
                                        color: result.intelligence.optionsData.options_label === 'Bullish' ? '#22c55e' : result.intelligence.optionsData.options_label === 'Bearish' ? '#ef4444' : '#f0b429',
                                        background: result.intelligence.optionsData.options_label === 'Bullish' ? 'rgba(34,197,94,0.1)' : result.intelligence.optionsData.options_label === 'Bearish' ? 'rgba(239,68,68,0.1)' : 'rgba(240,180,41,0.1)',
                                        padding:'0.1rem 0.4rem',borderRadius:4
                                      }}>
                                        {result.intelligence.optionsData.options_label || 'Neutral'}
                                      </span>
                                      {result.intelligence.optionsData.nearest_expiry && (
                                        <span style={{fontSize:'0.5rem',color:'#4a5a6a',marginLeft:'auto'}}>
                                          Exp: {result.intelligence.optionsData.nearest_expiry}
                                        </span>
                                      )}
                                    </div>
                                    {(() => {
                                      const od = result.intelligence.optionsData
                                      const pcrColor = od.pcr_oi > 1.2 ? '#22c55e' : od.pcr_oi < 0.7 ? '#ef4444' : '#f0b429'
                                      return (
                                        <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                                          {/* PCR Gauge */}
                                          <div style={{textAlign:'center',padding:'0.4rem 0'}}>
                                            <div style={{fontSize:'0.55rem',color:'#6b7f90',textTransform:'uppercase',fontWeight:600,marginBottom:'0.2rem'}}>Put/Call Ratio (OI)</div>
                                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.3rem',color:pcrColor}}>{od.pcr_oi?.toFixed(2)}</div>
                                            <div style={{fontSize:'0.52rem',color:'#4a5a6a',marginTop:'0.1rem'}}>
                                              {od.pcr_oi > 1.5 ? 'Strong put writing — Bullish' : od.pcr_oi > 1.2 ? 'Elevated — Moderately Bullish' : od.pcr_oi < 0.5 ? 'Heavy call buying — Bearish' : od.pcr_oi < 0.7 ? 'Below normal — Slightly Bearish' : 'Normal range'}
                                            </div>
                                          </div>
                                          {/* Key metrics */}
                                          {[
                                            {label:'Max Pain', val: od.max_pain, fmt: v => '₹'+v?.toFixed(0)},
                                            {label:'Call OI', val: od.total_call_oi, fmt: v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v},
                                            {label:'Put OI', val: od.total_put_oi, fmt: v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(0)+'K' : v},
                                            {label:'PCR (Vol)', val: od.pcr_volume, fmt: v => v?.toFixed(2)},
                                            {label:'Avg IV', val: od.avg_iv, fmt: v => v?.toFixed(1)+'%'},
                                          ].filter(r => r.val != null && r.val > 0).map(({label, val, fmt}) => (
                                            <div key={label} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                              <span style={{fontSize:'0.63rem',color:'#6b7f90'}}>{label}</span>
                                              <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.68rem',color:'#e8edf2'}}>{fmt(val)}</span>
                                            </div>
                                          ))}
                                          {/* Support / Resistance */}
                                          {(od.support_levels?.length > 0 || od.resistance_levels?.length > 0) && (
                                            <div style={{marginTop:'0.15rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                                              {od.support_levels?.length > 0 && (
                                                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.15rem'}}>
                                                  <span style={{fontSize:'0.58rem',color:'#22c55e'}}>Support</span>
                                                  <span style={{fontSize:'0.58rem',color:'#22c55e',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>
                                                    {od.support_levels.slice(0,3).map(s => '₹'+s).join(' · ')}
                                                  </span>
                                                </div>
                                              )}
                                              {od.resistance_levels?.length > 0 && (
                                                <div style={{display:'flex',justifyContent:'space-between'}}>
                                                  <span style={{fontSize:'0.58rem',color:'#ef4444'}}>Resistance</span>
                                                  <span style={{fontSize:'0.58rem',color:'#ef4444',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>
                                                    {od.resistance_levels.slice(0,3).map(s => '₹'+s).join(' · ')}
                                                  </span>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          {/* Signals */}
                                          {od.signals?.length > 0 && (
                                            <div style={{marginTop:'0.15rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                                              {od.signals.map((sig, i) => (
                                                <div key={i} style={{fontSize:'0.52rem',color:'#6b7f90',marginBottom:'0.15rem',lineHeight:1.4}}>• {sig}</div>
                                              ))}
                                            </div>
                                          )}
                                          <div style={{marginTop:'0.25rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between'}}>
                                            <span style={{fontSize:'0.6rem',color:'#6b7f90'}}>Options Alpha</span>
                                            <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.68rem',
                                              color:result.intelligence.optionsAlphaPct>=0?'#22c55e':'#ef4444'}}>
                                              {result.intelligence.optionsAlphaPct>=0?'+':''}{result.intelligence.optionsAlphaPct?.toFixed(2)}%/yr
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                )}

                                {/* ── Earnings Intelligence ── */}
                                {result.intelligence.earningsData && result.intelligence.earningsData.available && (
                                  <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'0.85rem'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:'#e8edf2',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                      💹 Earnings Intelligence
                                      <span style={{
                                        fontSize:'0.55rem',fontWeight:800,
                                        color: result.intelligence.earningsData.earnings_label === 'Bullish' ? '#22c55e' : result.intelligence.earningsData.earnings_label === 'Bearish' ? '#ef4444' : '#f0b429',
                                        background: result.intelligence.earningsData.earnings_label === 'Bullish' ? 'rgba(34,197,94,0.1)' : result.intelligence.earningsData.earnings_label === 'Bearish' ? 'rgba(239,68,68,0.1)' : 'rgba(240,180,41,0.1)',
                                        padding:'0.1rem 0.4rem',borderRadius:4
                                      }}>
                                        {result.intelligence.earningsData.earnings_label || 'Neutral'}
                                      </span>
                                    </div>
                                    {(() => {
                                      const ed = result.intelligence.earningsData
                                      return (
                                        <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                                          {/* Next earnings date */}
                                          {ed.next_earnings_date && (
                                            <div style={{background:'rgba(139,92,246,0.08)',border:'1px solid rgba(139,92,246,0.15)',borderRadius:8,padding:'0.5rem 0.65rem',textAlign:'center'}}>
                                              <div style={{fontSize:'0.55rem',color:'#8b5cf6',textTransform:'uppercase',fontWeight:700,marginBottom:'0.15rem'}}>Next Earnings</div>
                                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.9rem',color:'#e8edf2'}}>{ed.next_earnings_date}</div>
                                              {ed.days_to_earnings != null && (
                                                <div style={{fontSize:'0.6rem',color: ed.days_to_earnings <= 7 ? '#f0b429' : '#6b7f90',marginTop:'0.1rem',fontWeight:600}}>
                                                  {ed.days_to_earnings === 0 ? '⚡ TODAY' : `${ed.days_to_earnings} days away`}
                                                  {ed.days_to_earnings <= 7 && ed.days_to_earnings > 0 && ' ⚠️'}
                                                </div>
                                              )}
                                            </div>
                                          )}
                                          {/* Volatility multiplier */}
                                          {result.intelligence.earningsVolMult > 1.0 && (
                                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'rgba(240,180,41,0.06)',border:'1px solid rgba(240,180,41,0.12)',borderRadius:6,padding:'0.3rem 0.5rem'}}>
                                              <span style={{fontSize:'0.6rem',color:'#f0b429'}}>⚡ Vol Multiplier</span>
                                              <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.75rem',color:'#f0b429'}}>{result.intelligence.earningsVolMult}x</span>
                                            </div>
                                          )}
                                          {/* Growth trend */}
                                          {ed.earnings_growth_trend && ed.earnings_growth_trend !== 'unknown' && ed.earnings_growth_trend !== 'insufficient_data' && (
                                            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                                              <span style={{fontSize:'0.63rem',color:'#6b7f90'}}>Growth Trend</span>
                                              <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.68rem',
                                                color: ed.earnings_growth_trend === 'accelerating' ? '#22c55e' : ed.earnings_growth_trend === 'decelerating' ? '#ef4444' : '#f0b429'}}>
                                                {ed.earnings_growth_trend === 'accelerating' ? '📈 Accelerating' : ed.earnings_growth_trend === 'decelerating' ? '📉 Decelerating' : '➡️ Stable'}
                                              </span>
                                            </div>
                                          )}
                                          {/* Surprise history */}
                                          {ed.surprise_history?.length > 0 && (
                                            <div>
                                              <div style={{fontSize:'0.58rem',color:'#6b7f90',marginBottom:'0.3rem',fontWeight:600}}>Quarterly Surprises</div>
                                              <div style={{display:'flex',gap:'0.25rem',flexWrap:'wrap'}}>
                                                {ed.surprise_history.slice(0,6).map((q, i) => {
                                                  const sp = q.surprise_pct
                                                  const color = sp == null ? '#4a5a6a' : sp > 0 ? '#22c55e' : sp < 0 ? '#ef4444' : '#f0b429'
                                                  return (
                                                    <div key={i} style={{background:'rgba(255,255,255,0.04)',border:`1px solid ${color}30`,borderRadius:6,padding:'0.25rem 0.4rem',textAlign:'center',minWidth:48}}>
                                                      <div style={{fontSize:'0.5rem',color:'#4a5a6a',marginBottom:'0.1rem'}}>{q.quarter?.slice(0,7) || `Q${i+1}`}</div>
                                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.62rem',color}}>
                                                        {sp != null ? `${sp > 0 ? '+' : ''}${sp.toFixed(1)}%` : '—'}
                                                      </div>
                                                    </div>
                                                  )
                                                })}
                                              </div>
                                            </div>
                                          )}
                                          {/* Signals */}
                                          {ed.signals?.length > 0 && (
                                            <div style={{marginTop:'0.1rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)'}}>
                                              {ed.signals.slice(0,4).map((sig, i) => (
                                                <div key={i} style={{fontSize:'0.52rem',color:'#6b7f90',marginBottom:'0.15rem',lineHeight:1.4}}>• {sig}</div>
                                              ))}
                                            </div>
                                          )}
                                          <div style={{marginTop:'0.25rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between'}}>
                                            <span style={{fontSize:'0.6rem',color:'#6b7f90'}}>Earnings Alpha</span>
                                            <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.68rem',
                                              color:result.intelligence.earningsAlphaPct>=0?'#22c55e':'#ef4444'}}>
                                              {result.intelligence.earningsAlphaPct>=0?'+':''}{result.intelligence.earningsAlphaPct?.toFixed(2)}%/yr
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                )}

                                {/* ── Reddit Social Sentiment ── */}
                                {result.intelligence.redditData && (
                                  <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:10,padding:'0.85rem'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',color:'#e8edf2',marginBottom:'0.6rem',display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                      🔥 Reddit Sentiment
                                      {result.intelligence.redditData.sentiment_label && (
                                        <span style={{
                                          fontSize:'0.55rem',fontWeight:800,
                                          color: result.intelligence.redditData.sentiment_label === 'Bullish' ? '#22c55e' : result.intelligence.redditData.sentiment_label === 'Bearish' ? '#ef4444' : '#f0b429',
                                          background: result.intelligence.redditData.sentiment_label === 'Bullish' ? 'rgba(34,197,94,0.1)' : result.intelligence.redditData.sentiment_label === 'Bearish' ? 'rgba(239,68,68,0.1)' : 'rgba(240,180,41,0.1)',
                                          padding:'0.1rem 0.4rem',borderRadius:4
                                        }}>
                                          {result.intelligence.redditData.sentiment_label}
                                        </span>
                                      )}
                                      <span style={{fontSize:'0.5rem',color:'#4a5a6a',marginLeft:'auto'}}>
                                        {result.intelligence.redditData.post_count||0} posts
                                      </span>
                                    </div>
                                    {(() => {
                                      const rd = result.intelligence.redditData
                                      const score = rd.sentiment_score || 0
                                      const scoreColor = score > 0.15 ? '#22c55e' : score < -0.15 ? '#ef4444' : '#f0b429'
                                      const bullish = rd.bullish_count || 0
                                      const bearish = rd.bearish_count || 0
                                      const neutral = rd.neutral_count || 0
                                      const total = bullish + bearish + neutral || 1
                                      return (
                                        <div style={{display:'flex',flexDirection:'column',gap:'0.4rem'}}>
                                          {/* Sentiment Score */}
                                          <div style={{textAlign:'center',padding:'0.4rem 0'}}>
                                            <div style={{fontSize:'0.55rem',color:'#6b7f90',textTransform:'uppercase',fontWeight:600,marginBottom:'0.2rem'}}>Sentiment Score</div>
                                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.3rem',color:scoreColor}}>
                                              {score > 0 ? '+' : ''}{score.toFixed(3)}
                                            </div>
                                            <div style={{fontSize:'0.52rem',color:'#4a5a6a',marginTop:'0.1rem'}}>
                                              {score > 0.3 ? 'Strong bullish buzz' : score > 0.15 ? 'Moderately bullish' : score < -0.3 ? 'Strong bearish sentiment' : score < -0.15 ? 'Moderately bearish' : 'Mixed/neutral chatter'}
                                            </div>
                                          </div>
                                          {/* Bull/Bear bar */}
                                          <div>
                                            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.2rem'}}>
                                              <span style={{fontSize:'0.55rem',color:'#22c55e',fontWeight:700}}>🐂 {bullish}</span>
                                              <span style={{fontSize:'0.55rem',color:'#f0b429',fontWeight:600}}>{neutral}</span>
                                              <span style={{fontSize:'0.55rem',color:'#ef4444',fontWeight:700}}>🐻 {bearish}</span>
                                            </div>
                                            <div style={{height:5,background:'rgba(255,255,255,0.07)',borderRadius:3,overflow:'hidden',display:'flex'}}>
                                              <div style={{height:'100%',width:`${(bullish/total)*100}%`,background:'#22c55e',borderRadius:'3px 0 0 3px',transition:'width 0.6s ease'}}/>
                                              <div style={{height:'100%',width:`${(neutral/total)*100}%`,background:'#f0b429',transition:'width 0.6s ease'}}/>
                                              <div style={{height:'100%',width:`${(bearish/total)*100}%`,background:'#ef4444',borderRadius:'0 3px 3px 0',transition:'width 0.6s ease'}}/>
                                            </div>
                                          </div>
                                          {/* Subreddits */}
                                          {rd.subreddits_searched && rd.subreddits_searched.length > 0 && (
                                            <div style={{display:'flex',flexWrap:'wrap',gap:'0.25rem',marginTop:'0.1rem'}}>
                                              {rd.subreddits_searched.slice(0,5).map((sub,i) => (
                                                <span key={i} style={{fontSize:'0.48rem',color:'#ff6b35',background:'rgba(255,107,53,0.08)',border:'1px solid rgba(255,107,53,0.15)',padding:'0.08rem 0.35rem',borderRadius:10}}>r/{sub}</span>
                                              ))}
                                            </div>
                                          )}
                                          {/* Cache info */}
                                          {rd.cached && (
                                            <div style={{fontSize:'0.5rem',color:'#4a5a6a',textAlign:'center'}}>Cached ({Math.round((rd.cache_age_seconds||0)/60)}m ago)</div>
                                          )}
                                          <div style={{marginTop:'0.25rem',paddingTop:'0.35rem',borderTop:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between'}}>
                                            <span style={{fontSize:'0.6rem',color:'#6b7f90'}}>Reddit Alpha</span>
                                            <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.68rem',
                                              color:result.intelligence.redditAlphaPct>=0?'#22c55e':'#ef4444'}}>
                                              {result.intelligence.redditAlphaPct>=0?'+':''}{result.intelligence.redditAlphaPct?.toFixed(2)}%/yr
                                            </span>
                                          </div>
                                        </div>
                                      )
                                    })()}
                                  </div>
                                )}

                              </div>
                            </div>
                          )}

                          <div style={{background:'rgba(255,45,85,0.04)',border:'1px solid rgba(255,45,85,0.15)',borderRadius:8,padding:'0.75rem 1rem',fontSize:'0.72rem',color:'#8899aa',lineHeight:1.7,marginBottom:'0.5rem'}}>
                            📊 <strong style={{color:'#ff2d55'}}>Reading the numbers:</strong> Accuracy is 3-class walk-forward OOF — random baseline is <strong>33%</strong>, so 40%+ is a genuine signal and 45%+ is strong. Short horizons (tomorrow/week) on daily price data are near-random by design of efficient markets; longer horizons (month/year) usually carry more signal. If the classifier says BUY but the LSTM price forecast disagrees, the signal is weak and you should treat it as HOLD.
                          </div>
                          <div style={{background:'rgba(240,180,41,0.05)',border:'1px solid rgba(240,180,41,0.15)',borderRadius:8,padding:'0.75rem 1rem',fontSize:'0.72rem',color:'#8899aa',lineHeight:1.7}}>
                            ⚠️ <strong style={{color:'#f0b429'}}>Disclaimer:</strong> Real ML models trained on real data. For educational/research purposes only. NOT financial advice. Markets are unpredictable. Always consult a SEBI registered advisor before investing.
                          </div>

                        </div>
                      )}

                      {/* ── REDDIT SENTIMENT TAB ── */}
                      {chartTab==='reddit'&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>

                          {/* Header */}
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                              <div style={{width:42,height:42,borderRadius:12,background:'linear-gradient(135deg,#ff6b35,#ff4500)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',boxShadow:'0 0 25px rgba(255,107,53,0.35)'}}>📰</div>
                              <div>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',background:'linear-gradient(135deg,#ff6b35,#ff4500)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>Reddit Sentiment</div>
                                <div style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace'}}>Live social media sentiment from Indian stock subreddits</div>
                              </div>
                            </div>
                            {redditData&&(
                              <button onClick={()=>{setRedditData(null);setRedditError(null);fetchRedditSentiment()}}
                                style={{background:'rgba(255,107,53,0.08)',border:'1px solid rgba(255,107,53,0.25)',color:'#ff6b35',padding:'0.35rem 0.85rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.7rem'}}>
                                🔄 Refresh
                              </button>
                            )}
                          </div>

                          {/* Loading */}
                          {redditLoading&&(
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'1.25rem',padding:'4rem 2rem',background:'linear-gradient(135deg,rgba(255,107,53,0.05),rgba(10,10,15,0))',borderRadius:16,border:'1px solid rgba(255,107,53,0.15)'}}>
                              <div style={{width:55,height:55,border:'3px solid rgba(255,107,53,0.2)',borderTopColor:'#ff6b35',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                              <p style={{color:'#ff6b35',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1rem'}}>Scraping Reddit for {selected}...</p>
                              <div style={{color:'#6b7f90',fontSize:'0.75rem',textAlign:'center',lineHeight:2,background:'#120a14',padding:'1rem 1.5rem',borderRadius:10,border:'1px solid rgba(255,255,255,0.07)'}}>
                                🔍 Searching r/IndianStockMarket, r/IndianStreetBets...<br/>
                                📊 Analyzing sentiment with FinanceVADER NLP<br/>
                                📈 Aggregating bullish/bearish signals
                              </div>
                            </div>
                          )}

                          {/* Error */}
                          {redditError&&!redditLoading&&(
                            <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:'1.5rem',textAlign:'center'}}>
                              <div style={{fontSize:'1.5rem',marginBottom:'0.5rem'}}>⚠️</div>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:'#ef4444',marginBottom:'0.5rem'}}>Reddit Sentiment Failed</div>
                              <div style={{fontSize:'0.78rem',color:'#8899aa',marginBottom:'1rem'}}>{redditError}</div>
                              <button onClick={fetchRedditSentiment} style={{background:'rgba(255,107,53,0.1)',border:'1px solid rgba(255,107,53,0.25)',color:'#ff6b35',padding:'0.5rem 1rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.78rem'}}>Retry</button>
                            </div>
                          )}

                          {/* Not loaded prompt */}
                          {!redditLoading&&!redditError&&!redditData&&(
                            <div style={{textAlign:'center',padding:'3rem 2rem',background:'linear-gradient(135deg,rgba(255,107,53,0.04),rgba(10,10,15,0))',borderRadius:16,border:'1px dashed rgba(255,107,53,0.2)'}}>
                              <div style={{fontSize:'3.5rem',marginBottom:'1rem'}}>📰</div>
                              <p style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1rem',marginBottom:'0.5rem'}}>Reddit Sentiment Analysis</p>
                              <p style={{color:'#6b7f90',fontSize:'0.82rem',lineHeight:1.7,maxWidth:500,margin:'0 auto 1.5rem'}}>Scrape real posts from r/IndianStockMarket, r/IndianStreetBets, r/DalalStreetBets and more. AI-powered NLP analyzes bullish vs bearish sentiment.</p>
                              <button onClick={fetchRedditSentiment}
                                style={{background:'linear-gradient(135deg,#ff6b35,#ff4500)',color:'#fff',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',fontSize:'0.9rem',padding:'0.75rem 2rem',borderRadius:9,border:'none',cursor:'pointer',boxShadow:'0 0 30px rgba(255,107,53,0.35)'}}>
                                📰 Analyze Reddit Sentiment
                              </button>
                            </div>
                          )}

                          {/* Results */}
                          {!redditLoading&&redditData&&(
                            <div>
                              {/* Sentiment Gauge Banner */}
                              <div style={{background:'linear-gradient(135deg,rgba(255,107,53,0.1),rgba(10,10,15,0))',border:'1px solid rgba(255,107,53,0.2)',borderRadius:14,padding:'1.5rem',marginBottom:'1.25rem'}}>
                                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'1.5rem'}}>
                                  {/* Sentiment Score */}
                                  <div style={{display:'flex',alignItems:'center',gap:'1.25rem'}}>
                                    <div style={{position:'relative',width:90,height:90}}>
                                      <svg width="90" height="90" viewBox="0 0 90 90">
                                        <circle cx="45" cy="45" r="38" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6"/>
                                        <circle cx="45" cy="45" r="38" fill="none"
                                          stroke={redditData.sentiment_score>0.15?'#22c55e':redditData.sentiment_score<-0.15?'#ef4444':'#f0b429'}
                                          strokeWidth="6" strokeLinecap="round"
                                          strokeDasharray={`${Math.abs(redditData.sentiment_score||0)*238.76} 238.76`}
                                          transform="rotate(-90 45 45)" style={{transition:'stroke-dasharray 1s ease'}}/>
                                      </svg>
                                      <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',textAlign:'center'}}>
                                        <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.3rem',color:redditData.sentiment_score>0.15?'#22c55e':redditData.sentiment_score<-0.15?'#ef4444':'#f0b429'}}>
                                          {redditData.sentiment_score>0?'+':''}{(redditData.sentiment_score||0).toFixed(2)}
                                        </div>
                                      </div>
                                    </div>
                                    <div>
                                      <div style={{fontSize:'0.6rem',color:'#ff6b35',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'0.3rem'}}>Overall Sentiment</div>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.5rem',color:redditData.sentiment_score>0.15?'#22c55e':redditData.sentiment_score<-0.15?'#ef4444':'#f0b429'}}>
                                        {redditData.sentiment_score>0.15?'▲':redditData.sentiment_score<-0.15?'▼':'●'} {redditData.sentiment_label||'Neutral'}
                                      </div>
                                      <div style={{fontSize:'0.7rem',color:'#6b7f90',fontFamily:'Inter,sans-serif',marginTop:'0.2rem'}}>
                                        Based on {redditData.post_count||0} posts across {(redditData.subreddits_searched||[]).length} subreddits
                                      </div>
                                    </div>
                                  </div>

                                  {/* Stats */}
                                  <div style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
                                    <div style={{textAlign:'center',minWidth:60}}>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.4rem',color:'#22c55e'}}>{redditData.bullish_count||0}</div>
                                      <div style={{fontSize:'0.58rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Bullish</div>
                                    </div>
                                    <div style={{textAlign:'center',minWidth:60}}>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.4rem',color:'#f0b429'}}>{redditData.neutral_count||0}</div>
                                      <div style={{fontSize:'0.58rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Neutral</div>
                                    </div>
                                    <div style={{textAlign:'center',minWidth:60}}>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.4rem',color:'#ef4444'}}>{redditData.bearish_count||0}</div>
                                      <div style={{fontSize:'0.58rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Bearish</div>
                                    </div>
                                    <div style={{textAlign:'center',minWidth:60}}>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.4rem',color:'#e8edf2'}}>{redditData.post_count||0}</div>
                                      <div style={{fontSize:'0.58rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Posts</div>
                                    </div>
                                  </div>
                                </div>

                                {/* Sentiment Bar */}
                                {(redditData.post_count||0)>0&&(
                                  <div style={{marginTop:'1.25rem'}}>
                                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.3rem'}}>
                                      <span style={{fontSize:'0.6rem',color:'#22c55e',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>Bullish {redditData.bullish_count||0}</span>
                                      <span style={{fontSize:'0.6rem',color:'#ef4444',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>Bearish {redditData.bearish_count||0}</span>
                                    </div>
                                    <div style={{height:8,background:'rgba(255,255,255,0.06)',borderRadius:4,overflow:'hidden',display:'flex'}}>
                                      <div style={{height:'100%',width:`${((redditData.bullish_count||0)/Math.max(1,(redditData.bullish_count||0)+(redditData.neutral_count||0)+(redditData.bearish_count||0)))*100}%`,background:'linear-gradient(90deg,#22c55e,#4ade80)',borderRadius:'4px 0 0 4px',transition:'width 0.8s ease'}}/>
                                      <div style={{height:'100%',width:`${((redditData.neutral_count||0)/Math.max(1,(redditData.bullish_count||0)+(redditData.neutral_count||0)+(redditData.bearish_count||0)))*100}%`,background:'#f0b429',transition:'width 0.8s ease'}}/>
                                      <div style={{height:'100%',width:`${((redditData.bearish_count||0)/Math.max(1,(redditData.bullish_count||0)+(redditData.neutral_count||0)+(redditData.bearish_count||0)))*100}%`,background:'linear-gradient(90deg,#ef4444,#dc2626)',borderRadius:'0 4px 4px 0',transition:'width 0.8s ease'}}/>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Metrics Row */}
                              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:'0.75rem',marginBottom:'1.25rem'}}>
                                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'0.85rem 1rem'}}>
                                  <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'0.3rem'}}>Weighted Score</div>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',color:redditData.weighted_sentiment>0?'#22c55e':redditData.weighted_sentiment<0?'#ef4444':'#f0b429'}}>
                                    {redditData.weighted_sentiment>0?'+':''}{(redditData.weighted_sentiment||0).toFixed(4)}
                                  </div>
                                </div>
                                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'0.85rem 1rem'}}>
                                  <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'0.3rem'}}>Average Score</div>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',color:redditData.avg_sentiment>0?'#22c55e':redditData.avg_sentiment<0?'#ef4444':'#f0b429'}}>
                                    {redditData.avg_sentiment>0?'+':''}{(redditData.avg_sentiment||0).toFixed(4)}
                                  </div>
                                </div>
                                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'0.85rem 1rem'}}>
                                  <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'0.3rem'}}>Source</div>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem',color:'#e8edf2'}}>
                                    {(redditData.source||'reddit').replace(/_/g,' ')}
                                  </div>
                                </div>
                                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'0.85rem 1rem'}}>
                                  <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:'0.3rem'}}>Cache</div>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem',color:'#e8edf2'}}>
                                    {redditData.cached?`Cached (${Math.round((redditData.cache_age_seconds||0)/60)}m ago)`:'Fresh data'}
                                  </div>
                                </div>
                              </div>

                              {/* Subreddits Searched */}
                              {redditData.subreddits_searched&&redditData.subreddits_searched.length>0&&(
                                <div style={{marginBottom:'1.25rem'}}>
                                  <div style={{fontSize:'0.68rem',color:'#8899aa',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,marginBottom:'0.6rem'}}>📡 Subreddits Searched</div>
                                  <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem'}}>
                                    {redditData.subreddits_searched.map((sub,i)=>(
                                      <a key={i} href={`https://reddit.com/r/${sub}`} target="_blank" rel="noopener noreferrer"
                                        style={{background:'rgba(255,107,53,0.08)',border:'1px solid rgba(255,107,53,0.2)',color:'#ff6b35',padding:'0.3rem 0.7rem',borderRadius:20,fontSize:'0.68rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,textDecoration:'none',transition:'all 0.2s',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:'0.3rem'}}
                                        onMouseOver={e=>{e.currentTarget.style.background='rgba(255,107,53,0.18)';e.currentTarget.style.transform='translateY(-1px)'}}
                                        onMouseOut={e=>{e.currentTarget.style.background='rgba(255,107,53,0.08)';e.currentTarget.style.transform='translateY(0)'}}>
                                        <span style={{fontSize:'0.72rem'}}>🔗</span> r/{sub}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Top Posts */}
                              {redditData.top_posts&&redditData.top_posts.length>0&&(
                                <div style={{marginBottom:'1.25rem'}}>
                                  <div style={{fontSize:'0.68rem',color:'#8899aa',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,marginBottom:'0.6rem'}}>🔥 Top Posts by Engagement</div>
                                  <div style={{display:'flex',flexDirection:'column',gap:'0.6rem'}}>
                                    {redditData.top_posts.map((post,i)=>{
                                      const sentColor = post.sentiment>0.15?'#22c55e':post.sentiment<-0.15?'#ef4444':'#f0b429'
                                      const sentLabel = post.sentiment>0.15?'Bullish':post.sentiment<-0.15?'Bearish':'Neutral'
                                      const sentIcon  = post.sentiment>0.15?'▲':post.sentiment<-0.15?'▼':'●'
                                      return(
                                        <a key={i} href={post.url} target="_blank" rel="noopener noreferrer"
                                          style={{background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'0.85rem 1rem',textDecoration:'none',color:'inherit',transition:'all 0.2s',cursor:'pointer',display:'block'}}
                                          onMouseOver={e=>{e.currentTarget.style.borderColor='rgba(255,107,53,0.3)';e.currentTarget.style.background='rgba(255,107,53,0.04)';e.currentTarget.style.transform='translateY(-1px)'}}
                                          onMouseOut={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';e.currentTarget.style.background='rgba(255,255,255,0.02)';e.currentTarget.style.transform='translateY(0)'}}>
                                          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'0.75rem',marginBottom:'0.4rem'}}>
                                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.78rem',color:'#e8edf2',lineHeight:1.4,flex:1}}>
                                              {post.title}
                                            </div>
                                            <span style={{background:`${sentColor}18`,border:`1px solid ${sentColor}40`,color:sentColor,padding:'0.12rem 0.5rem',borderRadius:20,fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.58rem',whiteSpace:'nowrap',flexShrink:0,display:'inline-flex',alignItems:'center',gap:'0.2rem'}}>
                                              {sentIcon} {sentLabel}
                                            </span>
                                          </div>
                                          <div style={{display:'flex',alignItems:'center',gap:'0.85rem',flexWrap:'wrap'}}>
                                            <span style={{fontSize:'0.62rem',color:'#ff6b35',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>r/{post.subreddit}</span>
                                            <span style={{fontSize:'0.62rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',display:'flex',alignItems:'center',gap:'0.25rem'}}>
                                              <span>⬆</span> {post.score}
                                            </span>
                                            <span style={{fontSize:'0.62rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',display:'flex',alignItems:'center',gap:'0.25rem'}}>
                                              <span>💬</span> {post.num_comments}
                                            </span>
                                            <span style={{fontSize:'0.62rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',display:'flex',alignItems:'center',gap:'0.25rem'}}>
                                              <span>👍</span> {((post.upvote_ratio||0)*100).toFixed(0)}%
                                            </span>
                                            <span style={{fontSize:'0.62rem',fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:sentColor}}>
                                              Score: {post.sentiment>0?'+':''}{post.sentiment?.toFixed(3)}
                                            </span>
                                            {post.created_utc&&(
                                              <span style={{fontSize:'0.55rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace',marginLeft:'auto'}}>
                                                {new Date(post.created_utc*1000).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
                                              </span>
                                            )}
                                          </div>
                                          {post.selftext_preview&&post.selftext_preview.trim()&&(
                                            <div style={{marginTop:'0.4rem',fontSize:'0.65rem',color:'#6b7f90',fontFamily:'Inter,sans-serif',lineHeight:1.5,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                              {post.selftext_preview}
                                            </div>
                                          )}
                                        </a>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* No Posts Found */}
                              {(redditData.post_count||0)===0&&(
                                <div style={{textAlign:'center',padding:'2rem',background:'rgba(240,180,41,0.06)',border:'1px solid rgba(240,180,41,0.15)',borderRadius:14}}>
                                  <div style={{fontSize:'2.5rem',marginBottom:'0.75rem'}}>🔍</div>
                                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.9rem',color:'#f0b429',marginBottom:'0.4rem'}}>No Reddit Discussions Found</div>
                                  <div style={{fontSize:'0.75rem',color:'#6b7f90',lineHeight:1.6}}>No posts mentioning {selected} were found on Indian stock subreddits in the past week. This stock may not be actively discussed on Reddit.</div>
                                </div>
                              )}

                              {/* Footer */}
                              <div style={{marginTop:'1rem',paddingTop:'1rem',borderTop:'1px solid rgba(255,255,255,0.04)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
                                <span style={{fontSize:'0.58rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>Reddit Public JSON API · No credentials required · {redditData.api_errors||0} API errors</span>
                                <span style={{fontSize:'0.58rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>{redditData.timestamp?new Date(redditData.timestamp).toLocaleTimeString():''}</span>
                              </div>
                            </div>
                          )}

                        </div>
                      )}

                      {/* ── GROQ AI REPORT TAB ── */}
                      {chartTab==='groq'&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>

                          {/* Header */}
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                              <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,rgba(196,30,58,0.15),rgba(255,45,85,0.08))',border:'1px solid rgba(196,30,58,0.25)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem'}}>📋</div>
                              <div>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.9rem'}}>Groq AI Analyst Report</div>
                                <div style={{fontSize:'0.62rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace'}}>
                                  {groqModel ? `${groqModel} · ${groqTokens} tokens` : 'openai/gpt-oss-120b · Powered by Groq'}
                                </div>
                              </div>
                            </div>
                            {groqReport&&(
                              <button onClick={()=>{setGroqReport(null);setGroqError(null);fetchGroqReport()}}
                                style={{background:'rgba(196,30,58,0.08)',border:'1px solid rgba(196,30,58,0.2)',color:'#c41e3a',padding:'0.35rem 0.85rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.7rem'}}>
                                🔄 Regenerate
                              </button>
                            )}
                          </div>

                          {/* Loading */}
                          {groqLoading&&(
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'1rem',padding:'4rem 2rem',background:'#120a14',borderRadius:14,border:'1px solid rgba(255,255,255,0.06)'}}>
                              <div style={{width:50,height:50,border:'3px solid rgba(196,30,58,0.2)',borderTopColor:'#c41e3a',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                              <p style={{color:'#c41e3a',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.95rem'}}>Generating AI report for {selected}...</p>
                              <p style={{color:'#6b7f90',fontSize:'0.75rem',textAlign:'center'}}>Llama 3.3 70B is reading live indicators + ML signals</p>
                            </div>
                          )}

                          {/* Error */}
                          {groqError&&!groqLoading&&(
                            <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:'1.5rem',textAlign:'center'}}>
                              <div style={{fontSize:'1.5rem',marginBottom:'0.5rem'}}>⚠️</div>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:'#ef4444',marginBottom:'0.5rem'}}>Report generation failed</div>
                              <div style={{fontSize:'0.78rem',color:'#8899aa',marginBottom:'1rem'}}>{groqError}</div>
                              <button onClick={fetchGroqReport} style={{background:'rgba(196,30,58,0.1)',border:'1px solid rgba(196,30,58,0.2)',color:'#c41e3a',padding:'0.5rem 1rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.78rem'}}>Retry</button>
                            </div>
                          )}

                          {/* Not loaded yet prompt */}
                          {!groqLoading&&!groqError&&!groqReport&&(
                            <div style={{textAlign:'center',padding:'3rem 2rem',background:'#120a14',borderRadius:14,border:'1px dashed rgba(196,30,58,0.2)'}}>
                              <div style={{fontSize:'3rem',marginBottom:'1rem'}}>🧠</div>
                              <p style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.95rem',marginBottom:'0.5rem'}}>AI Analyst Report</p>
                              <p style={{color:'#6b7f90',fontSize:'0.82rem',lineHeight:1.7,maxWidth:420,margin:'0 auto 1.5rem'}}>Groq will read your stock&apos;s live indicators and ML predictions and write a grounded analyst report in seconds.</p>
                              <button onClick={fetchGroqReport}
                                style={{background:'linear-gradient(135deg,#c41e3a,#ff2d55)',color:'#fff',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',fontSize:'0.9rem',padding:'0.75rem 2rem',borderRadius:9,border:'none',cursor:'pointer',boxShadow:'0 0 25px rgba(196,30,58,0.35)'}}>
                                📋 Generate Report
                              </button>
                            </div>
                          )}

                          {/* Report content */}
                          {!groqLoading&&groqReport&&(
                            <div style={{background:'linear-gradient(135deg,rgba(196,30,58,0.06),rgba(10,10,15,0))',border:'1px solid rgba(196,30,58,0.15)',borderRadius:14,padding:'1.75rem',position:'relative',overflow:'hidden'}}>
                              {/* Groq badge */}
                              <div style={{position:'absolute',top:'1rem',right:'1rem',display:'flex',alignItems:'center',gap:'0.4rem',background:'rgba(196,30,58,0.1)',border:'1px solid rgba(196,30,58,0.2)',borderRadius:100,padding:'0.15rem 0.65rem'}}>
                                <span style={{width:5,height:5,borderRadius:'50%',background:'#22c55e',animation:'pulse 2s infinite',display:'inline-block'}}/>
                                <span style={{fontSize:'0.55rem',fontFamily:'JetBrains Mono,monospace',fontWeight:600,color:'#c41e3a',letterSpacing:'0.1em'}}>GROQ · LIVE</span>
                              </div>

                              {/* Stock context strip */}
                              <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1.5rem',paddingBottom:'1rem',borderBottom:'1px solid rgba(255,255,255,0.06)',flexWrap:'wrap'}}>
                                <div style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:'0.95rem'}}>{selected}</div>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem'}}>₹{result.currentPrice}</div>
                                <div style={{fontSize:'0.75rem',color:result.priceChangePct>=0?'#22c55e':'#ef4444',fontWeight:700}}>
                                  {result.priceChangePct>=0?'▲':'▼'}{Math.abs(result.priceChangePct).toFixed(2)}%
                                </div>
                                <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:'0.35rem',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:6,padding:'0.25rem 0.75rem'}}>
                                  <span style={{fontSize:'0.6rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace'}}>OVERALL</span>
                                  <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.75rem',color:result.overallSignal==='BUY'?'#22c55e':result.overallSignal==='SELL'?'#ef4444':'#f0b429'}}>{result.overallSignal}</span>
                                </div>
                              </div>

                              {/* Report text — render markdown-style bold sections */}
                              <div style={{fontFamily:'Inter,sans-serif',fontSize:'0.83rem',color:'#c8d4e0',lineHeight:1.85}}>
                                {groqReport.split('\n').map((line, i) => {
                                  if (!line.trim()) return <div key={i} style={{height:'0.75rem'}}/>
                                  // Bold headers like **Technical Picture**
                                  if (line.startsWith('**') && line.endsWith('**')) {
                                    return (
                                      <div key={i} style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.82rem',color:'#e8edf2',marginTop:'1.25rem',marginBottom:'0.35rem',display:'flex',alignItems:'center',gap:'0.5rem'}}>
                                        <span style={{width:3,height:'1em',background:'#c41e3a',borderRadius:2,display:'inline-block',flexShrink:0}}/>
                                        {line.replace(/\*\*/g,'')}
                                      </div>
                                    )
                                  }
                                  // Bullet points
                                  if (line.startsWith('•') || line.startsWith('- ') || line.startsWith('* ')) {
                                    return (
                                      <div key={i} style={{display:'flex',gap:'0.5rem',marginBottom:'0.25rem',paddingLeft:'0.5rem'}}>
                                        <span style={{color:'#c41e3a',flexShrink:0,marginTop:'0.05rem'}}>✦</span>
                                        <span>{line.replace(/^[•\-\*]\s*/,'')}</span>
                                      </div>
                                    )
                                  }
                                  // Inline bold (**word**) — simple replace
                                  const parts = line.split(/\*\*([^*]+)\*\*/)
                                  return (
                                    <p key={i} style={{marginBottom:'0.2rem'}}>
                                      {parts.map((part, j) => j % 2 === 1
                                        ? <strong key={j} style={{color:'#e8edf2',fontWeight:700}}>{part}</strong>
                                        : part
                                      )}
                                    </p>
                                  )
                                })}
                              </div>

                              {/* Footer */}
                              <div style={{marginTop:'1.5rem',paddingTop:'1rem',borderTop:'1px solid rgba(255,255,255,0.05)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
                                <span style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>Generated by {groqModel||'openai/gpt-oss-120b'} · {groqTokens} tokens</span>
                                <span style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>Not SEBI-registered financial advice</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── MULTI-AGENT ANALYSIS TAB ── */}
                      {chartTab==='agents'&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>

                          {/* Header */}
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'1.25rem',flexWrap:'wrap',gap:'0.75rem'}}>
                            <div style={{display:'flex',alignItems:'center',gap:'0.75rem'}}>
                              <div style={{width:40,height:40,borderRadius:12,background:'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(59,130,246,0.15))',border:'1px solid rgba(139,92,246,0.3)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem'}}>🧠</div>
                              <div>
                                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.95rem'}}>Multi-Agent Analysis</div>
                                <div style={{fontSize:'0.62rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace'}}>5 AI Agents • Debate & Consensus • Powered by Groq</div>
                              </div>
                            </div>
                            {agentResult&&(
                              <button onClick={()=>{setAgentResult(null);setAgentError(null);fetchMultiAgent()}}
                                style={{background:'rgba(139,92,246,0.08)',border:'1px solid rgba(139,92,246,0.25)',color:'#8b5cf6',padding:'0.35rem 0.85rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.7rem'}}>
                                🔄 Re-analyze
                              </button>
                            )}
                          </div>

                          {/* Loading */}
                          {agentLoading&&(
                            <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:'1.25rem',padding:'4rem 2rem',background:'linear-gradient(135deg,rgba(139,92,246,0.05),rgba(10,10,15,0))',borderRadius:16,border:'1px solid rgba(139,92,246,0.15)'}}>
                              <div style={{width:55,height:55,border:'3px solid rgba(139,92,246,0.2)',borderTopColor:'#8b5cf6',borderRadius:'50%',animation:'spin 0.8s linear infinite'}}/>
                              <p style={{color:'#8b5cf6',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1rem'}}>Running 5 AI Agents on {selected}...</p>
                              <div style={{color:'#6b7f90',fontSize:'0.75rem',textAlign:'center',lineHeight:2,background:'#120a14',padding:'1rem 1.5rem',borderRadius:10,border:'1px solid rgba(255,255,255,0.07)'}}>
                                📊 Technical Analyst reading indicators<br/>
                                📰 Reddit Sentiment scraping social media<br/>
                                💰 Fundamental Analyst evaluating financials<br/>
                                📈 ML Forecast interpreting model outputs<br/>
                                ⚠️ Risk Manager assessing volatility<br/>
                                🤝 Orchestrator building consensus via Groq LLM
                              </div>
                            </div>
                          )}

                          {/* Error */}
                          {agentError&&!agentLoading&&(
                            <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:'1.5rem',textAlign:'center'}}>
                              <div style={{fontSize:'1.5rem',marginBottom:'0.5rem'}}>⚠️</div>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:'#ef4444',marginBottom:'0.5rem'}}>Multi-Agent Analysis Failed</div>
                              <div style={{fontSize:'0.78rem',color:'#8899aa',marginBottom:'1rem'}}>{agentError}</div>
                              <button onClick={fetchMultiAgent} style={{background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.25)',color:'#8b5cf6',padding:'0.5rem 1rem',borderRadius:7,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.78rem'}}>Retry</button>
                            </div>
                          )}

                          {/* Not loaded prompt */}
                          {!agentLoading&&!agentError&&!agentResult&&(
                            <div style={{textAlign:'center',padding:'3rem 2rem',background:'linear-gradient(135deg,rgba(139,92,246,0.04),rgba(10,10,15,0))',borderRadius:16,border:'1px dashed rgba(139,92,246,0.2)'}}>
                              <div style={{fontSize:'3.5rem',marginBottom:'1rem'}}>🧠</div>
                              <p style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1rem',marginBottom:'0.5rem'}}>Multi-Agent Simulation</p>
                              <p style={{color:'#6b7f90',fontSize:'0.82rem',lineHeight:1.7,maxWidth:500,margin:'0 auto 1.5rem'}}>5 specialized AI agents will analyze {selected} from different perspectives — Technical, Sentiment, Fundamental, ML, Risk — then debate and reach consensus.</p>
                              <button onClick={fetchMultiAgent}
                                style={{background:'linear-gradient(135deg,#8b5cf6,#6366f1)',color:'#fff',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',fontSize:'0.9rem',padding:'0.75rem 2rem',borderRadius:9,border:'none',cursor:'pointer',boxShadow:'0 0 30px rgba(139,92,246,0.35)'}}>
                                🧠 Run Multi-Agent Analysis
                              </button>
                            </div>
                          )}

                          {/* Results */}
                          {!agentLoading&&agentResult&&(
                            <div>
                              {/* Final Verdict Banner */}
                              <div style={{background:'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(59,130,246,0.08))',border:'1px solid rgba(139,92,246,0.25)',borderRadius:14,padding:'1.25rem',marginBottom:'1.25rem',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'1rem'}}>
                                <div style={{display:'flex',alignItems:'center',gap:'1rem'}}>
                                  <div style={{width:50,height:50,borderRadius:14,background:'linear-gradient(135deg,#8b5cf6,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.5rem',boxShadow:'0 0 20px rgba(139,92,246,0.4)'}}>🏛️</div>
                                  <div>
                                    <div style={{fontSize:'0.6rem',color:'#8b5cf6',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:'0.2rem'}}>Consensus Verdict</div>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.3rem',color:agentResult.final_verdict?.includes('BUY')?'#22c55e':agentResult.final_verdict?.includes('SELL')?'#ef4444':'#f0b429'}}>
                                      {agentResult.final_verdict?.includes('BUY')?'▲':agentResult.final_verdict?.includes('SELL')?'▼':'●'} {agentResult.final_verdict || 'HOLD'}
                                    </div>
                                  </div>
                                </div>
                                <div style={{display:'flex',gap:'1rem',alignItems:'center'}}>
                                  <div style={{textAlign:'center'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',color:'#22c55e'}}>{agentResult.reports?.filter(r=>r.verdict==='BUY').length||0}</div>
                                    <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>BUY</div>
                                  </div>
                                  <div style={{textAlign:'center'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',color:'#f0b429'}}>{agentResult.reports?.filter(r=>r.verdict==='HOLD').length||0}</div>
                                    <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>HOLD</div>
                                  </div>
                                  <div style={{textAlign:'center'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',color:'#ef4444'}}>{agentResult.reports?.filter(r=>r.verdict==='SELL').length||0}</div>
                                    <div style={{fontSize:'0.55rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>SELL</div>
                                  </div>
                                  <div style={{fontSize:'0.6rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',marginLeft:'0.5rem'}}>
                                    {agentResult.meta?.elapsed_seconds}s • {agentResult.meta?.agent_count} agents
                                  </div>
                                </div>
                              </div>

                              {/* Agent Report Cards */}
                              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'0.85rem',marginBottom:'1.25rem'}}>
                                {(agentResult.reports||[]).map((r,i)=>{
                                  const vColor = r.verdict==='BUY'?'#22c55e':r.verdict==='SELL'?'#ef4444':'#f0b429'
                                  const agentColors = {
                                    'Technical Analyst':'rgba(59,130,246,0.12)','Reddit Sentiment':'rgba(255,107,53,0.12)',
                                    'Fundamental Analyst':'rgba(34,197,94,0.12)','ML Forecast':'rgba(139,92,246,0.12)',
                                    'Risk Manager':'rgba(239,68,68,0.12)'
                                  }
                                  const borderColors = {
                                    'Technical Analyst':'rgba(59,130,246,0.25)','Reddit Sentiment':'rgba(255,107,53,0.25)',
                                    'Fundamental Analyst':'rgba(34,197,94,0.25)','ML Forecast':'rgba(139,92,246,0.25)',
                                    'Risk Manager':'rgba(239,68,68,0.25)'
                                  }
                                  return(
                                    <div key={i} style={{background:agentColors[r.agent]||'rgba(255,255,255,0.03)',border:`1px solid ${borderColors[r.agent]||'rgba(255,255,255,0.08)'}`,borderRadius:12,padding:'1rem',transition:'transform 0.15s',cursor:'default'}}
                                      onMouseOver={e=>e.currentTarget.style.transform='translateY(-2px)'}
                                      onMouseOut={e=>e.currentTarget.style.transform='translateY(0)'}>
                                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'0.65rem'}}>
                                        <div style={{display:'flex',alignItems:'center',gap:'0.5rem'}}>
                                          <span style={{fontSize:'1.2rem'}}>{r.emoji}</span>
                                          <div>
                                            <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.78rem'}}>{r.agent}</div>
                                            <div style={{fontSize:'0.55rem',color:'#6b7f90'}}>{r.role}</div>
                                          </div>
                                        </div>
                                        <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
                                          <span style={{background:`${vColor}18`,border:`1px solid ${vColor}55`,color:vColor,padding:'0.15rem 0.55rem',borderRadius:100,fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.65rem',display:'inline-flex',alignItems:'center',gap:'0.2rem'}}>
                                            {r.verdict==='BUY'?'▲':r.verdict==='SELL'?'▼':'●'} {r.verdict}
                                          </span>
                                        </div>
                                      </div>

                                      {/* Confidence bar */}
                                      <div style={{marginBottom:'0.6rem'}}>
                                        <div style={{display:'flex',justifyContent:'space-between',marginBottom:'0.2rem'}}>
                                          <span style={{fontSize:'0.58rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>Confidence</span>
                                          <span style={{fontSize:'0.62rem',color:vColor,fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>{r.confidence}%</span>
                                        </div>
                                        <div style={{height:4,background:'rgba(255,255,255,0.06)',borderRadius:2,overflow:'hidden'}}>
                                          <div style={{height:'100%',width:`${r.confidence}%`,background:vColor,borderRadius:2,transition:'width 0.8s ease'}}/>
                                        </div>
                                      </div>

                                      {/* Summary */}
                                      <div style={{fontSize:'0.72rem',color:'#c8d4e0',lineHeight:1.6}}>{r.summary}</div>

                                      {/* Agent-specific details */}
                                      {r.agent==='Reddit Sentiment'&&r.details&&(
                                        <div style={{marginTop:'0.6rem',padding:'0.5rem 0.65rem',background:'rgba(0,0,0,0.2)',borderRadius:8,border:'1px solid rgba(255,255,255,0.04)'}}>
                                          <div style={{display:'flex',gap:'0.75rem',marginBottom:'0.4rem'}}>
                                            <div style={{textAlign:'center'}}>
                                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',color:r.details.sentiment_score>0?'#22c55e':r.details.sentiment_score<0?'#ef4444':'#f0b429'}}>{r.details.sentiment_score>0?'+':''}{r.details.sentiment_score?.toFixed(2)}</div>
                                              <div style={{fontSize:'0.5rem',color:'#6b7f90'}}>Score</div>
                                            </div>
                                            <div style={{textAlign:'center'}}>
                                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem'}}>{r.details.post_count}</div>
                                              <div style={{fontSize:'0.5rem',color:'#6b7f90'}}>Posts</div>
                                            </div>
                                            <div style={{textAlign:'center'}}>
                                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',color:'#22c55e'}}>{r.details.bullish_count||0}</div>
                                              <div style={{fontSize:'0.5rem',color:'#6b7f90'}}>Bullish</div>
                                            </div>
                                            <div style={{textAlign:'center'}}>
                                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',color:'#ef4444'}}>{r.details.bearish_count||0}</div>
                                              <div style={{fontSize:'0.5rem',color:'#6b7f90'}}>Bearish</div>
                                            </div>
                                          </div>
                                          {r.details.demo_mode&&<div style={{fontSize:'0.55rem',color:'#f0b429',fontStyle:'italic'}}>📌 Demo mode — set REDDIT_CLIENT_ID/SECRET for live data</div>}
                                          {r.details.top_posts?.slice(0,2).map((p,pi)=>(
                                            <div key={pi} style={{fontSize:'0.62rem',color:'#8899aa',borderTop:'1px solid rgba(255,255,255,0.04)',paddingTop:'0.3rem',marginTop:'0.3rem',display:'flex',gap:'0.3rem'}}>
                                              <span style={{color:p.sentiment>0?'#22c55e':'#ef4444',flexShrink:0}}>{p.sentiment>0?'▲':'▼'}</span>
                                              <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.title}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}

                                      {r.agent==='Risk Manager'&&r.details&&(
                                        <div style={{marginTop:'0.6rem',display:'flex',gap:'0.5rem',flexWrap:'wrap'}}>
                                          <span style={{background:r.details.risk_level==='HIGH'?'rgba(239,68,68,0.12)':r.details.risk_level==='MEDIUM'?'rgba(240,180,41,0.12)':'rgba(34,197,94,0.12)',border:`1px solid ${r.details.risk_level==='HIGH'?'rgba(239,68,68,0.3)':r.details.risk_level==='MEDIUM'?'rgba(240,180,41,0.3)':'rgba(34,197,94,0.3)'}`,color:r.details.risk_level==='HIGH'?'#ef4444':r.details.risk_level==='MEDIUM'?'#f0b429':'#22c55e',padding:'0.15rem 0.5rem',borderRadius:6,fontSize:'0.6rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>
                                            Risk: {r.details.risk_level} ({r.details.risk_score}/10)
                                          </span>
                                          <span style={{background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.08)',color:'#8899aa',padding:'0.15rem 0.5rem',borderRadius:6,fontSize:'0.6rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>
                                            Position: {r.details.position_size}
                                          </span>
                                          {r.details.stop_loss&&(
                                            <span style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',color:'#ef4444',padding:'0.15rem 0.5rem',borderRadius:6,fontSize:'0.6rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>
                                              SL: ₹{r.details.stop_loss}
                                            </span>
                                          )}
                                        </div>
                                      )}

                                      {r.elapsed_ms!=null&&(
                                        <div style={{marginTop:'0.5rem',fontSize:'0.52rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>{r.elapsed_ms}ms</div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>

                              {/* Consensus Report */}
                              {agentResult.consensus?.consensus_report&&(
                                <div style={{background:'linear-gradient(135deg,rgba(139,92,246,0.06),rgba(10,10,15,0))',border:'1px solid rgba(139,92,246,0.15)',borderRadius:14,padding:'1.75rem',position:'relative',overflow:'hidden'}}>
                                  {/* Badge */}
                                  <div style={{position:'absolute',top:'1rem',right:'1rem',display:'flex',alignItems:'center',gap:'0.4rem',background:'rgba(139,92,246,0.1)',border:'1px solid rgba(139,92,246,0.2)',borderRadius:100,padding:'0.15rem 0.65rem'}}>
                                    <span style={{width:5,height:5,borderRadius:'50%',background:agentResult.consensus.llm_powered?'#22c55e':'#f0b429',animation:'pulse 2s infinite',display:'inline-block'}}/>
                                    <span style={{fontSize:'0.55rem',fontFamily:'JetBrains Mono,monospace',fontWeight:600,color:'#8b5cf6',letterSpacing:'0.1em'}}>{agentResult.consensus.llm_powered?'GROQ · LLM':'VOTE-BASED'}</span>
                                  </div>

                                  <div style={{display:'flex',alignItems:'center',gap:'0.75rem',marginBottom:'1.5rem',paddingBottom:'1rem',borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                                    <div style={{width:36,height:36,borderRadius:10,background:'linear-gradient(135deg,#8b5cf6,#6366f1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.1rem'}}>⚔️</div>
                                    <div>
                                      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.9rem'}}>Agent Debate & Consensus</div>
                                      <div style={{fontSize:'0.6rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace'}}>{agentResult.consensus.model} {agentResult.consensus.tokens?`· ${agentResult.consensus.tokens} tokens`:''}</div>
                                    </div>
                                  </div>

                                  {/* Report text */}
                                  <div style={{fontFamily:'Inter,sans-serif',fontSize:'0.82rem',color:'#c8d4e0',lineHeight:1.85}}>
                                    {agentResult.consensus.consensus_report.split('\n').map((line, i) => {
                                      if (!line.trim()) return <div key={i} style={{height:'0.75rem'}}/>
                                      if (line.startsWith('**') && line.endsWith('**')) {
                                        return (
                                          <div key={i} style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.82rem',color:'#e8edf2',marginTop:'1.25rem',marginBottom:'0.35rem',display:'flex',alignItems:'center',gap:'0.5rem'}}>
                                            <span style={{width:3,height:'1em',background:'#8b5cf6',borderRadius:2,display:'inline-block',flexShrink:0}}/>
                                            {line.replace(/\*\*/g,'')}
                                          </div>
                                        )
                                      }
                                      if (line.startsWith('•') || line.startsWith('- ') || line.startsWith('* ')) {
                                        return (
                                          <div key={i} style={{display:'flex',gap:'0.5rem',marginBottom:'0.25rem',paddingLeft:'0.5rem'}}>
                                            <span style={{color:'#8b5cf6',flexShrink:0,marginTop:'0.05rem'}}>✦</span>
                                            <span>{line.replace(/^[•\-\*]\s*/,'')}</span>
                                          </div>
                                        )
                                      }
                                      const parts = line.split(/\*\*([^*]+)\*\*/)
                                      return (
                                        <p key={i} style={{marginBottom:'0.2rem'}}>
                                          {parts.map((part, j) => j % 2 === 1
                                            ? <strong key={j} style={{color:'#e8edf2',fontWeight:700}}>{part}</strong>
                                            : part
                                          )}
                                        </p>
                                      )
                                    })}
                                  </div>

                                  {/* Footer */}
                                  <div style={{marginTop:'1.5rem',paddingTop:'1rem',borderTop:'1px solid rgba(255,255,255,0.05)',display:'flex',justifyContent:'space-between',alignItems:'center',flexWrap:'wrap',gap:'0.5rem'}}>
                                    <span style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>Multi-Agent Simulation · {agentResult.meta?.agent_count} agents · {agentResult.meta?.elapsed_seconds}s</span>
                                    <span style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>Not SEBI-registered financial advice</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      )}

                      {/* ── INDICATORS TAB ── */}
                      {chartTab==='indicators'&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
                            <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1.25rem'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'0.75rem'}}>Live Values (Real Calculation)</div>
                              {[
                                ['RSI(14)',result.indicators.rsi,result.indicators.rsi<30?'🟢 Oversold':result.indicators.rsi>70?'🔴 Overbought':'🟡 Neutral'],
                                ['MACD',result.indicators.macd.toFixed(4),result.indicators.macd>result.indicators.macd_signal?'🟢 Bullish':'🔴 Bearish'],
                                ['Bollinger %',(result.indicators.bb_pct*100).toFixed(1)+'%',result.indicators.bb_pct<0.2?'🟢 Lower':result.indicators.bb_pct>0.8?'🔴 Upper':'🟡 Mid'],
                                ['Stoch K',result.indicators.stoch_k.toFixed(1),result.indicators.stoch_k<20?'🟢 Oversold':result.indicators.stoch_k>80?'🔴 Overbought':'🟡 Neutral'],
                                ['CCI(20)',result.indicators.cci.toFixed(1),result.indicators.cci<-100?'🟢 Oversold':result.indicators.cci>100?'🔴 Overbought':'🟡 Neutral'],
                                ['Williams %R',result.indicators.williams_r.toFixed(1),result.indicators.williams_r<-80?'🟢 Oversold':result.indicators.williams_r>-20?'🔴 Overbought':'🟡 Neutral'],
                                ['ATR',result.indicators.atr.toFixed(2),'Volatility'],
                                ['Vol Ratio',result.indicators.volume_ratio.toFixed(2)+'x',result.indicators.volume_ratio>1.5?'🔥 High':'Normal'],
                                ['MA 20','₹'+result.indicators.ma20,result.currentPrice>result.indicators.ma20?'✅ Above':'❌ Below'],
                                ['MA 50','₹'+result.indicators.ma50,result.currentPrice>result.indicators.ma50?'✅ Above':'❌ Below'],
                                ['MA 200','₹'+result.indicators.ma200,result.currentPrice>result.indicators.ma200?'✅ Above':'❌ Below'],
                                ['Momentum',result.indicators.momentum.toFixed(2),result.indicators.momentum>0?'📈 Positive':'📉 Negative'],
                              ].map(([n,v,note])=>(
                                <div key={n} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.38rem 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                  <span style={{fontSize:'0.72rem',color:'#8899aa',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>{n}</span>
                                  <div style={{textAlign:'right'}}>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem'}}>{v}</div>
                                    <div style={{fontSize:'0.58rem',color:'#4a5a6a'}}>{note}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1.25rem'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'0.75rem'}}>Indicator Signals ({result.indicatorSignals?.length})</div>
                              {(result.indicatorSignals||[]).map((ind,i)=>(
                                <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'0.38rem 0.5rem',marginBottom:'0.25rem',background:'rgba(255,255,255,0.02)',borderRadius:6}}>
                                  <div>
                                    <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:600,fontSize:'0.72rem'}}>{ind.name}</div>
                                    <div style={{fontSize:'0.58rem',color:'#4a5a6a'}}>{ind.reason}</div>
                                  </div>
                                  <div style={{display:'flex',gap:'0.4rem',alignItems:'center'}}>
                                    <span style={{fontSize:'0.65rem',color:'#8899aa'}}>{ind.value}</span>
                                    <SignalBadge signal={ind.signal}/>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* ── FINANCIALS TAB ── */}
                      {chartTab==='financials'&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>
                          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
                            {/* Price Stats */}
                            <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1rem'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem',marginBottom:'0.75rem',color:'#ff2d55'}}>📊 Price Data</div>
                              {[
                                ['Current Price',`₹${fin.currentPrice||result.currentPrice}`],
                                ['Prev. Close',  `₹${fin.previousClose||result.prevPrice}`],
                                ['Open',         fin.open>0?`₹${fin.open}`:'—'],
                                ["Day's High",   fin.dayHigh>0?`₹${fin.dayHigh}`:'—'],
                                ["Day's Low",    fin.dayLow>0?`₹${fin.dayLow}`:'—'],
                                ['52wk High',    fin.week52High>0?`₹${fin.week52High}`:'—'],
                                ['52wk Low',     fin.week52Low>0?`₹${fin.week52Low}`:'—'],
                                ['50-Day Avg',   fin.fiftyDayAvg>0?`₹${fin.fiftyDayAvg.toFixed(2)}`:'—'],
                                ['200-Day Avg',  fin.twoHundredDayAvg>0?`₹${fin.twoHundredDayAvg.toFixed(2)}`:'—'],
                                ['Volume',       fin.volume>0?fin.volume.toLocaleString():'—'],
                                ['Avg Vol(3m)',  fin.avgVolume3m>0?fin.avgVolume3m.toLocaleString():'—'],
                                ['Beta',         fmtR(fin.beta)],
                              ].map(([l,v])=>(
                                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'0.35rem 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                  <span style={{fontSize:'0.7rem',color:'#8899aa'}}>{l}</span>
                                  <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem'}}>{v||'—'}</span>
                                </div>
                              ))}
                            </div>
                            {/* Valuation */}
                            <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1rem'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem',marginBottom:'0.75rem',color:'#f0b429'}}>💰 Valuation</div>
                              {[
                                ['Market Cap',   fmtN(fin.marketCap)],
                                ['Ent. Value',   fmtN(fin.enterpriseValue)],
                                ['P/E Ratio',    fmtR(fin.peRatio)],
                                ['Forward P/E',  fmtR(fin.forwardPE)],
                                ['P/B Ratio',    fmtR(fin.pbRatio)],
                                ['P/S Ratio',    fmtR(fin.psRatio)],
                                ['EV/EBITDA',    fmtR(fin.evToEbitda)],
                                ['EV/Revenue',   fmtR(fin.evToRevenue)],
                                ['EPS (TTM)',     fin.eps?`₹${fin.eps.toFixed(2)}`:'—'],
                                ['Forward EPS',  fin.forwardEps?`₹${fin.forwardEps.toFixed(2)}`:'—'],
                                ['Book Value',   fin.bookValue?`₹${fin.bookValue.toFixed(2)}`:'—'],
                                ['Shares Out',   fin.sharesOut?fmtN(fin.sharesOut):'—'],
                              ].map(([l,v])=>(
                                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'0.35rem 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                  <span style={{fontSize:'0.7rem',color:'#8899aa'}}>{l}</span>
                                  <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem'}}>{v||'—'}</span>
                                </div>
                              ))}
                            </div>
                            {/* Fundamentals */}
                            <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1rem'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.82rem',marginBottom:'0.75rem',color:'#22c55e'}}>📈 Fundamentals</div>
                              {[
                                ['Revenue',       fmtN(fin.revenue)],
                                ['Revenue Growth',fin.revenueGrowth?fmtPct(fin.revenueGrowth):'—'],
                                ['Gross Profit',  fmtN(fin.grossProfit)],
                                ['EBITDA',        fmtN(fin.ebitda)],
                                ['Net Income',    fmtN(fin.netIncome)],
                                ['Earnings Grw',  fin.earningsGrowth?fmtPct(fin.earningsGrowth):'—'],
                                ['Gross Margin',  fin.grossMargins?fmtPct(fin.grossMargins):'—'],
                                ['Op. Margin',    fin.operatingMargins?fmtPct(fin.operatingMargins):'—'],
                                ['Net Margin',    fin.profitMargins?fmtPct(fin.profitMargins):'—'],
                                ['ROE',           fin.roe?fmtPct(fin.roe):'—'],
                                ['ROA',           fin.roa?fmtPct(fin.roa):'—'],
                                ['Debt/Equity',   fmtR(fin.debtToEquity)],
                                ['Current Ratio', fmtR(fin.currentRatio)],
                                ['Dividend Yield',fin.dividendYield?fmtPct(fin.dividendYield):'—'],
                                ['Free Cashflow', fmtN(fin.freeCashflow)],
                                ['Target Price',  fin.targetPrice?`₹${fin.targetPrice}`:'—'],
                                ['Analyst Rating',fin.recommendKey||'—'],
                                ['# Analysts',    fin.numberOfAnalysts||'—'],
                                ['52W Change',    fin['52WeekChange']?fmtPct(fin['52WeekChange']):'—'],
                              ].map(([l,v])=>(
                                <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'0.35rem 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                                  <span style={{fontSize:'0.7rem',color:'#8899aa'}}>{l}</span>
                                  <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem',color:l==='Analyst Rating'?(fin.recommendKey?.includes('buy')?'#22c55e':fin.recommendKey?.includes('sell')?'#ef4444':'#f0b429'):'#e8edf2'}}>{v||'—'}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                          {/* Company description */}
                          {result.description&&(
                            <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.07)',borderRadius:12,padding:'1.25rem'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'0.75rem'}}>About {result.name}</div>
                              <div style={{fontSize:'0.78rem',color:'#8899aa',lineHeight:1.8}}>{result.description}</div>
                              {fin.website&&<a href={fin.website} target="_blank" rel="noopener noreferrer" style={{color:'#ff2d55',fontSize:'0.75rem',display:'block',marginTop:'0.5rem'}}>{fin.website} ↗</a>}
                            </div>
                          )}
                        </div>
                      )}

                      {/* ── HISTORICAL TAB ── */}
                      {chartTab==='historical'&&result.chartData&&(
                        <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>
                          <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,overflow:'hidden'}}>
                            <div style={{padding:'1rem 1.25rem',borderBottom:'1px solid rgba(255,255,255,0.06)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                              <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem'}}>{result.dataPoints} Trading Days • Real Yahoo Finance Data</div>
                              <button onClick={()=>{
                                const csv='Date,Open,High,Low,Close,Volume\n'+result.chartData.map(r=>`${r.date},${r.open},${r.high},${r.low},${r.close},${r.volume}`).join('\n')
                                const a=document.createElement('a'); a.href='data:text/csv,'+encodeURIComponent(csv); a.download=`${selected}_history.csv`; a.click()
                              }} style={{background:'linear-gradient(135deg,#22c55e,#16a34a)',color:'#000',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',padding:'0.35rem 0.9rem',borderRadius:7,border:'none',cursor:'pointer',fontSize:'0.72rem'}}>
                                ⬇️ Download CSV
                              </button>
                            </div>
                            <div style={{overflowX:'auto'}}>
                              <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                                <thead>
                                  <tr style={{background:'rgba(255,255,255,0.03)',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                                    {['Date','Open','High','Low','Close','Volume','Change'].map(h=>(
                                      <th key={h} style={{padding:'0.75rem 1rem',textAlign:'left',color:'#6b7f90',fontSize:'0.65rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {[...result.chartData].reverse().map((row,i)=>{
                                    const up=row.close>=row.open; const chgp=((row.close-row.open)/row.open*100).toFixed(2)
                                    return(
                                      <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                                        <td style={{padding:'0.6rem 1rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,color:'#c8d4e0',whiteSpace:'nowrap'}}>{row.date}</td>
                                        <td style={{padding:'0.6rem 1rem',color:'#8899aa'}}>₹{row.open}</td>
                                        <td style={{padding:'0.6rem 1rem',color:'#22c55e'}}>₹{row.high}</td>
                                        <td style={{padding:'0.6rem 1rem',color:'#ef4444'}}>₹{row.low}</td>
                                        <td style={{padding:'0.6rem 1rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>₹{row.close}</td>
                                        <td style={{padding:'0.6rem 1rem',color:'#8899aa'}}>{(row.volume/1e6).toFixed(2)}M</td>
                                        <td style={{padding:'0.6rem 1rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:up?'#22c55e':'#ef4444'}}>{up?'▲':'▼'}{Math.abs(chgp)}%</td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* BACKTEST TAB */}
          {activeTab==='predict'&&chartTab==='backtest'&&selected&&(
            <div style={{flex:1,overflowY:'auto',padding:'1.25rem'}}>
              {/* Controls */}
              <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'1.2rem',marginBottom:'1rem'}}>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',color:'#e8edf2',marginBottom:'0.8rem'}}>📊 Walk-Forward Backtest</div>
                <div style={{display:'flex',flexWrap:'wrap',gap:'0.75rem',alignItems:'end'}}>
                  <div>
                    <label style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace',display:'block',marginBottom:'0.2rem'}}>START DATE</label>
                    <input type="date" value={btStartDate} onChange={e=>setBtStartDate(e.target.value)}
                      style={{background:'#0a0612',border:'1px solid rgba(255,255,255,0.1)',color:'#e8edf2',padding:'0.4rem 0.6rem',borderRadius:7,fontSize:'0.75rem',fontFamily:'Space Grotesk,sans-serif',colorScheme:'dark'}} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace',display:'block',marginBottom:'0.2rem'}}>END DATE</label>
                    <input type="date" value={btEndDate} onChange={e=>setBtEndDate(e.target.value)}
                      style={{background:'#0a0612',border:'1px solid rgba(255,255,255,0.1)',color:'#e8edf2',padding:'0.4rem 0.6rem',borderRadius:7,fontSize:'0.75rem',fontFamily:'Space Grotesk,sans-serif',colorScheme:'dark'}} />
                  </div>
                  <div>
                    <label style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace',display:'block',marginBottom:'0.2rem'}}>HORIZON</label>
                    <div style={{display:'flex',gap:'0.3rem'}}>
                      {[{d:1,l:'1D'},{d:5,l:'1W'},{d:21,l:'1M'}].map(h=>(
                        <button key={h.d} onClick={()=>setBtHorizon(h.d)}
                          style={{padding:'0.35rem 0.65rem',borderRadius:6,border:`1px solid ${btHorizon===h.d?'#c41e3a':'rgba(255,255,255,0.08)'}`,background:btHorizon===h.d?'rgba(196,30,58,0.12)':'transparent',color:btHorizon===h.d?'#c41e3a':'#6b7f90',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.7rem'}}>
                          {h.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <button onClick={async()=>{
                    setBacktestLoading(true); setBacktestError(null); setBacktestResult(null)
                    try {
                      const res = await fetchFlask(`/api/backtest/${selected}`, {
                        method:'POST', headers:{'Content-Type':'application/json'},
                        body:JSON.stringify({startDate:btStartDate||undefined,endDate:btEndDate||undefined,horizonDays:btHorizon})
                      })
                      if(!res) throw new Error('API offline')
                      const data = await res.json()
                      if(data.error && !data.metrics?.total_trades) throw new Error(data.error)
                      setBacktestResult(data)
                    } catch(e) { setBacktestError(e.message) }
                    setBacktestLoading(false)
                  }}
                    disabled={backtestLoading}
                    style={{background:'linear-gradient(135deg,#c41e3a,#ff2d55)',color:'#fff',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',padding:'0.45rem 1.2rem',borderRadius:8,border:'none',cursor:backtestLoading?'wait':'pointer',fontSize:'0.78rem',opacity:backtestLoading?0.6:1}}>
                    {backtestLoading ? '⏳ Running...' : '🚀 Run Backtest'}
                  </button>
                </div>
              </div>

              {backtestLoading && (
                <div style={{textAlign:'center',padding:'2rem'}}>
                  <div style={{width:32,height:32,border:'3px solid rgba(196,30,58,0.2)',borderTopColor:'#c41e3a',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 0.75rem'}} />
                  <p style={{color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontSize:'0.82rem'}}>Running walk-forward simulation...</p>
                </div>
              )}

              {backtestError && <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:10,padding:'1rem',marginBottom:'1rem',color:'#ef4444',fontFamily:'Space Grotesk,sans-serif',fontSize:'0.8rem',fontWeight:600}}>⚠️ {backtestError}</div>}

              {backtestResult?.metrics && (()=>{
                const m = backtestResult.metrics
                const alpha = m.alpha_vs_bh || 0
                return (<>
                  {/* Metrics Cards */}
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(145px, 1fr))',gap:'0.7rem',marginBottom:'1.2rem'}}>
                    {[
                      ['Hit Rate', `${m.hit_rate}%`, m.hit_rate>=55?'#22c55e':m.hit_rate>=45?'#f0b429':'#ef4444', '🎯'],
                      ['Total Return', `${m.total_return_pct>=0?'+':''}${m.total_return_pct}%`, m.total_return_pct>=0?'#22c55e':'#ef4444', '💰'],
                      ['B&H Return', `${m.buy_hold_return_pct>=0?'+':''}${m.buy_hold_return_pct}%`, m.buy_hold_return_pct>=0?'#22c55e':'#ef4444', '📈'],
                      ['Alpha vs B&H', `${alpha>=0?'+':''}${alpha}%`, alpha>=0?'#22c55e':'#ef4444', '⚡'],
                      ['Sharpe Ratio', m.sharpe_ratio?.toFixed(2), m.sharpe_ratio>1?'#22c55e':m.sharpe_ratio>0?'#f0b429':'#ef4444', '📐'],
                      ['Max Drawdown', `${m.max_drawdown_pct}%`, m.max_drawdown_pct<10?'#22c55e':m.max_drawdown_pct<20?'#f0b429':'#ef4444', '📉'],
                      ['Win/Loss', m.win_loss_ratio, m.win_loss_ratio>1.5?'#22c55e':m.win_loss_ratio>1?'#f0b429':'#ef4444', '⚖️'],
                      ['Total Trades', m.total_trades, '#8899aa', '🔢'],
                    ].map(([label,value,color,icon])=>(
                      <div key={label} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:10,padding:'0.75rem 0.85rem'}}>
                        <div style={{fontSize:'0.58rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace',marginBottom:'0.3rem'}}>{icon} {label}</div>
                        <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.1rem',color:color}}>{value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Equity Curve */}
                  {backtestResult.equity_curve?.length > 0 && (
                    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,padding:'1rem',marginBottom:'1rem'}}>
                      <div style={{fontSize:'0.72rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,marginBottom:'0.6rem'}}>📈 Equity Curve (₹1L starting capital)</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <AreaChart data={backtestResult.equity_curve}>
                          <defs>
                            <linearGradient id="eqGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#c41e3a" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#c41e3a" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{fontSize:9,fill:'#4a5a6a'}} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                          <YAxis tick={{fontSize:9,fill:'#4a5a6a'}} axisLine={false} tickLine={false} domain={['auto','auto']}
                            tickFormatter={v=>`₹${(v/1000).toFixed(0)}k`} />
                          <Tooltip contentStyle={{background:'#1a1025',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontFamily:'Space Grotesk,sans-serif',fontSize:'0.72rem'}}
                            formatter={(v)=>[`₹${v.toLocaleString('en-IN')}`,'Equity']} />
                          <Area type="monotone" dataKey="equity" stroke="#c41e3a" strokeWidth={2} fill="url(#eqGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Signal Distribution */}
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0.5rem',marginBottom:'1rem'}}>
                    {[['BUY Signals',m.buy_signals,'#22c55e'],['SELL Signals',m.sell_signals,'#ef4444'],['HOLD Signals',m.hold_signals,'#f0b429']].map(([l,v,c])=>(
                      <div key={l} style={{background:`${c}08`,border:`1px solid ${c}20`,borderRadius:8,padding:'0.6rem',textAlign:'center'}}>
                        <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.2rem',color:c}}>{v||0}</div>
                        <div style={{fontSize:'0.6rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace'}}>{l}</div>
                      </div>
                    ))}
                  </div>

                  {/* Recent Trades */}
                  {backtestResult.trades?.length > 0 && (
                    <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,overflow:'hidden'}}>
                      <div style={{padding:'0.75rem 1rem',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:'0.72rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:'#e8edf2'}}>📋 Recent Trades (last {backtestResult.trades.length})</div>
                      <div style={{maxHeight:250,overflowY:'auto'}}>
                        <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.7rem',fontFamily:'Space Grotesk,sans-serif'}}>
                          <thead>
                            <tr style={{borderBottom:'1px solid rgba(255,255,255,0.06)'}}>
                              {['Date','Signal','Entry','Exit','Return','Correct'].map(h=>(
                                <th key={h} style={{padding:'0.45rem 0.6rem',textAlign:'left',color:'#4a5a6a',fontWeight:600,fontSize:'0.6rem',fontFamily:'JetBrains Mono,monospace'}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {backtestResult.trades.slice(-25).reverse().map((t,i)=>(
                              <tr key={i} style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                                <td style={{padding:'0.4rem 0.6rem',color:'#8899aa'}}>{t.date}</td>
                                <td style={{padding:'0.4rem 0.6rem'}}>
                                  <span style={{background:t.signal==='BUY'?'rgba(34,197,94,0.12)':t.signal==='SELL'?'rgba(239,68,68,0.12)':'rgba(240,180,41,0.12)',
                                    color:t.signal==='BUY'?'#22c55e':t.signal==='SELL'?'#ef4444':'#f0b429',
                                    padding:'0.15rem 0.4rem',borderRadius:4,fontWeight:700,fontSize:'0.62rem'}}>{t.signal}</span>
                                </td>
                                <td style={{padding:'0.4rem 0.6rem',color:'#8899aa'}}>₹{t.entry}</td>
                                <td style={{padding:'0.4rem 0.6rem',color:'#c8d4e0',fontWeight:600}}>₹{t.exit}</td>
                                <td style={{padding:'0.4rem 0.6rem',color:t.return_pct>=0?'#22c55e':'#ef4444',fontWeight:700}}>{t.return_pct>=0?'+':''}{t.return_pct}%</td>
                                <td style={{padding:'0.4rem 0.6rem'}}>{t.correct?'✅':'❌'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div style={{marginTop:'0.75rem',fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace',textAlign:'center'}}>
                    Backtest ran in {backtestResult.elapsed_ms}ms · {backtestResult.total_trading_days} trading days · {btHorizon}d horizon
                  </div>
                </>)
              })()}

              {!backtestResult && !backtestLoading && !backtestError && (
                <div style={{textAlign:'center',padding:'3rem',color:'#4a5a6a'}}>
                  <div style={{fontSize:'3rem',marginBottom:'0.75rem'}}>📊</div>
                  <p style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1rem',marginBottom:'0.3rem'}}>Walk-Forward Backtest</p>
                  <p style={{fontSize:'0.78rem',lineHeight:1.6}}>Select a date range and horizon, then run the backtest<br/>to see how the model's signals would have performed historically.</p>
                </div>
              )}
            </div>
          )}

          {/* SCAN TAB */}
          {activeTab==='scan'&&(
            <div style={{flex:1,overflowY:'auto',padding:'1.5rem'}}>
              {!scanning&&scanResults.length===0&&(
                <div style={{textAlign:'center',padding:'3rem',background:'#120a14',borderRadius:16,border:'1px solid rgba(255,255,255,0.07)',maxWidth:550,margin:'0 auto'}}>
                  <div style={{fontSize:'4rem',marginBottom:'1rem'}}>🔍</div>
                  <h2 style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,marginBottom:'0.5rem'}}>Scan NSE Stocks</h2>
                  <p style={{color:'#6b7f90',fontSize:'0.85rem',marginBottom:'1rem',lineHeight:1.7}}>
                    Runs <strong style={{color:'#ff2d55'}}>real ML analysis</strong> with real Yahoo Finance data.<br/>
                    Select how many stocks to scan (more = takes longer but more complete)
                  </p>
                  <div style={{display:'flex',justifyContent:'center',gap:'0.75rem',marginBottom:'1.5rem',flexWrap:'wrap'}}>
                    {[25,50,100,200].map(n=>(
                      <button key={n} onClick={()=>setScanLimit(n)}
                        style={{padding:'0.5rem 1rem',borderRadius:8,border:`1px solid ${scanLimit===n?'#c41e3a':'rgba(255,255,255,0.07)'}`,background:scanLimit===n?'rgba(196,30,58,0.1)':'transparent',color:scanLimit===n?'#c41e3a':'#6b7f90',cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.8rem'}}>
                        {n} stocks
                      </button>
                    ))}
                  </div>
                  <button onClick={runScan} disabled={displayList.length===0}
                    style={{background:'linear-gradient(135deg,#c41e3a,#ff2d55)',color:'#fff',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',fontSize:'1rem',padding:'0.85rem 2.5rem',borderRadius:10,border:'none',cursor:'pointer'}}>
                    🚀 Scan {Math.min(displayList.length,scanLimit)} Stocks from {selIndex}
                  </button>
                </div>
              )}
              {scanning&&(
                <div style={{textAlign:'center',padding:'4rem'}}>
                  <div style={{width:60,height:60,border:'3px solid rgba(196,30,58,0.2)',borderTopColor:'#c41e3a',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 1rem'}}/>
                  <p style={{color:'#c41e3a',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'1.1rem'}}>Scanning stocks with real data...</p>
                  <p style={{color:'#6b7f90',fontSize:'0.8rem',marginTop:'0.5rem'}}>Downloading real Yahoo Finance data + calculating real indicators</p>
                </div>
              )}
              {!scanning&&scanResults.length>0&&(
                <div>
                  <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'0.75rem'}}>
                    <button onClick={saveScanBatchToDb}
                      style={{background:'rgba(34,197,94,0.12)',border:'1px solid rgba(34,197,94,0.35)',color:'#22c55e',padding:'0.45rem 0.95rem',borderRadius:8,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.72rem'}}>
                      💾 Save All to DB
                    </button>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))',gap:'1rem',marginBottom:'1.5rem'}}>
                    {[['Scanned',scanResults.length,'#c41e3a'],['BUY',scanResults.filter(s=>s.signal==='BUY').length,'#22c55e'],['SELL',scanResults.filter(s=>s.signal==='SELL').length,'#ef4444'],['HOLD',scanResults.filter(s=>s.signal==='HOLD').length,'#f0b429']].map(([l,v,c])=>(
                      <div key={l} style={{background:'#120a14',border:`1px solid ${c}20`,borderRadius:10,padding:'1rem',textAlign:'center'}}>
                        <div style={{fontSize:'0.6rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,textTransform:'uppercase',marginBottom:'0.3rem'}}>{l}</div>
                        <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.5rem',color:c}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{background:'#120a14',border:'1px solid rgba(255,255,255,0.06)',borderRadius:12,overflow:'hidden'}}>
                    <div style={{overflowX:'auto'}}>
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.8rem'}}>
                        <thead>
                          <tr style={{background:'rgba(255,255,255,0.03)',borderBottom:'1px solid rgba(255,255,255,0.07)'}}>
                            {['#','Symbol','Price','Change','Signal','Confidence','RSI','MACD','Vol Ratio','Trend','Action'].map(h=>(
                              <th key={h} style={{padding:'0.75rem 0.85rem',textAlign:'left',color:'#6b7f90',fontSize:'0.62rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,textTransform:'uppercase',letterSpacing:'0.05em',whiteSpace:'nowrap'}}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {scanResults.map((s,i)=>(
                            <tr key={s.symbol} style={{borderBottom:'1px solid rgba(255,255,255,0.03)',background:i%2===0?'transparent':'rgba(255,255,255,0.01)'}}>
                              <td style={{padding:'0.6rem 0.85rem',color:'#4a5a6a',fontSize:'0.68rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:600}}>{i+1}</td>
                              <td style={{padding:'0.6rem 0.85rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'0.82rem'}}>{s.symbol}</td>
                              <td style={{padding:'0.6rem 0.85rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>₹{s.price}</td>
                              <td style={{padding:'0.6rem 0.85rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:s.changePercent>=0?'#22c55e':'#ef4444'}}>{s.changePercent>=0?'▲':'▼'}{Math.abs(s.changePercent).toFixed(2)}%</td>
                              <td style={{padding:'0.6rem 0.85rem'}}><SignalBadge signal={s.signal}/></td>
                              <td style={{padding:'0.6rem 0.85rem'}}>
                                <div style={{display:'flex',alignItems:'center',gap:'0.35rem'}}>
                                  <div style={{height:5,background:'rgba(255,255,255,0.06)',borderRadius:100,width:45,overflow:'hidden'}}>
                                    <div style={{height:'100%',width:`${s.confidence}%`,background:s.confidence>70?'#22c55e':s.confidence>55?'#f0b429':'#ef4444',borderRadius:100}}/>
                                  </div>
                                  <span style={{fontSize:'0.7rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>{s.confidence}%</span>
                                </div>
                              </td>
                              <td style={{padding:'0.6rem 0.85rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:s.rsi<30?'#22c55e':s.rsi>70?'#ef4444':'#f0b429'}}>{s.rsi}</td>
                              <td style={{padding:'0.6rem 0.85rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:s.macd>=0?'#22c55e':'#ef4444'}}>{s.macd}</td>
                              <td style={{padding:'0.6rem 0.85rem',color:'#8899aa'}}>{s.volumeRatio}x</td>
                              <td style={{padding:'0.6rem 0.85rem',width:90}}>
                                <AreaChart width={80} height={28} data={s.sparkline}>
                                  <Area dataKey="v" stroke={s.changePercent>=0?'#22c55e':'#ef4444'} strokeWidth={1.5} fill="rgba(0,0,0,0)" dot={false}/>
                                </AreaChart>
                              </td>
                              <td style={{padding:'0.6rem 0.85rem'}}>
                                <button onClick={()=>{setActiveTab('predict');runPrediction(s.symbol)}}
                                  style={{background:'rgba(196,30,58,0.1)',border:'1px solid rgba(196,30,58,0.2)',color:'#c41e3a',padding:'0.25rem 0.5rem',borderRadius:5,cursor:'pointer',fontSize:'0.62rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,whiteSpace:'nowrap'}}>
                                  🤖 Full ML
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div style={{marginTop:'1rem',textAlign:'center'}}>
                    <button onClick={()=>{setScanResults([])}}
                      style={{background:'rgba(196,30,58,0.1)',border:'1px solid rgba(196,30,58,0.2)',color:'#c41e3a',padding:'0.5rem 1.25rem',borderRadius:8,cursor:'pointer',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.8rem'}}>
                      🔄 New Scan
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes chatSlideIn{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes typingPulse{0%,80%,100%{opacity:0.3}40%{opacity:1}}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:2px}
        .tradingview-widget-copyright{display:none!important}
        .chat-input::placeholder{color:#4a5a6a}
        .chat-input:focus{outline:none;border-color:rgba(196,30,58,0.5)!important}
        .chat-msg-user{animation:chatSlideIn 0.2s ease}
        .chat-msg-ai{animation:chatSlideIn 0.2s ease}
      `}</style>

      {/* ── FLOATING AI CHAT BUTTON ── */}
      <button
        onClick={() => setChatOpen(o => !o)}
        title="Ask DEIMOS AI"
        style={{
          position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
          width: 52, height: 52, borderRadius: '50%',
          background: chatOpen ? '#0f0a12' : 'linear-gradient(135deg,#c41e3a,#ff2d55)',
          border: chatOpen ? '1px solid rgba(196,30,58,0.4)' : 'none',
          color: '#fff', fontSize: '1.3rem', cursor: 'pointer',
          boxShadow: '0 4px 24px rgba(196,30,58,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.25s',
        }}>
        {chatOpen ? '✕' : '💬'}
      </button>

      {/* ── FLOATING AI CHAT PANEL ── */}
      {chatOpen && (
        <div style={{
          position: 'fixed', bottom: '5rem', right: '1.5rem', zIndex: 9998,
          width: 360, height: 520, display: 'flex', flexDirection: 'column',
          background: '#0f0a12', border: '1px solid rgba(196,30,58,0.2)',
          borderRadius: 16, overflow: 'hidden',
          boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
          animation: 'chatSlideIn 0.25s ease',
        }}>
          {/* Header */}
          <div style={{ padding: '0.9rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0, background: 'rgba(196,30,58,0.06)' }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#c41e3a,#ff2d55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', flexShrink: 0 }}>🤖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'Space Grotesk,sans-serif', fontWeight: 700, fontSize: '0.82rem' }}>DEIMOS AI</div>
              <div style={{ fontSize: '0.58rem', color: '#6b7f90', fontFamily: 'JetBrains Mono,monospace' }}>
                {selected ? `Analyzing ${selected}` : 'NSE Market Assistant'} · GPT-OSS-120B
              </div>
            </div>
            {chatMessages.length > 0 && (
              <button onClick={() => setChatMessages([])} style={{ background: 'none', border: 'none', color: '#4a5a6a', cursor: 'pointer', fontSize: '0.65rem', fontFamily: 'Space Grotesk,sans-serif', padding: '0.2rem 0.4rem' }}>Clear</button>
            )}
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {chatMessages.length === 0 && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', padding: '1rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', opacity: 0.6 }}>🤖</div>
                <div style={{ fontFamily: 'Space Grotesk,sans-serif', fontWeight: 700, fontSize: '0.8rem', color: '#8899aa' }}>Ask me anything about{selected ? ` ${selected}` : ' NSE stocks'}</div>
                <div style={{ fontSize: '0.68rem', color: '#4a5a6a', lineHeight: 1.6 }}>I can fetch <strong style={{color:'#8899aa'}}>live data</strong> from NSE — price, financials, technicals, comparisons — and reason about it.</div>
                {/* Starter prompts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', width: '100%', marginTop: '0.5rem' }}>
                  {(selected
                    ? [
                        `What is ${selected}'s P/E ratio and market cap?`,
                        `Compare ${selected} with its sector peers`,
                        `How has ${selected} performed in the last 1 year?`,
                      ]
                    : [
                        'Compare RELIANCE vs TCS — which is better?',
                        'What is HDFCBANK\'s P/E ratio and fundamentals?',
                        'How has INFY performed in the last 6 months?',
                      ]
                  ).map(q => (
                    <button key={q} onClick={() => { setChatInput(q); chatInputRef.current?.focus() }}
                      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '0.4rem 0.7rem', color: '#6b7f90', fontSize: '0.68rem', cursor: 'pointer', textAlign: 'left', fontFamily: 'Inter,sans-serif', transition: 'all 0.15s' }}
                      onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(196,30,58,0.3)'; e.currentTarget.style.color = '#c8d4e0' }}
                      onMouseOut={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = '#6b7f90' }}>
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-ai'}
                style={{ display: 'flex', gap: '0.4rem', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                {msg.role === 'assistant' && (
                  <div style={{ width: 22, height: 22, borderRadius: 7, background: 'linear-gradient(135deg,#c41e3a,#ff2d55)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', flexShrink: 0, marginTop: 2 }}>🤖</div>
                )}
                <div style={{ maxWidth: '85%', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  {/* Tool badges — show what was fetched */}
                  {msg.role === 'assistant' && msg.tools?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {msg.tools.map((t, ti) => (
                        <span key={ti} style={{ background: 'rgba(196,30,58,0.12)', border: '1px solid rgba(196,30,58,0.2)', borderRadius: 20, padding: '0.15rem 0.5rem', fontSize: '0.6rem', color: '#c41e3a', fontFamily: 'Space Grotesk,sans-serif', fontWeight: 600 }}>
                          {TOOL_LABELS[t.name] || t.name}{t.args?.symbol ? ` · ${t.args.symbol}` : t.args?.symbol1 ? ` · ${t.args.symbol1} vs ${t.args.symbol2}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Fetching indicator */}
                  {msg.role === 'assistant' && msg.fetching && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.4rem 0.6rem', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '10px 10px 10px 4px' }}>
                      <span style={{ width: 10, height: 10, border: '2px solid rgba(196,30,58,0.3)', borderTopColor: '#c41e3a', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.68rem', color: '#6b7f90', fontFamily: 'Inter,sans-serif' }}>Fetching live data…</span>
                    </div>
                  )}
                  {/* Message bubble */}
                  {!msg.fetching && (
                    <div style={{
                      background: msg.role === 'user' ? 'rgba(196,30,58,0.15)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(196,30,58,0.25)' : 'rgba(255,255,255,0.06)'}`,
                      borderRadius: msg.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                      padding: '0.5rem 0.7rem', fontSize: '0.76rem',
                      fontFamily: 'Inter,sans-serif', lineHeight: 1.65,
                      color: msg.role === 'user' ? '#e8edf2' : '#c8d4e0',
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    }}>
                      {msg.content || (chatStreaming && i === chatMessages.length - 1 ? (
                        <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', padding: '0.15rem 0' }}>
                          {[0, 1, 2].map(d => <span key={d} style={{ width: 5, height: 5, borderRadius: '50%', background: '#c41e3a', display: 'inline-block', animation: `typingPulse 1.2s ${d * 0.2}s infinite` }} />)}
                        </span>
                      ) : '…')}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={sendChatMessage} style={{ padding: '0.6rem', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: '0.4rem', flexShrink: 0, background: 'rgba(0,0,0,0.2)' }}>
            <input
              ref={chatInputRef}
              className="chat-input"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={selected ? `Ask about ${selected}…` : 'Ask about NSE stocks…'}
              disabled={chatStreaming}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage() } }}
              style={{ flex: 1, background: '#120a14', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf2', padding: '0.5rem 0.75rem', borderRadius: 9, fontSize: '0.78rem', fontFamily: 'Inter,sans-serif' }}
            />
            <button type="submit" disabled={!chatInput.trim() || chatStreaming}
              style={{ background: chatInput.trim() && !chatStreaming ? 'linear-gradient(135deg,#c41e3a,#ff2d55)' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 9, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: chatInput.trim() && !chatStreaming ? 'pointer' : 'default', flexShrink: 0, transition: 'all 0.15s' }}>
              {chatStreaming
                ? <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M22 2L11 13M22 2L15 22l-4-9-9-4 20-7z"/></svg>
              }
            </button>
          </form>
        </div>
      )}
    </main>
  )
}