import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ConnectionRow } from '../components/ConnectionStatus'
import { GoalBar } from '../components/GoalBar'
import { ChevronIcon } from '../components/Icons'
import { Spinner } from '../components/Spinner'
import { GROUPS, fraction, goalRow, groupOf, signedCents, sortAccounts, summary, type GoalSort } from '../lib/accountGoals'
import { useData } from '../lib/DataProvider'
import { refreshData, updateAccountGoal, updateAccountNickname, updateAccountUsage } from '../lib/data'
import { isLiability } from '../lib/finance'
import { displayName, maskLabel, money, percentText, typeLabel } from '../lib/format'
import type { Account, Usage } from '../lib/schema'
import { createManualAccount } from '../lib/serverData'
import { normalizeItem } from '../lib/tables'
import { useConnectionCheck } from '../lib/useConnectionCheck'
import { useTable } from '../lib/useTable'

// The Accounts tab (same as the app's AccountsTabView): every account with its goal. The header totals the balances
// and the goals (cumulative % funded, accounts with a goal only); rows are grouped Cash, Savings, Credit Cards, Loans &
// Mortgages, Investments, Other. Debts have payoff goals ("paid off"). Goals sync with the app through household data.

const SORTS: { key: GoalSort; label: string }[] = [
  { key: 'funded', label: '% Funded' },
  { key: 'balance', label: 'Balance' },
  { key: 'name', label: 'Name' },
]

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
      <div className="row-sub">{[a.name !== displayName(a) ? a.name : null, a.institution, maskLabel(a.mask), typeLabel(a.type)].filter(Boolean).join(' · ')}</div>
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

