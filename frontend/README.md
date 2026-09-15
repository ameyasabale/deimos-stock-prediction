# AmeyaFX — Complete Trading Platform

## 📁 Project Structure

```
ameyafx/
├── app/
│   ├── page.js                    ← Home / Landing page
│   ├── layout.js                  ← Root layout
│   ├── globals.css                ← Global styles
│   ├── login/
│   │   ├── page.js
│   │   └── LoginForm.js           ← Login page
│   ├── signup/
│   │   ├── page.js
│   │   └── SignupForm.js          ← Signup page
│   ├── dashboard/
│   │   ├── page.js
│   │   └── DashboardClient.js     ← Trade Journal
│   ├── markets/
│   │   ├── page.js                ← Market screener (all asset classes)
│   │   └── [symbol]/
│   │       └── page.js            ← Full stock detail page (8 tabs)
│   ├── predict/
│   │   └── page.js                ← AI ML Prediction page (NEW!)
│   ├── news/
│   │   └── page.js                ← Live news feed
│   ├── worldmap/
│   │   └── page.js                ← World map with conflicts & markets
│   └── api/
│       └── news/
│           ├── route.js           ← News API (RSS feeds)
│           └── quote/
│               └── route.js      ← Stock quote API (Yahoo Finance)
├── lib/
│   └── supabase.js                ← Supabase client
├── .env.local                     ← Environment variables
└── package.json
```

## 🚀 How to Run

1. Install dependencies:
```bash
npm install
```

2. Add your keys to `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_key
```

3. Run development server:
```bash
npm run dev
```

4. Open http://localhost:3000

## 📄 Pages

| Page | URL | Description |
|------|-----|-------------|
| Home | / | Landing page with features, pricing |
| Markets | /markets | Stock screener for all asset classes |
| Stock Detail | /markets/NSE:RELIANCE | Full 8-tab stock page |
| AI Predict | /predict | ML prediction for all NIFTY 50 stocks |
| News | /news | Live financial news |
| World Map | /worldmap | Global conflicts & market map |
| Dashboard | /dashboard | Personal trade journal |
| Login | /login | User login |
| Signup | /signup | User signup |

## 🤖 ML Models (Coming - Flask Backend)

- LSTM → Price prediction
- Random Forest → Buy/Sell/Hold signal
- Deploy as Flask API → connect to /predict page
