const fs = require('fs');
const file = 'c:/Users/M.P/Downloads/nextjs_sidebyside/app/page.js';
let content = fs.readFileSync(file, 'utf8');

// 1. Revert fonts globally
content = content.replace(/Space Grotesk/g, 'Syne');
content = content.replace(/Inter/g, 'DM Sans');

// 2. Revert MiniMarketTicker completely
const oldTicker = `function MiniMarketTicker() {
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
}`;
content = content.replace(/function MiniMarketTicker\(\) \{[\s\S]*?return \([\s\S]*?\}\)/, oldTicker);

// 3. Revert StatsBar
const oldStats = `function StatsBar() {
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
}`;
content = content.replace(/function StatsBar\(\) \{[\s\S]*?return \([\s\S]*?\}\)/, oldStats);

// 4. Revert MarketOverview items
const oldMarketCards = `<div style={{ background: '#0b1118', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '14px', padding: '1.5rem 1rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.25s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
              <div style={{ width: '48px', height: '48px', background: \`\${color}15\`, border: \`1px solid \${color}30\`, borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>{icon}</div>
              <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '0.8rem', color: '#e8edf2' }}>{label}</span>
            </div>`;

content = content.replace(/<div className="glass-card"[\s\S]*?<\/div>\s*<\/Link>/g, (m) => {
  return m.replace(/<div className="glass-card"[\s\S]*?<\/div>/, oldMarketCards) + '\n          </Link>';
});

fs.writeFileSync(file, content);
console.log('Fixed styles to match original user paste.');
