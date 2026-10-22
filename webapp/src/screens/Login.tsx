import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AuthCard } from '../components/AuthCard'
import { supabase } from '../lib/supabase'

export function Login() {
  const { status, signOutReason, refresh } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = new URLSearchParams(location.search).get('next') || '/'

  if (status !== 'signedOut' && status !== 'loading') return <Navigate to={next.startsWith('/') ? next : '/'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(error.message === 'Invalid login credentials' ? "That email and password don't match." : error.message)
      return
    }
    await refresh()
  }

  return (
    <AuthCard title="Sign in" lead="Use the same email and password as the Davey app.">
      {signOutReason === 'idle' && <p className="notice" role="status">You were signed out after 30 minutes without activity.</p>}
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <div className="auth-foot">
        <Link to="/forgot">Forgot password?</Link>
        <a href="/#waitlist">New to Davey? Get started</a>
      </div>
    </AuthCard>
  )
}
