'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import '../app/deimos-app.css'
import { createClient } from '../lib/supabase'

const NAV_ITEMS = [
  { icon: '🏠', label: 'Home',      href: '/' },
  { icon: '📊', label: 'Dashboard', href: '/dashboard' },
  { icon: '🤖', label: 'Predict',   href: '/predict' },
  { icon: '💼', label: 'Portfolio', href: '/portfolio' },
]

const LANDING_ANCHORS = [
  { label: 'Features', href: '#features' },
  { label: 'How it works', href: '#how' },
  { label: 'Pricing', href: '#pricing' },
]

export default function DeimosNav({ active = 'predict', variant = 'app', apiStatus, totalStocks = 0 }) {
  const isLanding = variant === 'landing'
  const [user, setUser] = useState(null)
  const router = useRouter()

  useEffect(() => {
    try {
      const stored = localStorage.getItem('ameyafx_user')
      if (stored) setUser(JSON.parse(stored))
    } catch {}
  }, [])

  async function handleLogout() {
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {}
    localStorage.removeItem('ameyafx_user')
    setUser(null)
    router.push('/')
  }

  const userInitial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'

  return (
    <nav className={`deimos-nav${isLanding ? ' deimos-nav-landing' : ''}`}>
      <Link className="logo" href="/">
        <span className="logo-dot" />
        DEIMOS
      </Link>

      {isLanding ? (
        <div className="nav-center">
          <div className="nav-anchor-links">
            {LANDING_ANCHORS.map(({ label, href }) => (
              <a key={href} className="nav-anchor-link" href={href}>{label}</a>
            ))}
          </div>
          <div className="nav-links">
            {NAV_ITEMS.filter(({ href }) => href === '/login' || href === '/signup').map(({ icon, label, href }) => {
              const key = href.slice(1)
              const isActive = active === key
              return (
                <Link key={href} href={href} className={`nav-pill${isActive ? ' active' : ''}`}>
                  <span className="nav-pill-icon">{icon}</span>
                  <span className="nav-pill-label">{label}</span>
                </Link>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="nav-links">
          {NAV_ITEMS.filter(({ href }) => href !== '/login' && href !== '/signup').map(({ icon, label, href }) => {
            const key = href === '/' ? 'home' : href.slice(1)
            const isActive = active === key
            return (
              <Link key={href} href={href} className={`nav-pill${isActive ? ' active' : ''}`}>
                <span className="nav-pill-icon">{icon}</span>
                <span className="nav-pill-label">{label}</span>
              </Link>
            )
          })}
        </div>
      )}

      <div className="nav-right">
        {isLanding ? (
          <>
            <Link href="/predict" className="nav-cta-outline">Launch App</Link>
            <a className="nav-cta-primary" href="#waitlist">
              <span className="full-label">Join Waitlist →</span>
              <span className="short-label" style={{ display: 'none' }}>Waitlist</span>
            </a>
          </>
        ) : (
          <>
            {user ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <div style={{
                  width: 30, height: 30, borderRadius: '50%',
                  background: 'linear-gradient(135deg,#c41e3a,#ff2d55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'Space Grotesk, sans-serif', fontWeight: 800, fontSize: '0.75rem', color: '#fff',
                  boxShadow: '0 0 12px rgba(196,30,58,0.4)', flexShrink: 0,
                }} title={user.email}>
                  {userInitial}
                </div>
                <span style={{ fontSize: '0.7rem', color: '#6b7f90', fontFamily: 'Space Grotesk, sans-serif', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user.name || user.email}
                </span>
                <button
                  onClick={handleLogout}
                  style={{
                    background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                    color: '#ef4444', padding: '0.3rem 0.75rem', borderRadius: '6px',
                    cursor: 'pointer', fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700,
                    fontSize: '0.68rem', transition: 'all 0.2s',
                  }}
                  onMouseOver={e => { e.target.style.background = 'rgba(239,68,68,0.15)' }}
                  onMouseOut={e => { e.target.style.background = 'rgba(239,68,68,0.08)' }}
                >
                  Logout
                </button>
              </div>
            ) : (
              <Link href="/login" className="nav-home-link">← Login</Link>
            )}
            {apiStatus != null && (
              <div className={`status-pill ${apiStatus === 'online' ? 'online' : 'offline'}`}>
                <span className={`status-dot ${apiStatus === 'online' ? 'online' : 'offline'}`} />
                <span>
                  {apiStatus === 'checking'
                    ? 'Connecting...'
                    : apiStatus === 'online'
                      ? `Online · ${totalStocks} stocks`
                      : 'API Offline'}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </nav>
  )
}
