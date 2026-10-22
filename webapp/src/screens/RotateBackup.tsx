import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { createBackupKey, listFactors } from '../auth/mfa'
import { AuthCard } from '../components/AuthCard'
import { Spinner } from '../components/Spinner'
import { RecoveryKeyPanel } from './RecoveryKey'

/** After a recovery key is used it is replaced, so every key works once. */
export function RotateBackup() {
  const { setMustRotateBackup } = useAuth()
  const [secret, setSecret] = useState<string | null>(null)
  const [error, setError] = useState('')
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    listFactors()
      .then((f) => createBackupKey(f.backup))
      .then(setSecret, (e) => setError(e.message))
  }, [])

  return (
    <AuthCard title="Your new recovery key" lead="You used your recovery key, so it no longer works. Here's a new one.">
      {secret ? <RecoveryKeyPanel secret={secret} onDone={() => setMustRotateBackup(false)} /> : error ? <p className="error">{error}</p> : <Spinner />}
      {error && <button className="btn btn-secondary" onClick={() => setMustRotateBackup(false)}>Continue without a new key</button>}
    </AuthCard>
  )
}
