import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AuthCard } from '../components/AuthCard'
import { SITE_ORIGIN } from '../config'
import { storedPass } from '../lib/accessPass'
import { authErrorMessage } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

/** Same callback as the iPhone app's confirmation emails ("Confirm here instead" on the web). */
const CALLBACK_URL = `${SITE_ORIGIN}/auth/callback`
export const MIN_PASSWORD = 10

export function SignUp() {
  const { status, refresh } = useAuth()
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [busy, setBusy] = useState(false)

  if (status !== 'signedOut' && status !== 'loading') return <Navigate to="/" replace />

  const problem =
    password && password.length < MIN_PASSWORD ? `Use at least ${MIN_PASSWORD} characters.`
    : confirm && confirm !== password ? "The passwords don't match."
    : ''

  async function submit(e: FormEvent) {
    e.preventDefault()
    const pass = storedPass()
    if (!pass) {
      setError('Enter the company access code again.')
      return
    }
    setBusy(true)
    setError('')
    const address = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signUp({
      email: address,
      password,
      options: { emailRedirectTo: CALLBACK_URL, data: { first_name: first.trim(), last_name: last.trim(), access_pass: pass.pass } },
    })
    setBusy(false)
    if (error) {
      setError(/invite-only|access code/i.test(error.message) ? 'Your access code has expired. Enter it again.' : authErrorMessage(error))
      return
    }
    if (data.session) {
      await refresh()
      return
    }
    setSentTo(address)
  }

  async function resend() {
    setNotice('')
    setError('')
    const { error } = await supabase.auth.resend({ type: 'signup', email: sentTo, options: { emailRedirectTo: CALLBACK_URL } })
    if (error) setError(authErrorMessage(error))
    else setNotice('Sent again. Check your inbox and spam folder.')
  }

  if (sentTo) {
    return (
      <AuthCard title="Check your email" lead={<>We sent a confirmation link to <strong>{sentTo}</strong>. Open it, choose "Confirm here instead", then sign in.</>}>
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" className="btn btn-secondary btn-block" onClick={resend}>Resend email</button>
        <div className="auth-foot"><Link to="/login">Back to sign in</Link></div>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Create your account" lead="The same account works in the Davey app on iPhone and Mac.">
      <form className="form" onSubmit={submit} noValidate>
        <div className="field-row">
          <label className="field">
            <span>First name</span>
            <input className="input" autoComplete="given-name" value={first} onChange={(e) => setFirst(e.target.value)} />
          </label>
          <label className="field">
            <span>Last name</span>
            <input className="input" autoComplete="family-name" value={last} onChange={(e) => setLast(e.target.value)} />
          </label>
        </div>
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-describedby="pw-hint" />
        </label>
        <p id="pw-hint" className="muted small field-hint">At least {MIN_PASSWORD} characters.</p>
        <label className="field">
          <span>Confirm password</span>
          <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {(problem || error) && <p className="error" role="alert">{error || problem}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || !first.trim() || !email.includes('@') || password.length < MIN_PASSWORD || confirm !== password}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
      <div className="auth-foot">
        <span>Already have an account? <Link to="/login">Sign in</Link></span>
      </div>
    </AuthCard>
  )
}
