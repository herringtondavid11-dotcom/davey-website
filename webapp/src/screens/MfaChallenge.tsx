import { useEffect, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { listFactors, verifyCode, verifyWithRecoveryKey, type FactorSummary } from '../auth/mfa'
import { AuthCard } from '../components/AuthCard'
import { Spinner } from '../components/Spinner'

export function MfaChallenge() {
  const { refresh, signOut, setMustRotateBackup } = useAuth()
  const [factors, setFactors] = useState<FactorSummary | null>(null)
  const [mode, setMode] = useState<'code' | 'recovery'>('code')
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listFactors().then(setFactors, (e) => setError(e.message))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!factors) return
    setBusy(true)
    setError('')
    try {
      if (mode === 'code') {
        const factor = factors.primary ?? factors.backup
        if (!factor) throw new Error('No authenticator is set up for this account.')
        await verifyCode(factor.id, value)
      } else {
        if (!factors.backup) throw new Error('This account has no recovery key. Use your authenticator app.')
        await verifyWithRecoveryKey(factors.backup, value)
        setMustRotateBackup(true)
      }
      await refresh()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  const digits = value.replace(/\D/g, '')
  return (
    <AuthCard
      title="2-step verification"
      lead={mode === 'code' ? 'Enter the 6-digit code from your authenticator app.' : 'Enter the recovery key you saved when you set up 2-step verification.'}
    >
      {!factors && !error ? (
        <Spinner />
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          {mode === 'code' ? (
            <label className="field">
              <span>Code</span>
              <input
                className="input code-input"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/[^\d ]/g, ''))}
              />
            </label>
          ) : (
            <label className="field">
              <span>Recovery key</span>
              <input className="input" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={busy || (mode === 'code' ? digits.length !== 6 : value.trim().length < 16)}>
            {busy ? 'Verifying…' : 'Verify'}
          </button>
        </form>
      )}
      <div className="auth-foot">
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'code' ? 'recovery' : 'code')
            setValue('')
            setError('')
          }}
        >
          {mode === 'code' ? 'Use a recovery key' : 'Use authenticator code'}
        </button>
        <button type="button" className="link-btn" onClick={() => signOut()}>Cancel</button>
      </div>
    </AuthCard>
  )
}