/** Set or edit a goal: an amount (for debts, the balance to get down to; 0 = paid off) and an optional date. */
function GoalEditor({ a, onDone }: { a: Account; onDone: () => void }) {
  const { replaceAccount } = useData()
  const debt = isLiability(a)
  const [amount, setAmount] = useState(a.goalTarget !== undefined ? String(a.goalTarget) : '')
  const [date, setDate] = useState(a.goalTargetDate ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const value = amount.trim() === '' ? (debt ? 0 : NaN) : Number(amount.replace(/[$,\s]/g, ''))
  const valid = Number.isFinite(value) && (debt ? value >= 0 : value > 0)

  async function save(target: number | undefined) {
    setBusy(true)
    setError('')
    try {
      replaceAccount(await updateAccountGoal(a, target, date || undefined))
      onDone()
    } catch (e) {
      setError((e as Error).message || "Couldn't save the goal.")
    } finally {
      setBusy(false)
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    if (valid) void save(value)
  }

  return (
    <form className="goal-editor" onSubmit={submit} aria-label={`Goal for ${displayName(a)}`}>
      <label className="field">
        <span>{debt ? 'Target balance (0 = paid off)' : 'Goal amount'}</span>
        <input className="input" inputMode="decimal" autoFocus value={amount} placeholder={debt ? '0' : '10,000'} onChange={(e) => setAmount(e.target.value)} data-testid="goal-amount" />
      </label>
      <label className="field">
        <span>Target date (optional)</span>
        <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <p className="muted small">{debt ? "Payoff goals track what you've paid down from today's balance." : 'Progress is the balance divided by the goal.'}</p>
      {error && <p className="error small" role="alert">{error}</p>}
      <div className="row-actions">
        <button className="btn btn-primary btn-sm" disabled={!valid || busy} data-testid="goal-save">{busy ? 'Saving…' : 'Save goal'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onDone}>Cancel</button>
        {a.goalTarget !== undefined && <button type="button" className="link-btn" disabled={busy} onClick={() => save(undefined)}>Remove goal</button>}
      </div>
    </form>
  )
}

function AccountGoalRow({ a }: { a: Account }) {
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const row = goalRow(a)
  const f = fraction(row)
  const debt = isLiability(a)
  return (
    <li className="goal-row">
      <button type="button" className="goal-row-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="row-title">{displayName(a)}</span>
        <span className={'row-amount ' + (debt ? 'negative' : '')}>{money(debt ? -Math.abs(a.balance) : a.balance, a.currency)}</span>
        <ChevronIcon className={open ? 'chev open' : 'chev'} />
      </button>
      {f !== undefined && row.goal !== undefined ? (
        <>
          <GoalBar fraction={f} label={`${displayName(a)} goal progress`} />
          <div className="goal-meta">
            <button type="button" className="link-btn small" onClick={() => setEditing((v) => !v)} data-testid="goal-edit">
              {debt ? (row.goal === 0 ? 'Goal: pay off' : `Goal: ${money(row.goal / 100)} owed`) : `Goal: ${money(row.goal / 100)}`}
              {a.goalTargetDate && ` by ${new Date(`${a.goalTargetDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`}
            </button>
            <strong className="small num">{percentText(f * 100)} {debt ? 'paid off' : 'funded'}</strong>
          </div>
        </>
      ) : (
        !editing && <button type="button" className="link-btn small goal-set" onClick={() => setEditing(true)} data-testid="goal-set">Set goal</button>
      )}
      {editing && <GoalEditor a={a} onDone={() => setEditing(false)} />}
      {open && <AccountEditor a={a} />}
    </li>
  )
}

const MANUAL_TYPES = [
  ['checking', 'Checking'], ['savings', 'Savings'], ['cash', 'Cash'], ['creditCard', 'Credit card'], ['loan', 'Loan'],
  ['investment', 'Investment'], ['property', 'Real estate'], ['vehicle', 'Vehicle'], ['crypto', 'Crypto'],
  ['otherAsset', 'Other asset'], ['otherLiability', 'Other liability'],
] as const

/** Manual account form (used on Connect an account: "Add a manual account instead"). */
export function AddAccount({ onClose }: { onClose: () => void }) {
  const { reload } = useData()
  const [name, setName] = useState('')
  const [type, setType] = useState<string>('checking')
  const [balance, setBalance] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const amount = Number(balance.replace(/[$,\s]/g, '') || '0')
  return (
    <section className="card card-pad" aria-labelledby="add-title">
      <form
        className="add-account"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim() || !Number.isFinite(amount)) return
          setBusy(true)
          setError('')
          try {
            await createManualAccount({ name, type, balance: amount })
            await refreshData()
            await reload()
            onClose()
          } catch (err) {
            setError((err as Error).message || "Couldn't add the account.")
          } finally {
            setBusy(false)
          }
        }}
      >
        <h2 id="add-title">Add an account</h2>
        <div className="field-row">
          <label className="field"><span>Name</span><input className="input" required maxLength={40} value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="field"><span>Type</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
              {MANUAL_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span>{type === 'creditCard' || type === 'loan' || type === 'otherLiability' ? 'Amount owed' : 'Balance'}</span>
          <input className="input" inputMode="decimal" value={balance} placeholder="0.00" onChange={(e) => setBalance(e.target.value)} />
        </label>
        {error && <p className="error small" role="alert">{error}</p>}
        <div className="row-actions">
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{busy ? 'Adding…' : 'Add Account'}</button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </form>
    </section>
  )
}

export function Accounts() {
  const { accounts } = useData()
  const items = useTable('items')
  const connections = useMemo(() => (items.result?.rows ?? []).map(normalizeItem), [items.result])
  const check = useConnectionCheck(connections, items.reload)
  const [showHidden, setShowHidden] = useState(false)
  const [sort, setSort] = useState<GoalSort>('funded')
  const [query, setQuery] = useState('')

  if (!accounts) return <Spinner label="Loading accounts" />
  const shown = accounts.filter((a) => showHidden || !a.hidden)
  const visible = accounts.filter((a) => !a.hidden)
  const totals = summary(visible.map(goalRow), visible.reduce((s, a) => s + signedCents(a), 0))
  const q = query.trim().toLowerCase()
  const filtered = q ? shown.filter((a) => `${displayName(a)} ${a.name} ${a.institution ?? ''}`.toLowerCase().includes(q)) : shown
  const issues = connections.filter((c) => c.health !== 'ok')
  const hiddenCount = accounts.filter((a) => a.hidden).length

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Accounts</h1><p>Balances and goals for every account. Goals sync with the Davey app.</p></div>
      </div>

      <section className="card networth goals-head" aria-labelledby="goals-total">
        <div className="goals-head-top">
          <div>
            <div className="label" id="goals-total">Total balance</div>
            <div className="value num" data-testid="accounts-total">{money(totals.totalBalance / 100)}</div>
          </div>
          <div className="goals-head-goals">
            <div className="label">Goals</div>
            <strong className="num">{money(totals.totalGoals / 100)}</strong>
          </div>
        </div>
        {totals.fraction !== undefined ? (
          <>
            <GoalBar fraction={totals.fraction} big label="All goals" />
            <strong data-testid="goals-funded">{percentText(totals.fraction * 100)} funded across {totals.goalCount} {totals.goalCount === 1 ? 'goal' : 'goals'}</strong>
          </>
        ) : (
          <p className="goals-hint">Set a goal on any account to track your progress here.</p>
        )}
      </section>

      {/* Sort (and search) directly under the total, like the app. Connecting and adding live elsewhere. */}
      {accounts.length > 0 && (
        <div className="goals-tools">
          <input className="input" type="search" placeholder="Search accounts" aria-label="Search accounts" value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="segmented compact" role="group" aria-label="Sort">
            {SORTS.map((s) => <button key={s.key} type="button" aria-pressed={sort === s.key} onClick={() => setSort(s.key)}>{s.label}</button>)}
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <section className="card alert-card" aria-labelledby="issues-title">
          <div className="card-head"><h2 id="issues-title">{issues.length === 1 ? '1 connection needs attention' : `${issues.length} connections need attention`}</h2></div>
          {issues.map((c) => <ConnectionRow key={c.id} c={c} checking={!!c.itemId && check.checking.has(c.itemId)} problem={c.itemId ? check.problems.get(c.itemId) : undefined} onRetry={c.itemId ? () => void check.retry(c.itemId!) : undefined} />)}
        </section>
      )}


      {GROUPS.map((g) => {
        const list = sortAccounts(filtered.filter((a) => groupOf(a) === g.key), sort, displayName)
        if (!list.length) return null
        return (
          <section className="card" key={g.key} aria-label={g.title}>
            <div className="group-label"><span>{g.title}</span></div>
            <ul className="list">{list.map((a) => <AccountGoalRow key={a.id} a={a} />)}</ul>
          </section>
        )
      })}
      {accounts.length > 0 && filtered.length === 0 && <p className="muted">No accounts match “{query}”.</p>}
      {accounts.length === 0 && (
        <section className="card"><div className="empty"><p>No accounts yet. Connect an account or add one to track balances and goals.</p><Link className="btn btn-primary" to="/connect">Connect an account</Link></div></section>
      )}
      {connections.length > 0 && (
        <section className="card" aria-labelledby="conn-title">
          <div className="card-head"><h2 id="conn-title">Bank connections</h2><Link to="/help">Connection help</Link></div>
          {connections.map((c) => <ConnectionRow key={c.id} c={c} checking={!!c.itemId && check.checking.has(c.itemId)} problem={c.itemId ? check.problems.get(c.itemId) : undefined} onRetry={c.itemId ? () => void check.retry(c.itemId!) : undefined} />)}
        </section>
      )}
      {hiddenCount > 0 && (
        <button className="link-btn" onClick={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide hidden accounts' : `Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'account' : 'accounts'}`}</button>
      )}
    </div>
  )
}
