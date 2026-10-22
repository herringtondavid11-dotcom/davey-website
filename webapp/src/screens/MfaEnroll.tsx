import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { PRIMARY_FACTOR_NAME, cleanupUnverified, createBackupKey, enrollTotp, listFactors, verifyCode } from '../auth/mfa'
import { AuthCard } from '../components/AuthCard'
import { Spinner } from '../components/Spinner'
import { formatRecoveryKey } from '../lib/totp'
import { RecoveryKeyPanel } from './RecoveryKey'

type Enrollment = { id: string; qr: string; secret: string }

// One setup at a time per page, even if this screen mounts twice (a redirect right after sign-in): two parallel
// enrollments would collide on the factor name.
let pending: Promise<Enrollment> | null = null
function startEnrollment(): Promise<Enrollment> {
  pending ??= (async () => {
    await cleanupUnverified(await listFactors())
    return enrollTotp(PRIMARY_FACTOR_NAME)
  })().finally(() => setTimeout(() => { pending = null }, 0))
  return pending
}

export function MfaEnroll() {
  const { finishEnroll, signOut } = useAuth()
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [backupKey, setBackupKey] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    startEnrollment().then(setEnrollment, (e) => setError((e as Error).message || "Couldn't start 2-step setup. Try again."))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!enrollment) return
    setBusy(true)
    setError('')
    try {
      await verifyCode(enrollment.id, code)
      setBackupKey(await createBackupKey())
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (backupKey) {
    return (
      <AuthCard title="Save your recovery key" lead="2-step verification is on.">
        <RecoveryKeyPanel secret={backupKey} onDone={finishEnroll} doneLabel="Go to Davey" />
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Turn on 2-step verification" lead="Davey on the web requires a code from an authenticator app each time you sign in.">
      {!enrollment && !error && <Spinner />}
      {enrollment && (
        <form className="form" onSubmit={submit} noValidate>
          <ol className="steps">
            <li>Open an authenticator app (Apple Passwords, Google Authenticator, 1Password…).</li>
            <li>Scan this code, or enter the setup key.</li>
            <li>Type the 6-digit code it shows.</li>
          </ol>
          <img className="qr" src={enrollment.qr} alt="QR code for your authenticator app" width="184" height="184" />
          <p className="secret" aria-label="Setup key">{formatRecoveryKey(enrollment.secret)}</p>
          <label className="field">
            <span>6-digit code</span>
            <input className="input code-input" inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || code.replace(/\D/g, '').length !== 6}>{busy ? 'Verifying…' : 'Turn on'}</button>
        </form>
      )}
      {!enrollment && error && (
        <>
          <p className="error" role="alert">{error}</p>
          <button type="button" className="btn btn-primary btn-block" onClick={() => {
            setError('')
            startEnrollment().then(setEnrollment, (e) => setError((e as Error).message || "Couldn't start 2-step setup. Try again."))
          }}>Try again</button>
        </>
      )}
      <div className="auth-foot">
        <button type="button" className="link-btn" onClick={() => signOut()}>Cancel and sign out</button>
      </div>
    </AuthCard>
  )
}
