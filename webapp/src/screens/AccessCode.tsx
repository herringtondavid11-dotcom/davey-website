import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { AuthCard } from '../components/AuthCard'
import { hasAccess, minutesUntil, recheckPass, verifyPin } from '../lib/accessPass'

/** Where to go after the code: only paths inside the app. */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/login'
}

/** Sign-in, sign-up and forgot-password need the company access code first (once per device, 30 days). */
export function AccessGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const navigate = useNavigate()
  const allowed = hasAccess()
  useEffect(() => {
    if (!allowed) return
    void recheckPass().then((valid) => {
      if (!valid) navigate(`/access?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true })
    })
    // Only on first arrival at a gated screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  if (!allowed) return <Navigate to={`/access?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  return <>{children}</>
}

export function AccessCode() {
  const location = useLocation()
  const navigate = useNavigate()
  const next = safeNext(new URLSearchParams(location.search).get('next'))
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [lockedUntil, setLockedUntil] = useState<Date | null>(null)
  const [busy, setBusy] = useState(false)
  const digits = code.replace(/\D/g, '')

  if (hasAccess() && !busy) return <Navigate to={next} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (digits.length !== 6) return
    setBusy(true)
    setError('')
    const result = await verifyPin(digits)
    setBusy(false)
    if (result.ok) {
      navigate(next, { replace: true })
      return
    }
    setCode('')
    if (result.kind === 'wrong') {
      setError(`That code isn't right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left before a 15-minute pause.`)
    } else if (result.kind === 'locked') {
      setLockedUntil(result.retryAt)
      setError(`Too many wrong codes. Try again in ${minutesUntil(result.retryAt)} minutes.`)
    } else {
      setError("Couldn't check the code right now. Check your connection and try again.")
    }
  }

  const locked = lockedUntil !== null && lockedUntil.getTime() > Date.now()
  return (
    <AuthCard title="Company access code" lead="Davey on the web is invite-only for now. Enter the 6-digit code you were given.">
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span>Access code</span>
          <input
            className="input code-input"
            inputMode="numeric"
            autoComplete="off"
            maxLength={7}
            autoFocus
            disabled={locked}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))}
          />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-block" disabled={busy || locked || digits.length !== 6}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
      <p className="muted small">This device stays approved for 30 days. You'll still sign in with your Davey account and 2-step verification.</p>
    </AuthCard>
  )
}
