export const metadata = {
  title: 'Deimos — AI Market Intelligence',
  description: 'AI-powered NSE market intelligence. LSTM + stacked ensemble ML for 2,000+ stocks.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Inter:wght@300;400;500&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
        <style>{`
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
          html { scroll-behavior: smooth; }
          html, body { margin: 0; padding: 0; background: #0a0a0f; overflow-x: hidden; }
        `}</style>
      </head>
      <body style={{ margin: 0, padding: 0, background: '#0a0a0f' }}>{children}</body>
    </html>
  )
}