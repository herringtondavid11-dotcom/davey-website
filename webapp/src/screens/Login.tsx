import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AuthCard } from '../components/AuthCard'
import { authErrorMessage } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

export function Login() {
  const { status, signOutReason, refresh } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const params = new URLSearchParams(location.search)
  const next = params.get('next') || '/'
  // Returning from Sign in with Apple with an error (for example, the provider isn't enabled for the web yet).
  const oauthError = params.get('error_description') || (window.location.hash.includes('error_description') ? new URLSearchParams(window.location.hash.slice(1)).get('error_description') : null)

  async function apple() {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: `${window.location.origin}/app/` } })
    if (error) setError(/not enabled|unsupported provider/i.test(error.message) ? 'Sign in with Apple on the web is coming soon. For now, sign in with email in the Davey app (Settings › Profile) to set a password.' : error.message)
  }

  if (status !== 'signedOut' && status !== 'loading') return <Navigate to={next.startsWith('/') ? next : '/'} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(error.message === 'Invalid login credentials' ? "That email and password don't match."
        : error.code === 'email_not_confirmed' ? 'Confirm your email first: open the link we sent you, then sign in.'
        : authErrorMessage(error))
      return
    }
    await refresh()
  }

  return (
    <AuthCard title="Sign in" lead="Use the same account as the Davey app.">
      {(location.state as { linkMessage?: string } | null)?.linkMessage && <p className="notice" role="status">{(location.state as { linkMessage: string }).linkMessage}</p>}
      {signOutReason === 'idle' && <p className="notice" role="status">You were signed out after 30 minutes without activity.</p>}
      {oauthError && <p className="error" role="alert">{/not enabled|unsupported/i.test(oauthError) ? 'Sign in with Apple on the web is coming soon. Use email and password for now.' : oauthError}</p>}
      <button type="button" className="btn btn-apple btn-block" onClick={apple}>
        <svg width="16" height="18" viewBox="0 0 16 19" aria-hidden><path fill="currentColor" d="M13.2 10.1c0-2.4 2-3.6 2.1-3.6-1.1-1.7-2.9-1.9-3.5-1.9-1.5-.2-2.9.9-3.7.9-.8 0-1.9-.9-3.2-.8-1.6 0-3.2 1-4 2.5-1.7 3-.4 7.4 1.2 9.8.8 1.2 1.8 2.5 3 2.4 1.2 0 1.7-.8 3.1-.8 1.5 0 1.9.8 3.2.8 1.3 0 2.1-1.2 2.9-2.4.9-1.4 1.3-2.7 1.3-2.8-.1 0-2.4-.9-2.4-4.1zM10.8 2.9c.7-.8 1.1-1.9 1-3-1 0-2.1.7-2.8 1.5-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.6 2.8-1.4z"/></svg>
        Sign in with Apple
      </button>
      <div className="divider"><span>or</span></div>
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
        <Link to="/signup">New to Davey? Create an account</Link>
      </div>
    </AuthCard>
  )
}
