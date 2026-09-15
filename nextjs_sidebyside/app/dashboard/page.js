'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import DeimosNav from '../../components/DeimosNav'
import '../deimos-app.css'
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer
} from 'recharts'

const FLASK = ['http://127.0.0.1:5000','http://localhost:5000']

async function fetchFlask(path) {
  for (const base of FLASK) {
    try { const r = await fetch(`${base}${path}`, {timeout:15000}); if(r.ok) return r } catch {}
  }
  return null
}
async function fetchJson(path, opts) {
  for (const base of FLASK) {
    try { const r = await fetch(`${base}${path}`, opts); if(r.ok) return r.json() } catch {}
  }
  return null
}

export default function DashboardPage() {
  const [macro, setMacro] = useState(null)
  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [apiStatus, setApiStatus] = useState('checking')

  useEffect(() => {
    loadDashboard()
  }, [])

  async function loadDashboard() {
    setLoading(true); setError(null)
    try {
      const [macroRes, sectorRes] = await Promise.all([
        fetchJson('/api/market/overview'),
        fetchJson('/api/market/sector-heatmap'),
      ])
      if (macroRes) { setMacro(macroRes); setApiStatus('online') }
      else { setApiStatus('offline'); setError('Cannot reach Flask API') }
      if (sectorRes?.sectors) setSectors(sectorRes.sectors)
    } catch (e) {
      setError(e.message); setApiStatus('offline')
    }
    setLoading(false)
  }

  const mkCard = (title, value, sub, color, icon) => (
    <div key={title} style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'1.2rem 1.4rem',minWidth:180,flex:'1 1 200px',transition:'all 0.3s',cursor:'default'}}
      onMouseOver={e=>{e.currentTarget.style.borderColor='rgba(196,30,58,0.3)';e.currentTarget.style.transform='translateY(-2px)'}}
      onMouseOut={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';e.currentTarget.style.transform='translateY(0)'}}>
      <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'0.6rem'}}>
        <span style={{fontSize:'1.2rem'}}>{icon}</span>
        <span style={{fontSize:'0.68rem',color:'#6b7f90',fontFamily:'JetBrains Mono,monospace',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}}>{title}</span>
      </div>
      <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.6rem',color:'#e8edf2',lineHeight:1.2}}>
        {value || '—'}
      </div>
      {sub && <div style={{fontSize:'0.72rem',color:color||'#6b7f90',fontWeight:600,marginTop:'0.25rem',fontFamily:'Space Grotesk,sans-serif'}}>{sub}</div>}
    </div>
  )

  const signalColor = (label) => label==='Bullish'?'#22c55e':label==='Bearish'?'#ef4444':'#f0b429'

  return (
    <main style={{background:'#0a0612',minHeight:'100vh',color:'#e8edf2'}}>
      <DeimosNav active="dashboard" apiStatus={apiStatus} />

      <div style={{maxWidth:1280,margin:'0 auto',padding:'5.5rem 1.5rem 3rem'}}>
        {/* Header */}
        <div style={{marginBottom:'2rem'}}>
          <h1 style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:800,fontSize:'1.8rem',
            background:'linear-gradient(135deg,#e8edf2,#c41e3a)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:'0.4rem'}}>
            Market Dashboard
          </h1>
          <p style={{color:'#6b7f90',fontSize:'0.82rem',fontFamily:'Inter,sans-serif'}}>
            Real-time Indian market intelligence powered by AI
          </p>
        </div>

        {loading && (
          <div style={{textAlign:'center',padding:'4rem 0'}}>
            <div style={{width:32,height:32,border:'3px solid rgba(196,30,58,0.2)',borderTopColor:'#c41e3a',borderRadius:'50%',animation:'spin 0.8s linear infinite',margin:'0 auto 1rem'}} />
            <p style={{color:'#6b7f90',fontFamily:'Space Grotesk,sans-serif',fontSize:'0.85rem'}}>Loading market data...</p>
          </div>
        )}

        {error && !loading && (
          <div style={{background:'rgba(239,68,68,0.08)',border:'1px solid rgba(239,68,68,0.2)',borderRadius:12,padding:'1.5rem',textAlign:'center',marginBottom:'2rem'}}>
            <p style={{color:'#ef4444',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',marginBottom:'0.5rem'}}>⚠️ {error}</p>
            <p style={{color:'#8899aa',fontSize:'0.78rem'}}>Make sure Flask API is running on port 5000</p>
            <button onClick={loadDashboard} style={{background:'rgba(196,30,58,0.15)',border:'1px solid rgba(196,30,58,0.3)',color:'#c41e3a',padding:'0.4rem 1rem',borderRadius:8,cursor:'pointer',fontWeight:700,fontFamily:'Space Grotesk,sans-serif',fontSize:'0.75rem',marginTop:'0.75rem'}}>Retry</button>
          </div>
        )}

        {macro && !loading && (<>
          {/* Market Overview Cards */}
          <div style={{display:'flex',flexWrap:'wrap',gap:'1rem',marginBottom:'2rem'}}>
            {mkCard('NIFTY 50', macro.nifty50?.value?.toLocaleString('en-IN'), 
              macro.nifty50?.change_pct ? `${macro.nifty50.change_pct>0?'▲':'▼'} ${Math.abs(macro.nifty50.change_pct).toFixed(2)}%` : null,
              macro.nifty50?.change_pct>0?'#22c55e':'#ef4444', '📈')}
            {mkCard('NIFTY BANK', macro.niftyBank?.value?.toLocaleString('en-IN'),
              macro.niftyBank?.change_pct ? `${macro.niftyBank.change_pct>0?'▲':'▼'} ${Math.abs(macro.niftyBank.change_pct).toFixed(2)}%` : null,
              macro.niftyBank?.change_pct>0?'#22c55e':'#ef4444', '🏦')}
            {mkCard('INDIA VIX', macro.indiaVix?.value?.toFixed(2),
              macro.indiaVix?.value<16?'Low fear':'Elevated fear',
              macro.indiaVix?.value<16?'#22c55e':macro.indiaVix?.value>22?'#ef4444':'#f0b429', '⚡')}
            {mkCard('USD/INR', macro.usdInr?.value?.toFixed(2),
              macro.usdInr?.change_pct ? `${macro.usdInr.change_pct>0?'▲':'▼'} ${Math.abs(macro.usdInr.change_pct).toFixed(2)}%` : null,
              macro.usdInr?.change_pct>0?'#ef4444':'#22c55e', '💱')}
            {mkCard('CRUDE OIL', `$${macro.crudeOil?.value?.toFixed(2)||'—'}`,
              macro.crudeOil?.change_pct ? `${macro.crudeOil.change_pct>0?'▲':'▼'} ${Math.abs(macro.crudeOil.change_pct).toFixed(2)}%` : null,
              macro.crudeOil?.change_pct>0?'#ef4444':'#22c55e', '🛢️')}
            {mkCard('GOLD', `$${macro.gold?.value?.toFixed(0)||'—'}`,
              macro.gold?.change_pct ? `${macro.gold.change_pct>0?'▲':'▼'} ${Math.abs(macro.gold.change_pct).toFixed(2)}%` : null,
              macro.gold?.change_pct>0?'#22c55e':'#ef4444', '🥇')}
          </div>

          {/* Macro Signals + Sector Heatmap Row */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1.5rem',marginBottom:'2rem'}}>
            {/* Macro Signals */}
            <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'1.5rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem'}}>
                <span style={{fontSize:'1rem'}}>🌍</span>
                <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',color:'#e8edf2'}}>Macro Signals</span>
                <span style={{marginLeft:'auto',fontSize:'0.6rem',fontFamily:'JetBrains Mono,monospace',color:signalColor(macro.macroLabel),fontWeight:700,background:`${signalColor(macro.macroLabel)}15`,padding:'0.15rem 0.5rem',borderRadius:20,border:`1px solid ${signalColor(macro.macroLabel)}30`}}>{macro.macroLabel}</span>
              </div>
              {macro.macroSignals && Object.entries(macro.macroSignals).map(([key, sig]) => (
                <div key={key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0.45rem 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                  <span style={{fontSize:'0.72rem',color:'#8899aa',fontFamily:'Space Grotesk,sans-serif',fontWeight:600,textTransform:'capitalize'}}>{key.replace(/_/g,' ')}</span>
                  <div style={{display:'flex',alignItems:'center',gap:'0.4rem'}}>
                    <span style={{fontSize:'0.65rem',color:'#6b7f90',fontFamily:'Inter,sans-serif',maxWidth:200,textAlign:'right'}}>{sig.label}</span>
                    <span style={{width:8,height:8,borderRadius:'50%',background:sig.score>0.1?'#22c55e':sig.score<-0.1?'#ef4444':'#f0b429',flexShrink:0}} />
                  </div>
                </div>
              ))}
              {macro.staticMacro && (
                <div style={{marginTop:'0.75rem',padding:'0.6rem',background:'rgba(255,255,255,0.02)',borderRadius:8}}>
                  <div style={{fontSize:'0.6rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace',marginBottom:'0.3rem'}}>STATIC MACRO DATA</div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'0.4rem'}}>
                    {[['RBI Rate',`${macro.staticMacro.rbi_repo_rate}%`],['CPI',`${macro.staticMacro.cpi_inflation}%`],['GDP',`${macro.staticMacro.gdp_growth}%`]].map(([k,v])=>(
                      <div key={k} style={{textAlign:'center'}}>
                        <div style={{fontSize:'0.82rem',fontWeight:700,color:'#e8edf2',fontFamily:'Space Grotesk,sans-serif'}}>{v}</div>
                        <div style={{fontSize:'0.55rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>{k}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sector Heatmap */}
            <div style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'1.5rem'}}>
              <div style={{display:'flex',alignItems:'center',gap:'0.5rem',marginBottom:'1rem'}}>
                <span style={{fontSize:'1rem'}}>🔥</span>
                <span style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.85rem',color:'#e8edf2'}}>Sector Performance</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'0.6rem'}}>
                {sectors.map(s => {
                  const c = s.changePct>0.5?'#22c55e':s.changePct<-0.5?'#ef4444':'#f0b429'
                  const bg = s.changePct>0.5?'rgba(34,197,94,0.08)':s.changePct<-0.5?'rgba(239,68,68,0.08)':'rgba(240,180,41,0.06)'
                  return (
                    <div key={s.sector} style={{background:bg,border:`1px solid ${c}20`,borderRadius:10,padding:'0.7rem 0.85rem',transition:'all 0.2s'}}
                      onMouseOver={e=>{e.currentTarget.style.transform='scale(1.02)';e.currentTarget.style.borderColor=`${c}50`}}
                      onMouseOut={e=>{e.currentTarget.style.transform='scale(1)';e.currentTarget.style.borderColor=`${c}20`}}>
                      <div style={{fontSize:'0.68rem',fontFamily:'Space Grotesk,sans-serif',fontWeight:700,color:'#c8d4e0',marginBottom:'0.2rem'}}>{s.sector.replace('NIFTY ','')}</div>
                      <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
                        <span style={{fontSize:'0.85rem',fontWeight:800,color:'#e8edf2',fontFamily:'Space Grotesk,sans-serif'}}>{s.value?.toLocaleString('en-IN')||'—'}</span>
                        <span style={{fontSize:'0.72rem',fontWeight:700,color:c,fontFamily:'Space Grotesk,sans-serif'}}>{s.changePct>0?'▲':'▼'} {Math.abs(s.changePct).toFixed(2)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{display:'flex',flexWrap:'wrap',gap:'1rem',marginBottom:'2rem'}}>
            {[
              {icon:'🤖',label:'AI Predict',desc:'Run ML analysis on any stock',href:'/predict'},
              {icon:'💼',label:'Portfolio',desc:'Track your holdings & P&L',href:'/portfolio'},
              {icon:'🔎',label:'Market Scanner',desc:'Scan 2000+ NSE stocks',href:'/predict'},
            ].map(a=>(
              <Link key={a.label} href={a.href} style={{textDecoration:'none',flex:'1 1 250px',background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.06)',borderRadius:14,padding:'1.2rem 1.4rem',transition:'all 0.3s',cursor:'pointer',display:'block'}}
                onMouseOver={e=>{e.currentTarget.style.borderColor='rgba(196,30,58,0.4)';e.currentTarget.style.background='rgba(196,30,58,0.06)';e.currentTarget.style.transform='translateY(-3px)'}}
                onMouseOut={e=>{e.currentTarget.style.borderColor='rgba(255,255,255,0.06)';e.currentTarget.style.background='rgba(255,255,255,0.03)';e.currentTarget.style.transform='translateY(0)'}}>
                <div style={{fontSize:'1.5rem',marginBottom:'0.4rem'}}>{a.icon}</div>
                <div style={{fontFamily:'Space Grotesk,sans-serif',fontWeight:700,fontSize:'0.9rem',color:'#e8edf2',marginBottom:'0.2rem'}}>{a.label}</div>
                <div style={{fontSize:'0.7rem',color:'#6b7f90',fontFamily:'Inter,sans-serif'}}>{a.desc}</div>
              </Link>
            ))}
          </div>

          {/* Footer Note */}
          <div style={{textAlign:'center',padding:'2rem 0',borderTop:'1px solid rgba(255,255,255,0.04)'}}>
            <p style={{fontSize:'0.65rem',color:'#4a5a6a',fontFamily:'JetBrains Mono,monospace'}}>
              Data refreshes every hour · Powered by Yahoo Finance + NSE India · Not financial advice
            </p>
          </div>
        </>)}
      </div>

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (max-width: 768px) {
          div[style*="gridTemplateColumns: 1fr 1fr"] { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  )
}
