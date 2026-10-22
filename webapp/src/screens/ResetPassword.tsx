import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { AuthCard } from '../components/AuthCard'
import { authErrorMessage } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

/** Reached from the reset email (PKCE ?code=, or ?token_hash=&type=recovery). The Gate runs 2-step first. */
export function ResetPassword() {
  const { clearRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (done) {
      const t = setTimeout(() => navigate('/', { replace: true }), 1200)
      return () => clearTimeout(t)
    }
  }, [done, navigate])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setError("The passwords don't match.")
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setError(authErrorMessage(error, error.message))
    clearRecovery()
    setDone(true)
  }

  return (
    <AuthCard title="Choose a new password" lead="It changes your password for the Davey app too.">
      {done ? (
        <p className="success" role="status">Password updated.</p>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <label className="field">
            <span>New password</span>
            <input className="input" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="field">
            <span>Confirm new password</span>
            <input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || password.length < 10}>{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      )}
    </AuthCard>
  )
}

export function ResetLinkExpired() {
  return (
    <AuthCard title="This link was already used or has expired" lead="Reset links work once and expire after an hour. Some email apps open links to check them, which uses them up. Request a new one and open it right away.">
      <Link className="btn btn-primary btn-block" to="/forgot">Send a new link</Link>
    </AuthCard>
  )
}
