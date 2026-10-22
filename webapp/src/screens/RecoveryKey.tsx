import { useState } from 'react'
import { formatRecoveryKey } from '../lib/totp'

/** Shows a freshly created recovery key once, with copy and download, and requires acknowledgement. */
export function RecoveryKeyPanel({ secret, onDone, doneLabel = 'Continue' }: { secret: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false)
  const [copied, setCopied] = useState(false)
  const formatted = formatRecoveryKey(secret)

  function download() {
    const blob = new Blob(
      [`Davey recovery key\n\n${formatted}\n\nUse this if you lose your authenticator. It works once; Davey then gives you a new one.\n`],
      { type: 'text/plain' },
    )
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'davey-recovery-key.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="form">
      <p className="secret" data-testid="recovery-key">{formatted}</p>
      <p className="muted">Store it somewhere safe, like a password manager. It works once if you lose your authenticator; Davey then gives you a new one. This key won't be shown again.</p>
      <div className="sheet-actions" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => navigator.clipboard?.writeText(formatted).then(() => setCopied(true), () => undefined)}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={download}>Download</button>
      </div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I saved my recovery key
      </label>
      <button type="button" className="btn btn-primary btn-block" disabled={!saved} onClick={onDone}>{doneLabel}</button>
    </div>
  )
}
