import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ConnectionRow } from '../components/ConnectionStatus'
import { PlusIcon } from '../components/Icons'
import { Spinner } from '../components/Spinner'
import { useData } from '../lib/DataProvider'
import { updateAccountNickname, updateAccountUsage } from '../lib/data'
import { isLiability } from '../lib/finance'
import { displayName, maskLabel, money, typeLabel } from '../lib/format'
import type { Account, Usage } from '../lib/schema'
import { normalizeItem } from '../lib/tables'
import { useTable } from '../lib/useTable'

function AccountEditor({ a }: { a: Account }) {
  const { replaceAccount } = useData()
  const [value, setValue] = useState(a.nickname ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [usageBusy, setUsageBusy] = useState(false)
  const dirty = value.trim() !== (a.nickname ?? '')

  async function setUsage(u: Usage) {
    if (u === a.usage) return
    setUsageBusy(true)
    try {
      replaceAccount(await updateAccountUsage(a, u))
    } catch {
      setState('error')
    } finally {
      setUsageBusy(false)
    }
  }

  return (
    <div className="account-editor">
      <div className="account-editor-head">
        <div style={{ minWidth: 0 }}>
          <div className="row-title">{displayName(a)}</div>
          <div className="row-sub">{[a.name !== displayName(a) ? a.name : null, maskLabel(a.mask), typeLabel(a.type)].filter(Boolean).join(' · ')}</div>
        </div>
        <div className={'row-amount ' + (isLiability(a) ? 'negative' : '')}>{money(isLiability(a) ? -Math.abs(a.balance) : a.balance, a.currency)}</div>
      </div>
      <form
        className="account-editor-fields"
        onSubmit={async (e) => {
          e.preventDefault()
          setState('saving')
          try {
            replaceAccount(await updateAccountNickname(a, value))
            setState('saved')
          } catch {
            setState('error')
          }
        }}
      >
        <label className="field grow">
          <span>Nickname</span>
          <span className="inline-field">
            <input className="input" placeholder={a.name} maxLength={40} value={value} onChange={(e) => { setValue(e.target.value); setState('idle') }} aria-label={`Nickname for ${a.name}`} />
            <button className="btn btn-secondary" disabled={!dirty || state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
          </span>
        </label>
        <div className="field">
          <span id={`use-${a.id}`}>Use</span>
          <div className="segmented" role="group" aria-labelledby={`use-${a.id}`}>
            <button type="button" aria-pressed={a.usage === 'personal'} disabled={usageBusy} onClick={() => setUsage('personal')}>Personal</button>
            <button type="button" aria-pressed={a.usage === 'business'} disabled={usageBusy} onClick={() => setUsage('business')}>Business</button>
          </div>
        </div>
      </form>
      {state === 'saved' && <span className="success small" role="status">Saved</span>}
      {state === 'error' && <span className="error small" role="alert">Couldn't save. Try again.</span>}
    </div>
  )
}

export function Accounts() {
  const { accounts, error } = useData()
  const items = useTable('items')
  const connections = useMemo(() => (items.result?.rows ?? []).map(normalizeItem), [items.result])
  const [showHidden, setShowHidden] = useState(false)

  if (!accounts) return <Spinner label="Loading accounts" />
  const byInstitution = new Map<string, Account[]>()
  for (const a of accounts) {
    if (a.hidden && !showHidden) continue
    const key = a.institution ?? 'Other accounts'
    byInstitution.set(key, [...(byInstitution.get(key) ?? []), a])
  }
  const issues = connections.filter((c) => c.health !== 'ok')
  const hiddenCount = accounts.filter((a) => a.hidden).length

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Accounts</h1><p>Nicknames and Business/Personal sync with the Davey app.</p></div>
        <Link className="btn btn-primary" to="/connect"><PlusIcon size={18} />Connect a Bank</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {issues.length > 0 && (
        <section className="card alert-card" aria-labelledby="issues-title">
          <div className="card-head"><h2 id="issues-title">{issues.length === 1 ? '1 connection needs attention' : `${issues.length} connections need attention`}</h2></div>
          {issues.map((c) => <ConnectionRow key={c.id} c={c} />)}
        </section>
      )}
      {[...byInstitution.entries()].map(([institution, list]) => {
        const conn = connections.find((c) => c.institution === institution)
        return (
          <section className="card" key={institution} aria-label={institution}>
            <div className="card-head">
              <h2>{institution}</h2>
              {conn && conn.health === 'ok' && <span className="status status-ok">Connected</span>}
            </div>
            {list.map((a) => <AccountEditor key={a.id} a={a} />)}
          </section>
        )
      })}
      {accounts.length === 0 && (
        <section className="card"><div className="empty"><p>No accounts yet.</p><Link className="btn btn-primary" to="/connect">Connect a Bank</Link></div></section>
      )}
      {connections.length > 0 && (
        <section className="card" aria-labelledby="conn-title">
          <div className="card-head"><h2 id="conn-title">Bank connections</h2><Link to="/help">Connection help</Link></div>
          {connections.map((c) => <ConnectionRow key={c.id} c={c} />)}
        </section>
      )}
      {hiddenCount > 0 && (
        <button className="link-btn" onClick={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide hidden accounts' : `Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'account' : 'accounts'}`}</button>
      )}
    </div>
  )
}
