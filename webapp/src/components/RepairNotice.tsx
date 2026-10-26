import { useState, useSyncExternalStore } from 'react'
import { useData } from '../lib/DataProvider'
import { hiddenByRepair, keepAccounts, onRepairChange, setHiddenByRepair } from '../lib/repairAccounts'
import { reloadDaveyData } from '../lib/serverData'

const label = (p: Record<string, unknown>) => String(p.nickname || p.name || 'Account') + (p.mask ? ` ••${String(p.mask)}` : '')

/** Says which accounts the one-time repair hid (repairAccounts.ts), with Undo. Shown on Accounts and Investments. */
export function RepairNotice() {
  const hidden = useSyncExternalStore(onRepairChange, hiddenByRepair)
  const { reload } = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!hidden) return null
  const n = hidden.length
  return (
    <section className="card card-pad repair-notice" role="status" aria-labelledby="repair-title">
      <h2 id="repair-title" className="small" style={{ margin: '0 0 4px' }}>Hid {n} duplicate {n === 1 ? 'account' : 'accounts'}</h2>
      <p className="small" style={{ margin: '0 0 10px', overflowWrap: 'anywhere' }}>
        Refresh all had added {n === 1 ? 'an account' : 'accounts'} you hadn't added yourself, so they showed up twice. Davey hid{' '}
        {n === 1 ? 'it' : 'them'} on every device (nothing was deleted): {hidden.map((r) => label(r.payload)).join(', ')}.
      </p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={async () => {
          setBusy(true)
          setError('')
          try {
            await keepAccounts(hidden)
            await reloadDaveyData()
            await reload()
            setHiddenByRepair(null)
          } catch (e) {
            setError((e as Error).message || "Couldn't undo. Try again.")
          } finally {
            setBusy(false)
          }
        }}>{busy ? 'Restoring…' : 'Undo'}</button>
        <button type="button" className="link-btn small" onClick={() => setHiddenByRepair(null)}>Dismiss</button>
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
    </section>
  )
}
