import { useState, type FormEvent } from 'react'
import { useData } from '../lib/DataProvider'
import { updateAccountNickname } from '../lib/data'
import { maskLabel, typeLabel } from '../lib/format'
import type { Account } from '../lib/schema'

export function NameAccounts({ accounts, institution, onDone }: { accounts: Account[]; institution?: string; onDone: () => void }) {
  const { replaceAccount } = useData()
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(accounts.map((a) => [a.id, a.nickname ?? ''])))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      for (const a of accounts) {
        const name = names[a.id]?.trim() ?? ''
        if (name !== (a.nickname ?? '')) replaceAccount(await updateAccountNickname(a, name))
      }
      onDone()
    } catch (err) {
      setError((err as Error).message || "Couldn't save the names.")
      setBusy(false)
    }
  }

  return (
    <section className="card" aria-labelledby="name-title">
      <div className="card-head" style={{ display: 'grid', gap: 4 }}>
        <h2 id="name-title">Name your accounts</h2>
        <p className="muted">{institution ? `${institution} is connected. ` : 'Your bank is connected. '}Give each account a name you'll recognize, or leave it as is.</p>
      </div>
      <form onSubmit={submit}>
        {accounts.length === 0 ? (
          <div className="empty"><p>Your accounts are still syncing. They'll appear on Overview shortly, and you can rename them in Settings.</p></div>
        ) : (
          accounts.map((a) => (
            <label className="name-row field" key={a.id}>
              <span>{a.name} {maskLabel(a.mask)} <span className="muted" style={{ fontWeight: 500 }}>· {typeLabel(a.type)}</span></span>
              <input className="input" placeholder={a.name} maxLength={40} value={names[a.id] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [a.id]: e.target.value }))} />
            </label>
          ))
        )}
        <div className="card-pad" style={{ display: 'grid', gap: 12 }}>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="sheet-actions">
            {accounts.length > 0 && <button type="button" className="btn btn-secondary" onClick={onDone}>Skip</button>}
            <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Done'}</button>
          </div>
        </div>
      </form>
    </section>
  )
}
