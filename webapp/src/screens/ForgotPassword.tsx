import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthCard } from '../components/AuthCard'
import { APP_BASE, SITE_ORIGIN } from '../config'
import { authErrorMessage } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${SITE_ORIGIN}${APP_BASE}/reset` })
    setBusy(false)
    // Same message whether or not the account exists.
    if (error && error.status !== 400 && error.status !== 404) setError(authErrorMessage(error, error.message))
    else setSent(true)
  }

  return (
    <AuthCard title="Reset your password" lead="We'll email you a link to choose a new one.">
      {sent ? (
        <p className="notice" role="status">If an account uses {email.trim()}, a reset link is on its way. Open it on this device.</p>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <label className="field">
            <span>Email</span>
            <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || !email.includes('@')}>{busy ? 'Sending…' : 'Send reset link'}</button>
        </form>
      )}
      <div className="auth-foot"><Link to="/login">Back to sign in</Link></div>
    </AuthCard>
  )
}
