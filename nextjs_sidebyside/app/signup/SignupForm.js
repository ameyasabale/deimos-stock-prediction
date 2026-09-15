'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DeimosNav from '../../components/DeimosNav'
import '../deimos-app.css'
import { createClient } from '../../lib/supabase'

export default function SignupForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const router = useRouter()

  async function handleSignup(e) {
    e.preventDefault()
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const supabase = createClient()
      const { data, error: sbError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      })
      if (sbError) {
        setError(sbError.message)
        setLoading(false)
        return
      }
      // If email confirmation is required, session is null
      if (!data.session) {
        setShowConfirm(true)
        setLoading(false)
        return
      }
      localStorage.setItem('ameyafx_user', JSON.stringify({
        id: data.user.id,
        email: data.user.email,
        name: name || email.split('@')[0],
      }))
      router.push('/predict')
    } catch (err) {
      setError('Unexpected error. Please try again.')
      setLoading(false)
    }
  }

  if (showConfirm) {
    return (
      <main className="deimos-app" style={{ display: 'flex', flexDirection: 'column' }}>
        <DeimosNav variant="landing" active="signup" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', paddingTop: '6rem' }}>
          <div style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1.5rem' }}>📬</div>
            <div style={{ background: '#120a14', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '16px', padding: '2.5rem' }}>
              <h2 style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.3rem', marginBottom: '1rem', color: '#22c55e' }}>Check your email!</h2>
              <p style={{ color: '#6b7f90', fontSize: '0.9rem', lineHeight: 1.7 }}>
                We sent a confirmation link to <strong style={{ color: '#e8edf2' }}>{email}</strong>.<br />
                Click it to activate your account and log in.
              </p>
              <div style={{ marginTop: '2rem' }}>
                <Link href="/login" style={{ background: 'linear-gradient(135deg,#c41e3a,#ff2d55)', color: '#fff', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.9rem', padding: '0.75rem 2rem', borderRadius: '8px', textDecoration: 'none', display: 'inline-block' }}>
                  Go to Login →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="deimos-app" style={{ display: 'flex', flexDirection: 'column' }}>
      <DeimosNav variant="landing" active="signup" />
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', paddingTop: '6rem' }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
            <Link href="/" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.55rem', justifyContent: 'center' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#c41e3a', boxShadow: '0 0 14px #ff2d55', display: 'inline-block' }} />
              <span style={{ fontFamily: 'Space Grotesk, sans-serif', fontWeight: 700, fontSize: '1.4rem', color: '#e8edf2', letterSpacing: '-0.02em' }}>DEIMOS</span>
            </Link>
            <p style={{ color: '#6b7f90', marginTop: '1.2rem', fontSize: '0.95rem' }}>Create your free account 🚀</p>
          </div>

          <div style={{ background: '#120a14', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '16px', padding: '2.5rem' }}>
            <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              {error && (
                <div style={{ background: 'rgba(255,59,59,0.08)', border: '1px solid rgba(255,59,59,0.2)', color: '#ff6b6b', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  ⚠️ {error}
                </div>
              )}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7f90', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>Full Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                  placeholder="Your full name"
                  style={{ width: '100%', background: '#0f0a12', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf2', padding: '0.8rem 1rem', borderRadius: '8px', fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(196,30,58,0.5)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7f90', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  placeholder="you@example.com"
                  style={{ width: '100%', background: '#0f0a12', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf2', padding: '0.8rem 1rem', borderRadius: '8px', fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(196,30,58,0.5)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7f90', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif' }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  placeholder="Min 6 characters"
                  style={{ width: '100%', background: '#0f0a12', border: '1px solid rgba(255,255,255,0.07)', color: '#e8edf2', padding: '0.8rem 1rem', borderRadius: '8px', fontSize: '0.9rem', fontFamily: 'Inter, sans-serif', outline: 'none', boxSizing: 'border-box' }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(196,30,58,0.5)' }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.07)' }}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                style={{ background: 'linear-gradient(135deg,#c41e3a,#ff2d55)', color: '#fff', fontWeight: 600, fontFamily: 'Space Grotesk, sans-serif', fontSize: '0.95rem', padding: '0.85rem', borderRadius: '8px', border: 'none', cursor: 'pointer', marginTop: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', opacity: loading ? 0.7 : 1, boxShadow: '0 0 25px rgba(196,30,58,0.35)', transition: 'all 0.2s' }}>
                {loading ? (
                  <><span style={{ width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} /> Creating account...</>
                ) : (
                  <>Create Free Account <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg></>
                )}
              </button>
            </form>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: '1.5rem', paddingTop: '1.5rem', textAlign: 'center' }}>
              <p style={{ color: '#6b7f90', fontSize: '0.875rem' }}>
                Already have an account?{' '}
                <Link href="/login" style={{ color: '#ff2d55', textDecoration: 'none', fontWeight: 600 }}>Sign in →</Link>
              </p>
            </div>
          </div>

          <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#4a5a6a', fontSize: '0.78rem' }}>
            🔒 Secured with Supabase auth · No credit card required
          </p>
        </div>
      </div>
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </main>
  )
}
