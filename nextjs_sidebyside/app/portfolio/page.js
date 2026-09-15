'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import DeimosNav from '../../components/DeimosNav'
import '../deimos-app.css'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const FLASK = ['http://127.0.0.1:5000','http://localhost:5000']
const COLORS = ['#c41e3a','#8b5cf6','#22c55e','#f0b429','#3b82f6','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16']

async function fetchJson(path, opts) {
  for (const base of FLASK) {
    try { const r = await fetch(`${base}${path}`, opts); if(r.ok) return r.json() } catch {}
  }
  return null
}

function loadLocal(key, def) { try { return JSON.parse(localStorage.getItem(key)) || def } catch { return def } }
function saveLocal(key, val) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }

export default function PortfolioPage() {
  // Watchlist
  const [watchlist, setWatchlist] = useState([])
  const [watchPrices, setWatchPrices] = useState({})
  const [watchInput, setWatchInput] = useState('')
  // Portfolio
  const [holdings, setHoldings] = useState([])
  const [holdingPrices, setHoldingPrices] = useState({})
  const [showAddForm, setShowAddForm] = useState(false)
  const [addSymbol, setAddSymbol] = useState('')
  const [addQty, setAddQty] = useState('')
  const [addAvg, setAddAvg] = useState('')
  // Tab
  const [activeTab, setActiveTab] = useState('watchlist')
  const [loading, setLoading] = useState(false)
  const [apiStatus, setApiStatus] = useState('checking')

  useEffect(() => {
    const wl = loadLocal('deimos_watchlist_v2', ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK'])
    const hl = loadLocal('deimos_holdings', [])
    setWatchlist(wl)
    setHoldings(hl)
  }, [])

  useEffect(() => {
    if (watchlist.length) refreshWatchPrices()
  }, [watchlist])

  useEffect(() => {
    if (holdings.length) refreshHoldingPrices()
  }, [holdings])

  async function refreshWatchPrices() {
    setLoading(true)
    const d = await fetchJson('/api/watchlist/prices', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ symbols: watchlist })
    })
    if (d?.prices) { setWatchPrices(d.prices); setApiStatus('online') }
    else setApiStatus('offline')
    setLoading(false)
  }

  async function refreshHoldingPrices() {
    const syms = holdings.map(h=>h.symbol)
    if (!syms.length) return
    const d = await fetchJson('/api/watchlist/prices', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ symbols: syms })
    })
    if (d?.prices) setHoldingPrices(d.prices)
  }

  function addToWatchlist() {
    const sym = watchInput.toUpperCase().trim()
    if (!sym || watchlist.includes(sym)) return
    const nw = [...watchlist, sym]
    setWatchlist(nw); saveLocal('deimos_watchlist_v2', nw)
    setWatchInput('')
  }

  function removeFromWatchlist(sym) {
    const nw = watchlist.filter(s=>s!==sym)
    setWatchlist(nw); saveLocal('deimos_watchlist_v2', nw)
  }

  function addHolding() {
    const sym = addSymbol.toUpperCase().trim()
    const qty = parseFloat(addQty)
    const avg = parseFloat(addAvg)
    if (!sym || !qty || !avg) return
    const nh = [...holdings, { symbol: sym, qty, avgPrice: avg, addedAt: new Date().toISOString() }]
    setHoldings(nh); saveLocal('deimos_holdings', nh)
    setAddSymbol(''); setAddQty(''); setAddAvg(''); setShowAddForm(false)
  }

  function removeHolding(idx) {
    const nh = holdings.filter((_,i)=>i!==idx)
    setHoldings(nh); saveLocal('deimos_holdings', nh)
  }

  // Portfolio metrics
  const totalInvested = holdings.reduce((s,h)=>s+h.qty*h.avgPrice, 0)
  const totalCurrent = holdings.reduce((s,h)=>{
    const p = holdingPrices[h.symbol]?.price
    return s + (p ? h.qty * p : h.qty * h.avgPrice)
  }, 0)
  const totalPnl = totalCurrent - totalInvested
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested * 100) : 0

  // Sector allocation (approximate — group by first 3 chars)
  const sectorMap = {}
  holdings.forEach(h => {
    const key = h.symbol.slice(0,4)
    sectorMap[key] = (sectorMap[key]||0) + h.qty * h.avgPrice
  })
  const pieData = Object.entries(sectorMap).map(([k,v])=>({name:k,value:Math.round(v)}))

  const inputStyle = {background:'#120a14',border:'1px solid rgba(255,255,255,0.1)',color:'#e8edf2',padding:'0.45rem 0.75rem',borderRadius:8,fontSize:'0.78rem',fontFamily:'Space Grotesk,sans-serif',outline:'none',width:'100%'}
  const btnPrimary = {background:'linear-gradient(135deg,#c41e3a,#ff2d55)',color:'#fff',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',padding:'0.45rem 1rem',borderRadius:8,border:'none',cursor:'pointer',fontSize:'0.75rem'}

  return (
    <main style={{background:'#0a0612',minHeight:'100vh',color:'#e8edf2'}}>
      <DeimosNav active="portfolio" apiStatus={apiStatus} />

      <div style={{maxWidth:1200,margin:'0 auto',padding:'5.5rem 1.5rem 3rem'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'2rem',flexWrap:'wrap',gap:'1rem'}}>
          <div>
            <h1 style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.8rem',
              background:'linear-gradient(135deg,#e8edf2,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:'0.3rem'}}>
              Portfolio & Watchlist
            </h1>
            <p style={{color:'#6b7f90',fontSize:'0.78rem',fontFamily:'Inter,sans-serif'}}>Track your holdings, monitor your watchlist, analyze sector exposure</p>
          </div>
          {holdings.length > 0 && (
            <div style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>INVESTED</div>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.2rem'}}>₹{totalInvested.toLocaleString('en-IN',{maximumFractionDigits:0})}</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>CURRENT</div>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.2rem'}}>₹{totalCurrent.toLocaleString('en-IN',{maximumFractionDigits:0})}</div>
              </div>
              <div style={{textAlign:'center'}}>
                <div style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>P&L</div>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.2rem',color:totalPnl>=0?'#22c55e':'#ef4444'}}>
                  {totalPnl>=0?'+':''}₹{Math.abs(totalPnl).toLocaleString('en-IN',{maximumFractionDigits:0})} ({totalPnlPct>=0?'+':''}{totalPnlPct.toFixed(2)}%)
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.5rem'}}>
          {[['watchlist','👁️ Watchlist'],['portfolio','💼 Portfolio'],['analytics','📊 Analytics']].map(([id,label])=>(
            <button key={id} onClick={()=>setActiveTab(id)}
              style={{padding:'0.5rem 1.2rem',background:activeTab===id?'rgba(196,30,58,0.15)':'rgba(255,255,255,0.03)',
                border:`1px solid ${activeTab===id?'rgba(196,30,58,0.4)':'rgba(255,255,255,0.06)'}`,
                color:activeTab===id?'#c41e3a':'#6b7f90',borderRadius:10,cursor:'pointer',
                fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.75rem',transition:'all 0.2s'}}>
              {label}
            </button>
          ))}
        </div>

        {/* WATCHLIST TAB */}
        {activeTab==='watchlist' && (
          <div>
            <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.5rem'}}>
              <input value={watchInput} onChange={e=>setWatchInput(e.target.value)} placeholder="Add symbol (e.g. TATAMOTORS)"
                onKeyDown={e=>{if(e.key==='Enter') addToWatchlist()}}
                style={{...inputStyle,maxWidth:280}} />
              <button onClick={addToWatchlist} style={btnPrimary}>+ Add</button>
              <button onClick={refreshWatchPrices} style={{...btnPrimary,background:'rgba(139,92,246,0.15)',color:'#8b5cf6',border:'1px solid rgba(139,92,246,0.3)'}}>🔄 Refresh</button>
            </div>

            {loading && <p style={{color:'#6b7f90',fontSize:'0.8rem',fontFamily:'Space Grotesk,sans-serif'}}>Loading prices...</p>}

            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))',gap:'1rem'}}>
              {watchlist.map(sym => {
                const p = watchPrices[sym]
                const up = p?.changePct > 0
                return (
                  <div key={sym} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'1rem 1.2rem',transition:'all 0.3s',cursor:'pointer',position:'relative'}}
                    onMouseOver={e=>{e.currentTarget.style.borderColor='rgba(139,92,246,0.3)';e.currentTarget.style.transform='translateY(-2px)'}}
                    onMouseOut={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';e.currentTarget.style.transform='translateY(0)'}}>
                    <button onClick={()=>removeFromWatchlist(sym)} style={{position:'absolute',top:8,right:8,background:'none',border:'none',color:'#4a5a6a',cursor:'pointer',fontSize:'0.8rem',padding:'0.2rem'}}>✕</button>
                    <Link href={`/predict?symbol=${sym}`} style={{textDecoration:'none',color:'inherit'}}>
                      <div style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,fontSize:'0.82rem',color:'#e8edf2',marginBottom:'0.4rem'}}>{sym}</div>
                      <div style={{display:'flex',alignItems:'baseline',gap:'0.5rem'}}>
                        <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.3rem'}}>
                          {p?.price ? `₹${p.price.toLocaleString('en-IN')}` : '—'}
                        </span>
                        {p?.changePct != null && (
                          <span style={{fontSize:'0.72rem',fontWeight:700,color:up?'#22c55e':'#ef4444',fontFamily:'Space Grotesk,sans-serif'}}>
                            {up?'▲':'▼'} {Math.abs(p.changePct).toFixed(2)}%
                          </span>
                        )}
                      </div>
                    </Link>
                  </div>
                )
              })}
            </div>
            {watchlist.length===0 && (
              <div style={{textAlign:'center',padding:'3rem 0',color:'#4a5a6a'}}>
                <p style={{fontSize:'1.5rem',marginBottom:'0.5rem'}}>👁️</p>
                <p style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>Your watchlist is empty</p>
                <p style={{fontSize:'0.78rem',marginTop:'0.3rem'}}>Add stock symbols above to track them</p>
              </div>
            )}
          </div>
        )}

        {/* PORTFOLIO TAB */}
        {activeTab==='portfolio' && (
          <div>
            <div style={{display:'flex',gap:'0.5rem',marginBottom:'1.5rem'}}>
              <button onClick={()=>setShowAddForm(!showAddForm)} style={btnPrimary}>{showAddForm?'Cancel':'+ Add Holding'}</button>
              {holdings.length>0 && <button onClick={refreshHoldingPrices} style={{...btnPrimary,background:'rgba(139,92,246,0.15)',color:'#8b5cf6',border:'1px solid rgba(139,92,246,0.3)'}}>🔄 Refresh Prices</button>}
            </div>

            {showAddForm && (
              <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:12,padding:'1.2rem',marginBottom:'1.5rem',display:'flex',gap:'0.75rem',flexWrap:'wrap',alignItems:'end'}}>
                <div style={{flex:'1 1 160px'}}>
                  <label style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',display:'block',marginBottom:'0.25rem'}}>SYMBOL</label>
                  <input value={addSymbol} onChange={e=>setAddSymbol(e.target.value)} placeholder="e.g. RELIANCE" style={inputStyle} />
                </div>
                <div style={{flex:'1 1 120px'}}>
                  <label style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',display:'block',marginBottom:'0.25rem'}}>QUANTITY</label>
                  <input value={addQty} onChange={e=>setAddQty(e.target.value)} placeholder="e.g. 10" type="number" style={inputStyle} />
                </div>
                <div style={{flex:'1 1 120px'}}>
                  <label style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',display:'block',marginBottom:'0.25rem'}}>AVG PRICE (₹)</label>
                  <input value={addAvg} onChange={e=>setAddAvg(e.target.value)} placeholder="e.g. 2850" type="number" style={inputStyle} />
                </div>
                <button onClick={addHolding} style={btnPrimary}>Add</button>
              </div>
            )}

            {holdings.length > 0 ? (
              <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr 1fr 0.5fr',padding:'0.7rem 1.2rem',background:'rgba(255,255,255,0.02)',borderBottom:'1px solid rgba(255,255,255,0.06)',fontSize:'0.6rem',fontFamily:'JetBrains Mono,monospace',color:'#4a5a6a',fontWeight:700}}>
                  <span>SYMBOL</span><span>QTY</span><span>AVG</span><span>CMP</span><span>INVESTED</span><span>P&L</span><span></span>
                </div>
                {holdings.map((h, i) => {
                  const p = holdingPrices[h.symbol]?.price || h.avgPrice
                  const invested = h.qty * h.avgPrice
                  const current = h.qty * p
                  const pnl = current - invested
                  const pnlPct = invested > 0 ? (pnl / invested * 100) : 0
                  const up = pnl >= 0
                  return (
                    <div key={i} style={{display:'grid',gridTemplateColumns:'1.5fr 1fr 1fr 1fr 1fr 1fr 0.5fr',padding:'0.75rem 1.2rem',borderBottom:'1px solid rgba(255,255,255,0.03)',alignItems:'center',fontSize:'0.78rem',transition:'background 0.2s'}}
                      onMouseOver={e=>{e.currentTarget.style.background='rgba(255,255,255,0.02)'}}
                      onMouseOut={e=>{e.currentTarget.style.background='transparent'}}>
                      <Link href={`/predict?symbol=${h.symbol}`} style={{fontFamily:'JetBrains Mono,monospace',fontWeight:700,color:'#e8edf2',textDecoration:'none'}}>{h.symbol}</Link>
                      <span style={{color:'#8899aa',fontFamily:'Space Grotesk,sans-serif'}}>{h.qty}</span>
                      <span style={{color:'#8899aa',fontFamily:'Space Grotesk,sans-serif'}}>₹{h.avgPrice.toLocaleString('en-IN')}</span>
                      <span style={{color:'#e8edf2',fontWeight:700,fontFamily:'Space Grotesk,sans-serif'}}>₹{p.toLocaleString('en-IN')}</span>
                      <span style={{color:'#8899aa',fontFamily:'Space Grotesk,sans-serif'}}>₹{invested.toLocaleString('en-IN',{maximumFractionDigits:0})}</span>
                      <span style={{color:up?'#22c55e':'#ef4444',fontWeight:700,fontFamily:'Space Grotesk,sans-serif'}}>
                        {up?'+':''}₹{Math.abs(pnl).toLocaleString('en-IN',{maximumFractionDigits:0})} <span style={{fontSize:'0.65rem'}}>({pnlPct>=0?'+':''}{pnlPct.toFixed(1)}%)</span>
                      </span>
                      <button onClick={()=>removeHolding(i)} style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.2)',color:'#ef4444',borderRadius:6,padding:'0.2rem 0.5rem',cursor:'pointer',fontSize:'0.6rem',fontWeight:700,fontFamily:'Space Grotesk,sans-serif'}}>✕</button>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div style={{textAlign:'center',padding:'3rem 0',color:'#4a5a6a'}}>
                <p style={{fontSize:'1.5rem',marginBottom:'0.5rem'}}>💼</p>
                <p style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>No holdings yet</p>
                <p style={{fontSize:'0.78rem',marginTop:'0.3rem'}}>Add your stock holdings to track P&L</p>
              </div>
            )}
          </div>
        )}

        {/* ANALYTICS TAB */}
        {activeTab==='analytics' && (
          <div>
            {holdings.length === 0 ? (
              <div style={{textAlign:'center',padding:'3rem 0',color:'#4a5a6a'}}>
                <p style={{fontSize:'1.5rem',marginBottom:'0.5rem'}}>📊</p>
                <p style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700}}>Add holdings to see analytics</p>
              </div>
            ) : (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem'}}>
                {/* Allocation Chart */}
                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'1.5rem'}}>
                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'1rem',color:'#e8edf2'}}>📊 Allocation by Stock</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={holdings.map((h,i)=>({name:h.symbol,value:Math.round(h.qty*h.avgPrice)}))} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {holdings.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={{background:'#1a1025',border:'1px solid rgba(255,255,255,0.1)',borderRadius:8,fontFamily:'Space Grotesk,sans-serif',fontSize:'0.75rem'}} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'0.5rem',justifyContent:'center',marginTop:'0.5rem'}}>
                    {holdings.map((h,i)=>(
                      <span key={h.symbol} style={{display:'flex',alignItems:'center',gap:'0.25rem',fontSize:'0.65rem',color:'#8899aa',fontFamily:'Space Grotesk,sans-serif'}}>
                        <span style={{width:8,height:8,borderRadius:2,background:COLORS[i%COLORS.length],display:'inline-block'}} />
                        {h.symbol}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Summary Stats */}
                <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'1.5rem'}}>
                  <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',marginBottom:'1rem',color:'#e8edf2'}}>📋 Portfolio Summary</div>
                  {[
                    ['Total Holdings', holdings.length],
                    ['Total Invested', `₹${totalInvested.toLocaleString('en-IN',{maximumFractionDigits:0})}`],
                    ['Current Value', `₹${totalCurrent.toLocaleString('en-IN',{maximumFractionDigits:0})}`],
                    ['Total P&L', `${totalPnl>=0?'+':''}₹${Math.abs(totalPnl).toLocaleString('en-IN',{maximumFractionDigits:0})}`, totalPnl>=0?'#22c55e':'#ef4444'],
                    ['Return %', `${totalPnlPct>=0?'+':''}${totalPnlPct.toFixed(2)}%`, totalPnlPct>=0?'#22c55e':'#ef4444'],
                    ['Best Holding', holdings.length ? holdings.reduce((best,h)=>{
                      const p=holdingPrices[h.symbol]?.price||h.avgPrice; const r=(p-h.avgPrice)/h.avgPrice*100
                      return r > (best.r||0) ? {sym:h.symbol,r} : best
                    },{sym:'—',r:0}).sym : '—'],
                    ['Worst Holding', holdings.length ? holdings.reduce((worst,h)=>{
                      const p=holdingPrices[h.symbol]?.price||h.avgPrice; const r=(p-h.avgPrice)/h.avgPrice*100
                      return r < (worst.r||999) ? {sym:h.symbol,r} : worst
                    },{sym:'—',r:999}).sym : '—'],
                  ].map(([label, value, color]) => (
                    <div key={label} style={{display:'flex',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                      <span style={{fontSize:'0.72rem',color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif'}}>{label}</span>
                      <span style={{fontSize:'0.78rem',fontWeight:700,color:color||'#e8edf2',fontFamily:'Space Grotesk,sans-serif'}}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
          div[style*="gridTemplateColumns: 1.5fr"] { font-size: 0.7rem !important; }
        }
      `}</style>
    </main>
  )
}
