import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { AuthCard } from '../components/AuthCard'
import { authErrorMessage } from '../lib/authErrors'
import { supabase } from '../lib/supabase'

const RESEND_SECONDS = 60
const SENT_KEY = 'davey.emailCodeSentAt'

/** Sends the sign-in code to the account's email (Davey's "Your Davey sign-in link" email, which shows the code). */
async function sendCode(email: string) {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } })
  if (error) throw error
  try { sessionStorage.setItem(SENT_KEY, `${email}|${Date.now()}`) } catch { /* storage off */ }
}

/** When a code was last sent to `email` in this tab (so a reload or remount doesn't send another one). */
function lastSent(email: string): number | null {
  try {
    const [who, at] = (sessionStorage.getItem(SENT_KEY) ?? '').split('|')
    return who === email && Number(at) ? Number(at) : null
  } catch {
    return null
  }
}

/** Mask the address so the screen confirms where the code went without spelling it out: a•••@gmail.com. */
export function maskEmail(email: string): string {
  const [name, domain] = email.split('@')
  if (!domain) return email
  return `${name.slice(0, 1)}•••@${domain}`
}

export function EmailCode() {
  const { email, refresh, signOut } = useAuth()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [sentAt, setSentAt] = useState<number | null>(() => (email ? lastSent(email) : null))
  const started = useRef(false)
  const digits = code.replace(/\D/g, '')

  useEffect(() => {
    if (started.current || !email) return
    started.current = true
    const recent = lastSent(email)
    if (recent && Date.now() - recent < 10 * 60_000) return
    sendCode(email).then(() => setSentAt(Date.now()), (e) => setError(authErrorMessage(e)))
  }, [email])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!email || digits.length < 6) return
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({ email, token: digits, type: 'email' })
    setBusy(false)
    if (error) {
      setError(/expired|invalid/i.test(error.message) ? "That code didn't work or has expired. Check the newest email, or send a new code." : authErrorMessage(error))
      return
    }
    try { sessionStorage.removeItem(SENT_KEY) } catch { /* storage off */ }
    await refresh()
  }

  async function resend() {
    if (!email) return
    setError('')
    setNotice('')
    try {
      await sendCode(email)
      setSentAt(Date.now())
      setNotice('New code sent. Check your inbox (and spam).')
    } catch (e) {
      setError(authErrorMessage(e as { message?: string }))
    }
  }

  const wait = sentAt ? Math.min(RESEND_SECONDS, Math.max(0, RESEND_SECONDS - Math.floor((now - sentAt) / 1000))) : 0
  return (
    <AuthCard title="Check your email" lead={<>We sent a sign-in code to <strong>{email ? maskEmail(email) : 'your email'}</strong>. Enter it to finish signing in.</>}>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Code from the email</span>
          <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={9} autoFocus
            value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} />
        </label>
        {notice && <p className="notice" role="status">{notice}</p>}
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || digits.length < 6}>{busy ? 'Checking…' : 'Continue'}</button>
      </form>
      <div className="auth-foot">
        <button type="button" className="link-btn" disabled={wait > 0} onClick={resend}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</button>
        <button type="button" className="link-btn" onClick={() => signOut()}>Use a different account</button>
      </div>
    </AuthCard>
  )
}
