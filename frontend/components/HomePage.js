'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import DeimosNav from './DeimosNav'
import '../app/home.css'
import '../app/deimos-app.css'

const STOCKS = [
  { sym: 'RELIANCE', p: '2,847', ch: '+1.32%', up: true },
  { sym: 'TCS', p: '3,920', ch: '+0.87%', up: true },
  { sym: 'HDFCBANK', p: '1,723', ch: '+2.10%', up: true },
  { sym: 'INFY', p: '1,956', ch: '+1.73%', up: true },
  { sym: 'BAJFINANCE', p: '6,890', ch: '-0.82%', up: false },
  { sym: 'WIPRO', p: '478', ch: '-1.21%', up: false },
  { sym: 'ADANIENT', p: '2,340', ch: '+0.44%', up: true },
  { sym: 'MARUTI', p: '11,240', ch: '+1.92%', up: true },
  { sym: 'SUNPHARMA', p: '1,680', ch: '-0.35%', up: false },
  { sym: 'TATASTEEL', p: '142', ch: '+0.21%', up: true },
  { sym: 'LTIM', p: '5,430', ch: '+2.44%', up: true },
  { sym: 'AXISBANK', p: '1,089', ch: '-0.67%', up: false },
  { sym: 'NESTLEIND', p: '2,290', ch: '+0.53%', up: true },
  { sym: 'COALINDIA', p: '475', ch: '+1.15%', up: true },
  { sym: 'POWERGRID', p: '310', ch: '+0.88%', up: true },
]

const TICKER_ITEMS = [...STOCKS, ...STOCKS]

