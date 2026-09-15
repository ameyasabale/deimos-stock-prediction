const fs = require('fs');
const file = 'c:/Users/M.P/Downloads/nextjs_sidebyside/app/page.js';
let content = fs.readFileSync(file, 'utf8');

const anchor = '// ─── MINI MARKET TICKER ──────────────────────────────────';
const anchorIdx = content.indexOf(anchor);

if (anchorIdx === -1) {
    console.error("Could not find anchor");
    process.exit(1);
}

const topHalf = content.substring(0, anchorIdx);

const bottomHalf = \`// ─── MINI MARKET TICKER ──────────────────────────────────
function MiniMarketTicker() {
  const markets = [
    { sym: 'XAU/USD', price: '$3,241.50', change: '+0.82%', up: true },
    { sym: 'EUR/USD', price: '1.0847', change: '+0.23%', up: true },
    { sym: 'BTC/USD', price: '$85,420', change: '-1.12%', up: false },
    { sym: 'S&P 500', price: '5,891', change: '+0.44%', up: true },
    { sym: 'OIL WTI', price: '$71.30', change: '-0.88%', up: false },
    { sym: 'GBP/USD', price: '1.2834', change: '+0.15%', up: true },
    { sym: 'NASDAQ', price: '21,340', change: '+0.61%', up: true },
  ]
  return (
    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', animation: 'fadeUp 0.7s 0.35s ease both' }}>
      {markets.map(m => (
        <div key={m.sym} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px', padding: '0.5rem 0.9rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '90px' }}>
          <span style={{ fontSize: '0.62rem', color: '#6b7f90', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.sym}</span>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.82rem' }}>{m.price}</span>
          <span style={{ fontSize: '0.65rem', color: m.up ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{m.change}</span>
        </div>
      ))}
    </div>
  )
}

// ─── STATS BAR ───────────────────────────────────────────
function StatsBar() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: '3rem', flexWrap: 'wrap', padding: '2.5rem 5vw', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)', background: '#0b1118' }}>
      {[['2,000+', 'Active Traders'], ['1.2M+', 'Trades Logged'], ['67.8%', 'Avg Win Rate Gain'], ['99.9%', 'Platform Uptime']].map(([num, label]) => (
        <div key={label} style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '2rem', fontWeight: 800, background: 'linear-gradient(135deg,#00d4ff,#0088ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{num}</div>
          <div style={{ fontSize: '0.82rem', color: '#6b7f90', marginTop: '0.25rem' }}>{label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── MARKET OVERVIEW ─────────────────────────────────────
function MarketOverview() {
  const categories = [
    { icon: '📊', label: 'Indices', color: '#00d4ff' },
    { icon: '🏢', label: 'Stocks', color: '#22c55e' },
    { icon: '🛢️', label: 'Commodities', color: '#f0b429' },
    { icon: '💱', label: 'Currencies', color: '#a78bfa' },
    { icon: '📦', label: 'ETFs', color: '#f472b6' },
    { icon: '🏦', label: 'Bonds', color: '#34d399' },
    { icon: '💎', label: 'Funds', color: '#fb923c' },
    { icon: '₿', label: 'Crypto', color: '#fbbf24' },
  ]
  return (
    <section style={{ padding: '5rem 5vw', background: '#060a0f' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#00d4ff', fontWeight: 600, marginBottom: '0.8rem' }}>Markets</div>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, letterSpacing: '-1px', marginBottom: '0.8rem' }}>Live Market Data</h2>
        <p style={{ color: '#6b7f90', fontSize: '0.95rem' }}>Access all major asset classes in one place</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(120px,1fr))', gap: '1rem', maxWidth: '900px', margin: '0 auto 2rem' }}>
        {categories.map(({ icon, label, color }) => (
          <Link key={label} href="/markets" style={{ textDecoration: 'none' }}>
            <div style={{ background: '#0b1118', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.25s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '48px', height: '48px', background: \\\`\\\${color}15\\\`, border: \\\`1px solid \\\${color}30\\\`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>{icon}</div>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.8rem', color: '#e8edf2' }}>{label}</span>
            </div>
          </Link>
        ))}
      </div>
      <div style={{ textAlign: 'center' }}>
        <Link href="/markets" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,212,255,0.08)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff', padding: '0.7rem 1.8rem', borderRadius: '8px', textDecoration: 'none', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.875rem' }}>
          View All Markets →
        </Link>
      </div>
    </section>
  )
}

// ─── FEATURES SHOWCASE ───────────────────────────────────
function FeaturesShowcase() {
  const [active, setActive] = useState(0)
  const features = [
    { icon: '📝', label: 'Journal', title: 'Journal Every Trade', desc: 'Log setup, emotions, strategy, and screenshots. Uncover patterns that impact your performance.', points: ['Notes & screenshots', 'Strategy tags', 'Emotion tracking'], color: '#00d4ff' },
    { icon: '📈', label: 'Analytics', title: 'Crystal Clear Analytics', desc: 'Equity curves, win rate by session, drawdown — all calculated automatically from your data.', points: ['Equity curve', 'Win rate by pair', 'Calendar heatmap'], color: '#22c55e' },
    { icon: '🤖', label: 'AI Reports', title: 'Your Personal AI Coach', desc: 'AI analyses every trade — blind spots, revenge trading, risk habits, and gives you an action plan.', points: ['Pattern detection', 'Blind spot analysis', 'Improvement plan'], color: '#a78bfa' },
    { icon: '🔄', label: 'MT5 Sync', title: 'Auto-Sync MetaTrader', desc: 'Connect MT4/MT5 with read-only access. Trades appear automatically — zero manual entry.', points: ['Real-time sync', 'Multiple accounts', 'Any MT4/MT5 broker'], color: '#f0b429' },
  ]
  useEffect(() => {
    const t = setInterval(() => setActive(a => (a + 1) % features.length), 3500)
    return () => clearInterval(t)
  }, [])
  const feat = features[active]
  return (
    <section style={{ padding: '6rem 5vw', background: '#0b1118' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#00d4ff', fontWeight: 600, marginBottom: '0.8rem' }}>Features</div>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, letterSpacing: '-1px' }}>Everything in One Platform</h2>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginBottom: '3rem', flexWrap: 'wrap' }}>
        {features.map((f, i) => (
          <button key={f.label} onClick={() => setActive(i)} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.6rem 1.2rem', borderRadius: '100px', border: \\\`1px solid \\\${active === i ? f.color : 'rgba(255,255,255,0.07)'}\\\`, background: active === i ? \\\`\\\${f.color}15\\\` : 'transparent', color: active === i ? f.color : '#6b7f90', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: '0.82rem', transition: 'all 0.2s' }}>
            <span>{f.icon}</span>{f.label}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4rem', alignItems: 'center', maxWidth: '1100px', margin: '0 auto' }} key={active}>
        <div style={{ animation: 'fadeUp 0.4s ease both' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: \\\`\\\${feat.color}12\\\`, border: \\\`1px solid \\\${feat.color}25\\\`, borderRadius: '8px', padding: '0.4rem 0.9rem', marginBottom: '1.5rem' }}>
            <span>{feat.icon}</span>
            <span style={{ fontSize: '0.75rem', color: feat.color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: 'Syne, sans-serif' }}>{feat.label}</span>
          </div>
          <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.4rem,3vw,2rem)', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '1rem', lineHeight: 1.2 }}>{feat.title}</h3>
          <p style={{ color: '#6b7f90', fontSize: '0.95rem', lineHeight: 1.8, marginBottom: '1.5rem' }}>{feat.desc}</p>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            {feat.points.map(p => (
              <li key={p} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.875rem' }}>
                <span style={{ width: '20px', height: '20px', background: \\\`\\\${feat.color}15\\\`, border: \\\`1px solid \\\${feat.color}30\\\`, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: feat.color, flexShrink: 0 }}>✓</span>
                {p}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ animation: 'fadeUp 0.4s 0.1s ease both' }}>
          <FeatureMockup id={active} color={feat.color} />
        </div>
      </div>
    </section>
  )
}

function MockHeader({ title, badge, live }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '0.7rem 1rem', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
      {['#ff5f57', '#febc2e', '#28c840'].map(c => <div key={c} style={{ width: '9px', height: '9px', borderRadius: '50%', background: c }}/>)}
      <span style={{ marginLeft: '0.5rem', fontSize: '0.72rem', color: '#6b7f90', fontFamily: 'Syne, sans-serif', fontWeight: 600, flex: 1 }}>{title}</span>
      {badge && <span style={{ background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.2)', color: '#00d4ff', padding: '0.1rem 0.5rem', borderRadius: '4px', fontSize: '0.62rem', fontWeight: 700 }}>{badge}</span>}
      {live && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.68rem', color: '#22c55e' }}><span style={{ width: '5px', height: '5px', background: '#22c55e', borderRadius: '50%', animation: 'pulse 2s infinite' }}/>Live</span>}
    </div>
  )
}

function FeatureMockup({ id, color }) {
  const mockups = [
    <div style={{ background: '#0f1823', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden', boxShadow: \\\`0 30px 80px rgba(0,0,0,0.5),0 0 40px \\\${color}10\\\` }}>
      <MockHeader title="Trade Journal Entry"/>
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          {[['Symbol', 'XAUUSD'], ['Direction', 'BUY ↑'], ['Entry', '$2,341.50'], ['P&L', '+$263']].map(([l, v]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.62rem', color: '#6b7f90', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.3rem' }}>{l}</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.9rem', color: v.includes('+') ? '#22c55e' : v.includes('BUY') ? '#00d4ff' : '#e8edf2' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.85rem', fontSize: '0.8rem', color: '#8899aa', lineHeight: 1.6 }}>"Strong breakout above 2340 resistance. London session confluence. Held with full confidence ✅"</div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {['😎 Confident', 'Breakout', 'London'].map(t => (
            <span key={t} style={{ background: \\\`\\\${color}12\\\`, border: \\\`1px solid \\\${color}25\\\`, color, padding: '0.2rem 0.6rem', borderRadius: '100px', fontSize: '0.68rem', fontWeight: 600 }}>{t}</span>
          ))}
        </div>
      </div>
    </div>,
    <div style={{ background: '#0f1823', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden', boxShadow: \\\`0 30px 80px rgba(0,0,0,0.5),0 0 40px \\\${color}10\\\` }}>
      <MockHeader title="Performance Analytics"/>
      <div style={{ padding: '1.5rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '0.75rem', marginBottom: '1.2rem' }}>
          {[['Win Rate', '67.8%', '#00d4ff'], ['Profit Factor', '2.4x', '#f0b429'], ['P&L', '+$4,231', '#22c55e']].map(([l, v, c]) => (
            <div key={l} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '8px', padding: '0.75rem', textAlign: 'center' }}>
              <div style={{ fontSize: '0.6rem', color: '#6b7f90', textTransform: 'uppercase', marginBottom: '0.3rem' }}>{l}</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, color: c, fontSize: '1rem' }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: '8px', padding: '1rem' }}>
          <div style={{ fontSize: '0.62rem', color: '#6b7f90', marginBottom: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Equity Curve</div>
          <svg viewBox="0 0 300 70" style={{ width: '100%', height: '70px' }}>
            <defs><linearGradient id="g2" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.3"/><stop offset="100%" stopColor={color} stopOpacity="0"/></linearGradient></defs>
            <path d="M0,65 L30,60 L60,62 L90,48 L120,40 L150,42 L180,28 L210,20 L240,12 L270,6 L300,2 L300,70 L0,70Z" fill="url(#g2)"/>
            <path d="M0,65 L30,60 L60,62 L90,48 L120,40 L150,42 L180,28 L210,20 L240,12 L270,6 L300,2" fill="none" stroke={color} strokeWidth="2"/>
          </svg>
        </div>
      </div>
    </div>,
    <div style={{ background: '#0f1823', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden', boxShadow: \\\`0 30px 80px rgba(0,0,0,0.5),0 0 40px \\\${color}10\\\` }}>
      <MockHeader title="AI Trade Report" badge="Grade: A-"/>
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
        {[
          ['✅', 'Strengths', 'rgba(34,197,94,0.08)', 'rgba(34,197,94,0.15)', '#22c55e', 'Strong discipline during London session. Consistent 1:2 R:R maintained.'],
          ['⚠️', 'Blind Spots', 'rgba(239,68,68,0.08)', 'rgba(239,68,68,0.15)', '#ef4444', 'Revenge trading detected after 3 losses. Friday trades show -$840 net.'],
          ['🎯', 'Action Plan', 'rgba(240,180,41,0.08)', 'rgba(240,180,41,0.15)', '#f0b429', 'Focus XAUUSD London open. Set $200 daily loss limit to prevent cycles.'],
        ].map(([ic, label, bg, border, c, text]) => (
          <div key={label} style={{ background: bg, border: \\\`1px solid \\\${border}\\\`, borderRadius: '8px', padding: '0.85rem' }}>
            <div style={{ fontSize: '0.65rem', color: c, fontWeight: 700, marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ic} {label}</div>
            <div style={{ fontSize: '0.78rem', color: '#e8edf2', lineHeight: 1.6 }}>{text}</div>
          </div>
        ))}
      </div>
    </div>,
    <div style={{ background: '#0f1823', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', overflow: 'hidden', boxShadow: \\\`0 30px 80px rgba(0,0,0,0.5),0 0 40px \\\${color}10\\\` }}>
      <MockHeader title="MT5 Sync" live/>
      <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.12)', borderRadius: '8px', padding: '0.9rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.85rem' }}>ICMarkets - MT5</div>
            <div style={{ fontSize: '0.7rem', color: '#6b7f90', marginTop: '0.2rem' }}>Account #12847561</div>
          </div>
          <span style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.68rem', fontWeight: 700 }}>SYNCED ✓</span>
        </div>
        {[
          ['XAUUSD', 'BUY', '+$263', '2 min ago'],
          ['EURUSD', 'SELL', '-$45', '1h ago'],
          ['GBPUSD', 'BUY', '+$180', '3h ago']
        ].map(([sym, type, pnl, time]) => (
          <div key={sym} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.7rem', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.85rem' }}>{sym}</span>
              <span style={{ background: type === 'BUY' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: type === 'BUY' ? '#22c55e' : '#ef4444', padding: '0.15rem 0.45rem', borderRadius: '3px', fontSize: '0.65rem', fontWeight: 700 }}>{type}</span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: pnl.includes('+') ? '#22c55e' : '#ef4444', fontSize: '0.85rem' }}>{pnl}</div>
              <div style={{ fontSize: '0.62rem', color: '#6b7f90' }}>{time}</div>
            </div>
          </div>
        ))}
      </div>
    </div>,
  ]
  return mockups[id] || mockups[0]
}

// ─── TESTIMONIALS ────────────────────────────────────────
function Testimonials() {
  return (
    <section style={{ padding: '6rem 5vw', background: '#060a0f' }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#00d4ff', fontWeight: 600, marginBottom: '0.8rem' }}>Testimonials</div>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, letterSpacing: '-1px' }}>Loved by Traders</h2>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1.5rem', maxWidth: '1100px', margin: '0 auto' }}>
        {[
          { name: 'Rahul Sharma', role: 'Forex Trader, Mumbai', text: 'AmeyaFX completely changed how I review my trades. The AI reports caught patterns I never noticed myself.', stars: 5, initial: 'R' },
          { name: 'Priya Mehta', role: 'Gold Trader, Delhi', text: 'The MT5 sync is seamless. I just trade and everything logs automatically. Best journaling tool I\\'ve used.', stars: 5, initial: 'P' },
          { name: 'Arjun Patel', role: 'Crypto Trader, Bangalore', text: 'The analytics dashboard is incredible. Finally I know exactly which sessions and pairs I perform best in.', stars: 5, initial: 'A' },
        ].map(({ name, role, text, stars, initial }) => (
          <div key={name} style={{ background: '#0b1118', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '2rem' }}>
            <div style={{ color: '#f0b429', fontSize: '0.9rem', marginBottom: '1rem', letterSpacing: '0.1em' }}>{'★'.repeat(stars)}</div>
            <p style={{ color: '#8899aa', fontSize: '0.875rem', lineHeight: 1.8, marginBottom: '1.5rem' }}>"{text}"</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: 'linear-gradient(135deg,#00d4ff,#0066ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#000', fontSize: '0.85rem' }}>{initial}</div>
              <div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.875rem' }}>{name}</div>
                <div style={{ color: '#6b7f90', fontSize: '0.75rem' }}>{role}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── PRICING ─────────────────────────────────────────────
function Pricing() {
  return (
    <section id="pricing" style={{ padding: '6rem 5vw', background: '#0b1118' }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#00d4ff', fontWeight: 600, marginBottom: '0.8rem' }}>Pricing</div>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, letterSpacing: '-1px', marginBottom: '0.8rem' }}>Plans for Every Trader</h2>
        <p style={{ color: '#6b7f90' }}>Start free. Upgrade when ready.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: '1.5rem', maxWidth: '1000px', margin: '0 auto' }}>
        {[
          { name: 'Free', price: '0', period: 'forever', features: ['15 trades/month', 'Manual entry', 'Basic analytics', 'Market overview'], cta: 'Get Started Free', featured: false },
          { name: 'Pro', price: '19.99', period: 'per month', features: ['Unlimited trades', '3 MT4/MT5 accounts', 'AI reports', 'Full analytics', 'Live news feed'], cta: 'Start Pro →', featured: true },
          { name: 'Elite', price: '39.99', period: 'per month', features: ['Everything in Pro', 'Unlimited MT5 accounts', 'Backtesting engine', 'AI predictions', 'VIP support'], cta: 'Go Elite', featured: false },
        ].map(plan => (
          <div key={plan.name} style={{ background: '#0f1823', border: \\\`1px solid \\\${plan.featured ? '#00d4ff' : 'rgba(255,255,255,0.07)'}\\\`, borderRadius: '16px', padding: '2.5rem', position: 'relative', boxShadow: plan.featured ? '0 0 50px rgba(0,212,255,0.08)' : 'none' }}>
            {plan.featured && <div style={{ position: 'absolute', top: '-13px', left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(135deg,#00d4ff,#0088cc)', color: '#000', fontFamily: 'Syne, sans-serif', fontSize: '0.68rem', fontWeight: 700, padding: '0.25rem 1rem', borderRadius: '100px', whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Most Popular</div>}
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6b7f90', marginBottom: '1rem' }}>{plan.name}</div>
            <div style={{ fontFamily: 'Syne, sans-serif', fontSize: '2.8rem', fontWeight: 800, letterSpacing: '-2px', lineHeight: 1, marginBottom: '0.3rem' }}><sup style={{ fontSize: '1.1rem', verticalAlign: 'super' }}>$</sup>{plan.price}</div>
            <div style={{ color: '#6b7f90', fontSize: '0.82rem', marginBottom: '2rem' }}>{plan.period}</div>
            <ul style={{ listStyle: 'none', marginBottom: '2rem' }}>
              {plan.features.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', color: '#8899aa', padding: '0.45rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ color: '#00d4ff', fontWeight: 700, fontSize: '0.8rem' }}>✓</span>{f}
                </li>
              ))}
            </ul>
            <Link href="/signup" style={{ display: 'block', textAlign: 'center', padding: '0.8rem', borderRadius: '8px', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.875rem', textDecoration: 'none', background: plan.featured ? 'linear-gradient(135deg,#00d4ff,#0088cc)' : 'transparent', color: plan.featured ? '#000' : '#e8edf2', border: plan.featured ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>{plan.cta}</Link>
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── FAQ ─────────────────────────────────────────────────
function FAQ() {
  const [open, setOpen] = useState(null)
  const faqs = [
    ['What is AmeyaFX?', 'AmeyaFX is a professional trading journal with MT5 sync, AI reports, live market data, and price predictions — all in one platform.'],
    ['How does MT5 sync work?', 'Connect your MT4/MT5 with read-only investor password. Trades sync in real time automatically — no manual entry needed.'],
    ['What do AI reports tell me?', 'Full breakdown of win rate, profit factor, emotional patterns, blind spots, and a specific improvement action plan.'],
    ['Is my data safe?', 'Yes — AES-256 encryption and read-only broker credentials. We can never place or touch your trades.'],
    ['Is there a free plan?', 'Yes! Free plan includes 15 trades/month, manual entry, and basic analytics. MT5 sync and AI need Pro plan.'],
  ]
  return (
    <section id="faq" style={{ padding: '6rem 5vw', background: '#060a0f' }}>
      <div style={{ textAlign: 'center', marginBottom: '4rem' }}>
        <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.15em', color: '#00d4ff', fontWeight: 600, marginBottom: '0.8rem' }}>FAQ</div>
        <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 'clamp(1.8rem,3.5vw,2.8rem)', fontWeight: 800, letterSpacing: '-1px' }}>Frequently Asked Questions</h2>
      </div>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        {faqs.map(([q, a], i) => (
          <div key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '1.25rem 0' }}>
            <button onClick={() => setOpen(open === i ? null : i)} style={{ width: '100%', background: 'none', border: 'none', color: '#e8edf2', textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.95rem', gap: '1rem' }}>
              {q}
              <span style={{ color: '#00d4ff', fontSize: '1.2rem', flexShrink: 0, transition: 'transform 0.3s', display: 'inline-block', transform: open === i ? 'rotate(45deg)' : 'none' }}>+</span>
            </button>
            {open === i && <p style={{ color: '#6b7f90', fontSize: '0.875rem', lineHeight: 1.8, marginTop: '0.9rem', animation: 'fadeUp 0.3s ease both' }}>{a}</p>}
          </div>
        ))}
      </div>
    </section>
  )
}

// ─── GUARANTEE ───────────────────────────────────────────
function GuaranteeBanner() {
  return (
    <section style={{ padding: '4rem 5vw', background: 'linear-gradient(135deg,rgba(0,212,255,0.05),rgba(0,136,204,0.03))', borderTop: '1px solid rgba(0,212,255,0.08)', borderBottom: '1px solid rgba(0,212,255,0.08)', textAlign: 'center' }}>
      <div style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>🛡️</div>
      <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.5px', marginBottom: '0.8rem' }}>30-Day Money-Back Guarantee</h2>
      <p style={{ color: '#6b7f90', fontSize: '0.9rem', maxWidth: '500px', margin: '0 auto', lineHeight: 1.8 }}>Try AmeyaFX risk-free. If it doesn't help you trade more consistently, we'll refund every penny. No questions asked.</p>
    </section>
  )
}

// ─── FOOTER ──────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{ background: '#060a0f', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '3rem 5vw 2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: '32px', height: '32px', background: 'linear-gradient(135deg,#00d4ff,#0066ff)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="2,17 8,11 13,15 22,6" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/><polyline points="16,6 22,6 22,12" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '1.2rem' }}>Ameya<span style={{ color: '#00d4ff' }}>FX</span></span>
        </div>
        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
          {[['Markets', '/markets'], ['Dashboard', '/dashboard'], ['Login', '/login'], ['Sign Up', '/signup']].map(([l, h]) => (
            <Link key={l} href={h} style={{ color: '#6b7f90', textDecoration: 'none', fontSize: '0.875rem' }}>{l}</Link>
          ))}
        </div>
      </div>
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
        <p style={{ color: '#4a5a6a', fontSize: '0.8rem' }}>© 2025 AmeyaFX. All rights reserved.</p>
        <p style={{ color: '#4a5a6a', fontSize: '0.8rem' }}>Built for Traders, by Traders 🚀</p>
      </div>
    </footer>
  )
}

// ─── GLOBAL STYLES ───────────────────────────────────────
function GlobalStyles() {
  return (
    <style>{\`
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:wght@300;400;500&display=swap');
      @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.4)} }
      @keyframes ticker { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
      @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
      @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
      @keyframes navSpin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      @keyframes scrollDot { 0%,100%{transform:translateX(-50%) translateY(0);opacity:1} 50%{transform:translateX(-50%) translateY(14px);opacity:0.2} }
      * { box-sizing: border-box; }
      body { margin: 0; }
      a:hover { opacity: 0.85; }
      nav a:hover { opacity: 1 !important; color: #e8edf2 !important; }
    \`}</style>
  )
}
\`;

fs.writeFileSync(file, topHalf + "\\n" + bottomHalf);
console.log("Reconstructed fully!");