export default function HomePage() {
  const pageRef = useRef(null)
  const sphereRef = useRef(null)
  const wrapRef = useRef(null)
  const waitlistRef = useRef(null)
  const emailRef = useRef(null)
  const [waitlistCount, setWaitlistCount] = useState(247)
  const [showSuccess, setShowSuccess] = useState(false)
  const [emailError, setEmailError] = useState(false)

  useEffect(() => {
    const root = pageRef.current
    if (!root) return

    const reveals = root.querySelectorAll('.reveal')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('visible')
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    reveals.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  useEffect(() => {
    const stored = localStorage.getItem('deimos_waitlist')
    if (stored) {
      const emails = JSON.parse(stored)
      setWaitlistCount(247 + emails.length)
    }
  }, [])

  useEffect(() => {
    function onMouseMove(e) {
      const sphere = sphereRef.current
      const wrap = wrapRef.current
      if (!sphere || !wrap) return
      const x = (e.clientX / window.innerWidth - 0.5) * 20
      const y = (e.clientY / window.innerHeight - 0.5) * 20
      sphere.style.transform = `translate(calc(-50% + ${x * 0.3}px), calc(-50% + ${y * 0.3}px))`
      wrap.style.transform = `perspective(800px) rotateY(${x * 0.3}deg) rotateX(${-y * 0.3}deg)`
    }
    document.addEventListener('mousemove', onMouseMove)
    return () => document.removeEventListener('mousemove', onMouseMove)
  }, [])

  function scrollToWaitlist() {
    waitlistRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function handleWaitlist() {
    const input = emailRef.current
    if (!input) return
    const email = input.value.trim()
    if (!email || !email.includes('@')) {
      setEmailError(true)
      setTimeout(() => setEmailError(false), 2000)
      return
    }
    const emails = JSON.parse(localStorage.getItem('deimos_waitlist') || '[]')
    if (!emails.includes(email)) {
      emails.push(email)
      localStorage.setItem('deimos_waitlist', JSON.stringify(emails))
      setWaitlistCount((c) => c + 1)
    }
    setShowSuccess(true)
    input.value = ''
  }

  return (
    <div className="deimos-page" ref={pageRef}>
      <DeimosNav variant="landing" active="home" />

      <div className="ticker-wrap">
        <div className="ticker-track">
          {TICKER_ITEMS.map((s, i) => (
            <span key={`${s.sym}-${i}`} className="ticker-item">
              <span style={{ color: '#e8edf2', fontWeight: 700 }}>{s.sym}</span>
              ₹{s.p}
              <span className={s.up ? 'up' : 'dn'}>{s.ch}</span>
              <span style={{ color: '#ffffff15' }}>|</span>
            </span>
          ))}
        </div>
      </div>

      <section className="hero">
        <div className="deimos-wrap" ref={wrapRef}>
          <div className="orbit orbit-1"><div className="orbit-dot" /></div>
          <div className="orbit orbit-2" />
          <div className="orbit orbit-3" />
          <div className="deimos-sphere" ref={sphereRef} />
          <div className="sphere-label">
            <span className="sphere-label-name">DEIMOS</span>
            <span className="sphere-label-tag">AI · NSE</span>
          </div>
        </div>

        <span className="eyebrow">AI-Powered Market Intelligence for NSE</span>
        <h1 className="hero-title">
          The market runs on <em>fear.</em><br />Master it.
        </h1>
        <p className="hero-sub">
          Deimos scans 2,000+ NSE stocks with real ML — LSTM neural networks, stacked ensemble models, and AI-generated analyst reports. Built for traders who demand an edge.
        </p>
        <div className="hero-actions">
          <Link href="/predict" className="btn-primary">🚀 Launch App</Link>
          <Link href="/signup" className="btn-secondary">⚡ Get Early Access</Link>
          <Link href="/login" className="btn-secondary">🔐 Login</Link>
        </div>
        <div className="hero-stats">
          <div className="stat">
            <div className="stat-num">2<span>K+</span></div>
            <div className="stat-label">NSE Stocks</div>
          </div>
          <div className="stat">
            <div className="stat-num">38</div>
            <div className="stat-label">ML Features</div>
          </div>
          <div className="stat">
            <div className="stat-num">5</div>
            <div className="stat-label">Timeframes</div>
          </div>
          <div className="stat">
            <div className="stat-num"><span>₹</span>299</div>
            <div className="stat-label">Per Month</div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      <section id="features">
        <div className="container">
          <div className="reveal">
            <span className="section-tag">// core features</span>
            <h2 className="section-title">Everything retail investors<br />never had access to.</h2>
            <p className="section-sub">We built what Bloomberg terminals cost ₹50L/year for — and made it ₹299/month.</p>
          </div>
          <div className="features-grid reveal reveal-delay-1">
            <div className="feat-card">
              <div className="feat-icon">🔭</div>
              <div className="feat-title">AI Markets Screener</div>
              <div className="feat-desc">Scan all 2,000+ NSE stocks in under 2 seconds. Filter by AI signal strength, sector momentum, volume anomalies, and technical confluence.</div>
              <span className="feat-tag">LIVE DATA</span>
            </div>
            <div className="feat-card">
              <div className="feat-icon">📋</div>
              <div className="feat-title">LLM Analyst Reports</div>
              <div className="feat-desc">Every stock click generates a plain-English analyst report — RSI, MACD, LSTM forecast, sector context. What a ₹50k/month human analyst would write, in seconds.</div>
              <span className="feat-tag">GROQ POWERED</span>
            </div>
            <div className="feat-card">
              <div className="feat-icon">⚡</div>
              <div className="feat-title">Multi-Timeframe Signals</div>
              <div className="feat-desc">ML predictions across 5 timeframes: Tomorrow, Next Week, Next Month, Next 3 Months, Next Year — each trained on a separate stacked ensemble model with honest OOF accuracy.</div>
              <span className="feat-tag">LSTM + RF + GBM</span>
            </div>
            <div className="feat-card">
              <div className="feat-icon">🔔</div>
              <div className="feat-title">Watchlist Alerts</div>
              <div className="feat-desc">Add stocks to your watchlist. Deimos monitors signal changes hourly and fires WhatsApp or email alerts the moment the model detects a significant shift.</div>
              <span className="feat-tag">COMING SOON</span>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      <section id="how" className="how-section">
        <div className="container">
          <div className="reveal">
            <span className="section-tag">// under the hood</span>
            <h2 className="section-title">Real ML. Real data.<br />No black boxes.</h2>
            <p className="section-sub">Most trading apps show you static screeners. Deimos runs actual machine learning models trained on 5 years of real price history.</p>
          </div>
          <div className="steps reveal reveal-delay-1">
            <div className="step">
              <div className="step-num">01</div>
              <div className="step-title">Data Ingestion</div>
              <div className="step-desc">We pull 5 years of OHLCV data from Yahoo Finance for every NSE stock — then compute 38 technical features including market regime, beta, sector context, and microstructure signals.</div>
            </div>
            <div className="step">
              <div className="step-num">02</div>
              <div className="step-title">ML Ensemble</div>
              <div className="step-desc">A stacked ensemble (Random Forest + GBM + ExtraTrees + LightGBM) generates per-class probabilities. A Bidirectional LSTM v3 produces the price forecast curve. Both are reconciled into a final signal.</div>
            </div>
            <div className="step">
              <div className="step-num">03</div>
              <div className="step-title">AI Report</div>
              <div className="step-desc">Model outputs are injected into a structured Groq prompt. The LLM returns a plain-English analyst report — grounded in real data, not hallucinations. You see what the model sees.</div>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider" />

      <section className="demo-section">
        <div className="container">
          <div className="reveal">
            <span className="section-tag">// live demo preview</span>
            <h2 className="section-title">What Deimos looks like<br />in action.</h2>
          </div>
          <div className="demo-grid reveal reveal-delay-1">
            <div className="demo-card">
              <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: '0.8rem', marginBottom: '1rem', color: 'var(--muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                AI Screener — Top Signals Today
              </div>
              <div className="demo-ticker-row">
                <span>RELIANCE</span>
                <span className="sig-buy">₹2,847 <span style={{ fontSize: '0.65rem' }}>▲1.3%</span></span>
                <span className="sig-badge buy">BUY</span>
              </div>
              <div className="demo-ticker-row">
                <span>TATASTEEL</span>
                <span style={{ color: 'var(--text)' }}>₹142 <span style={{ fontSize: '0.65rem', color: 'var(--muted)' }}>▲0.2%</span></span>
                <span className="sig-badge hold">HOLD</span>
              </div>
              <div className="demo-ticker-row">
                <span>HDFCBANK</span>
                <span className="sig-buy">₹1,723 <span style={{ fontSize: '0.65rem' }}>▲2.1%</span></span>
                <span className="sig-badge buy">BUY</span>
              </div>
              <div className="demo-ticker-row">
                <span>BAJFINANCE</span>
                <span className="sig-sell">₹6,890 <span style={{ fontSize: '0.65rem' }}>▼0.8%</span></span>
                <span className="sig-badge sell">SELL</span>
              </div>
              <div className="demo-ticker-row">
                <span>INFY</span>
                <span className="sig-buy">₹1,956 <span style={{ fontSize: '0.65rem' }}>▲1.7%</span></span>
                <span className="sig-badge buy">BUY</span>
              </div>
              <div className="demo-ticker-row">
                <span>WIPRO</span>
                <span className="sig-sell">₹478 <span style={{ fontSize: '0.65rem' }}>▼1.2%</span></span>
                <span className="sig-badge sell">SELL</span>
              </div>
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '1.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '1.4rem', color: '#22c55e' }}>18</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>BUY signals</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '1.4rem', color: '#f0b429' }}>24</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>HOLD signals</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '1.4rem', color: '#ef4444' }}>8</div>
                  <div style={{ fontSize: '0.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>SELL signals</div>
                </div>
              </div>
            </div>
            <div className="report-card">
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>RELIANCE.NS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <span style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: '1.5rem' }}>₹2,847</span>
                <span style={{ color: '#22c55e', fontSize: '0.8rem', fontWeight: 600 }}>▲ 1.32%</span>
                <span className="sig-badge buy" style={{ marginLeft: 'auto' }}>BUY · 72% conf</span>
              </div>
              <div className="report-line">
                <strong>LSTM Price Forecast (30d):</strong> Target ₹2,940 (+3.3%) with positive drift detected. Model trained on 5y of daily data.<br /><br />
                <strong>Technical Confluence:</strong> RSI 54.2 (neutral-bullish zone), MACD bullish crossover confirmed, price above MA20, MA50, MA200. Volume 1.8× daily average — institutional activity likely.<br /><br />
                <strong>ML Signal:</strong> 3-class stacked ensemble (RF + GBM + ExtraTrees + LightGBM) outputs BUY with 72% confidence across tomorrow and next-week horizons. Sector (Energy) outperforming Nifty by 2.1% over 20d.<br /><br />
                <strong>Recommendation:</strong> Technical and ML signals aligned. Watch ₹2,780 as key support. Not financial advice.
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Link href="/predict" className="btn-primary">Try the live app →</Link>
          </div>
        </div>
      </section>

      <hr className="divider" />

      <section id="pricing" className="pricing-section">
        <div className="container">
          <div className="reveal" style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <span className="section-tag" style={{ display: 'inline-block' }}>// pricing</span>
            <h2 className="section-title">Bloomberg-level research.<br />Not Bloomberg prices.</h2>
            <p className="section-sub" style={{ margin: '0 auto' }}>Access the same data institutional traders use — at a price built for retail investors.</p>
          </div>
          <div className="pricing-grid reveal reveal-delay-1">
            <div className="price-card">
              <div className="price-plan">Free</div>
              <div className="price-amount">₹0</div>
              <div className="price-period">forever</div>
              <ul className="price-features">
                <li>5 AI stock reports / month</li>
                <li>Basic screener (top 50 stocks)</li>
                <li>TradingView charts</li>
                <li>Technical indicators</li>
                <li className="dim">Multi-timeframe ML signals</li>
                <li className="dim">30-day LSTM forecast</li>
                <li className="dim">Watchlist alerts</li>
                <li className="dim">Portfolio analysis</li>
              </ul>
              <Link href="/signup" className="btn-plan" style={{ display: 'block', textAlign: 'center', textDecoration: 'none' }}>Start Free →</Link>
            </div>
            <div className="price-card featured">
              <span className="price-badge">MOST POPULAR</span>
              <div className="price-plan" style={{ color: 'var(--crimson)' }}>Pro</div>
              <div className="price-amount"><sup>₹</sup>299</div>
              <div className="price-period">per month · cancel anytime</div>
              <ul className="price-features">
                <li>Unlimited AI stock reports</li>
                <li>Full screener (2,000+ NSE stocks)</li>
                <li>Multi-timeframe ML signals</li>
                <li>30-day LSTM price forecast</li>
                <li>Watchlist (up to 25 stocks)</li>
                <li>WhatsApp/email alerts</li>
                <li>Sector intelligence</li>
                <li className="dim">Portfolio AI analysis</li>
              </ul>
              <button type="button" className="btn-plan primary" onClick={scrollToWaitlist}>Join Waitlist →</button>
            </div>
            <div className="price-card">
              <div className="price-plan">Premium</div>
              <div className="price-amount"><sup>₹</sup>799</div>
              <div className="price-period">per month</div>
              <ul className="price-features">
                <li>Everything in Pro</li>
                <li>Unlimited watchlist stocks</li>
                <li>Portfolio AI analysis</li>
                <li>Daily morning briefing</li>
                <li>Earnings signal alerts</li>
                <li>Volume shock detection</li>
                <li>Sector rotation signals</li>
                <li>Priority support</li>
              </ul>
              <button type="button" className="btn-plan" onClick={scrollToWaitlist}>Join Waitlist →</button>
            </div>
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--muted)', marginTop: '2rem', opacity: 0.7 }}>
            ⚠️ For research purposes only. Not SEBI-registered financial advice. Always consult a SEBI-registered advisor before investing.
          </p>
        </div>
      </section>

      <hr className="divider" />

      <section id="waitlist" className="waitlist-section" ref={waitlistRef}>
        <div className="container">
          <div className="waitlist-inner reveal">
            <div className="waitlist-count">
              <span className="live-dot" />
              <span>{waitlistCount} traders already on the waitlist</span>
            </div>
            <h2 className="waitlist-title">Get early access<br />to Deimos.</h2>
            <p className="waitlist-sub">
              We&apos;re onboarding the first 500 users in beta. Early joiners get 3 months Pro free and locked-in pricing forever.
            </p>
            <div className="waitlist-form">
              <input
                ref={emailRef}
                className="waitlist-input"
                type="email"
                placeholder={emailError ? 'Enter a valid email address' : 'your@email.com'}
                style={emailError ? { borderColor: 'rgba(239,68,68,0.6)' } : undefined}
                onKeyDown={(e) => { if (e.key === 'Enter') handleWaitlist() }}
              />
              <button type="button" className="waitlist-btn" onClick={handleWaitlist}>Join Waitlist ⚡</button>
            </div>
            <div className={`success-msg${showSuccess ? ' show' : ''}`}>
              🎉 You&apos;re on the list! We&apos;ll reach out before launch.
            </div>
            <p className="waitlist-note">No spam. No credit card. Just early access when we launch.</p>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-logo">
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--crimson)', display: 'inline-block', boxShadow: '0 0 8px var(--hot)' }} />
          DEIMOS
        </div>
        <p className="footer-note">AI-powered NSE market intelligence. Built by Ameya Sabale. Not affiliated with NSE or SEBI. All signals are for research and educational purposes only.</p>
        <div className="footer-links">
          <a className="footer-link" href="#features">Features</a>
          <a className="footer-link" href="#pricing">Pricing</a>
          <Link className="footer-link" href="/predict">Launch App</Link>
          <a className="footer-link" href="mailto:ameyasabale3@gmail.com">Contact</a>
        </div>
      </footer>
    </div>
  )
}
