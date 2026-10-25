import '../styles/accounts.css'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { BankBadge } from '../components/BankBadge'
import { CategoryChart } from '../components/CategoryChart'
import { CategoryManagerDialog } from '../components/CategoryManager'
import { CategoryPicker } from '../components/CategoryPicker'
import { ConnectionRow } from '../components/ConnectionStatus'
import { GoalBar } from '../components/GoalBar'
import { ChevronIcon } from '../components/Icons'
import { Spinner } from '../components/Spinner'
import {
  BUILT_IN, categoryTotals, filterRows, rowsFor, sections as groupRows, sortRows, suggestion,
  type AccountCategory, type GroupBy, type Row, type Section, type SortBy,
} from '../lib/accountCategories'
import { fraction, goalRow, signedCents, summary } from '../lib/accountGoals'
import { useData } from '../lib/DataProvider'
import { refreshData, setAccountCategory, updateAccountGoal, updateAccountNickname, updateAccountUsage } from '../lib/data'
import { isLiability } from '../lib/finance'
import { displayName, maskLabel, money, percentText, shortDateTime, typeLabel } from '../lib/format'
import type { Account, Usage } from '../lib/schema'
import { createManualAccount } from '../lib/serverData'
import { normalizeItem } from '../lib/tables'
import { useAccountCategories } from '../lib/useAccountCategories'
import { useConnectionCheck } from '../lib/useConnectionCheck'
import { useTable } from '../lib/useTable'

// The Accounts tab (same as the app's AccountsTabView): every account with its bank, name and category in their own
// columns, rolled up by the household's account categories (Settings › Account categories). A chart of what's owned
// by category sits on top; choosing a category there filters the list. Group by category, bank or nothing; sort; filter
// by category and bank chips; collapse sections. Each person's choices are remembered in this browser.

const SORTS: { key: SortBy; label: string }[] = [
  { key: 'balance', label: 'Balance' },
  { key: 'name', label: 'Name' },
  { key: 'bank', label: 'Bank' },
  { key: 'funded', label: '% Funded' },
  { key: 'updated', label: 'Recently updated' },
]

/** What Automatic gives this account (the category its type suggests). */
function suggestedName(a: Account, categories: AccountCategory[]): string | undefined {
  const key = suggestion({ daveyType: a.subtype, type: a.type, name: a.name, officialName: a.officialName, loanKind: a.loanKind })
  const id = BUILT_IN.find((b) => b.key === key)?.id
  return categories.find((c) => c.id === id)?.name ?? categories.find((c) => c.id === BUILT_IN.at(-1)!.id)?.name
}

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

/** One account: Bank | Account | Category, then the balance; its goal below. The name opens nickname and use. */
function AccountRow({ r, categories, onPick, onManage }: { r: Row; categories: AccountCategory[]; onPick: (a: Account, id: string | null) => Promise<void>; onManage: () => void }) {
  const a = r.account
  const [editing, setEditing] = useState(false)
  const [open, setOpen] = useState(false)
  const row = goalRow(a)
  const f = fraction(row)
  const debt = isLiability(a)
  return (
    <li className="goal-row" data-testid={`account-${a.id}`}>
      <div className="acct-row">
        <span className="acct-bank"><BankBadge name={r.bank} color={a.bankColor} logo={a.bankLogo} /><span className="acct-bank-name">{r.bank}</span></span>
        <button type="button" className="acct-name" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          <span className="row-title">{displayName(a)}</span>{a.mask && <span className="muted small"> ••{a.mask}</span>}
          <ChevronIcon className={open ? 'chev open' : 'chev'} />
        </button>
        <span className="acct-cat"><CategoryPicker label={displayName(a)} value={r.picked ? r.category?.id : undefined} categories={categories} suggested={suggestedName(a, categories)} onPick={(id) => onPick(a, id)} onManage={onManage} /></span>
        <span className={'row-amount acct-amount ' + (debt ? 'negative' : '')}>{money(debt ? -Math.abs(a.balance) : a.balance, a.currency)}</span>
      </div>
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

interface Prefs {
  group: GroupBy
  sort: SortBy
  dir: 1 | -1
  view: 'list' | 'table'
  chart: 'donut' | 'bar'
  categories: string[]
  banks: string[]
  collapsed: string[]
}
const DEFAULT_PREFS: Prefs = { group: 'category', sort: 'balance', dir: 1, view: 'list', chart: 'donut', categories: [], banks: [], collapsed: [] }

/** Each person's grouping, sort, filters and layout, kept in this browser. */
function usePrefs(userId: string | undefined): [Prefs, (change: Partial<Prefs>) => void] {
  const key = `davey.accounts.prefs.${userId ?? 'anon'}`
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(key) ?? '{}') as Partial<Prefs>) }
    } catch {
      return DEFAULT_PREFS
    }
  })
  const update = (change: Partial<Prefs>) => setPrefs((p) => {
    const next = { ...p, ...change }
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* private mode */ }
    return next
  })
  return [prefs, update]
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export function Accounts() {
  const { accounts, replaceAccount } = useData()
  const { session } = useAuth()
  const { categories } = useAccountCategories()
  const items = useTable('items')
  const connections = useMemo(() => (items.result?.rows ?? []).map(normalizeItem), [items.result])
  const check = useConnectionCheck(connections, items.reload)
  const [showHidden, setShowHidden] = useState(false)
  const [query, setQuery] = useState('')
  const [prefs, setPrefs] = usePrefs(session?.user.id)
  const [managing, setManaging] = useState(false)

  if (!accounts || !categories) return <Spinner label="Loading accounts" />
  const shown = accounts.filter((a) => showHidden || !a.hidden)
  const visible = accounts.filter((a) => !a.hidden)
  const totals = summary(visible.map(goalRow), visible.reduce((s, a) => s + signedCents(a), 0))
  const issues = connections.filter((c) => c.health !== 'ok')
  const hiddenCount = accounts.filter((a) => a.hidden).length
  const allRows = rowsFor(shown, categories)
  const chartTotals = categoryTotals(rowsFor(visible, categories), categories)
  const rows = sortRows(filterRows(allRows, { query, categories: prefs.categories, banks: prefs.banks }), prefs.sort, prefs.dir)
  const secs = groupRows(rows, prefs.group, categories)
  const banks = [...new Set(allRows.map((r) => r.bank))].sort((a, b) => a.localeCompare(b))
  const usedCategories = chartTotals.map((t) => ({ id: t.id, name: t.name, color: t.color }))
  const filtering = prefs.categories.length > 0 || prefs.banks.length > 0 || query.trim() !== ''
  const pick = async (a: Account, id: string | null) => replaceAccount(await setAccountCategory(a, id))

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Accounts</h1><p>Balances, goals and categories for every account. Shared with the Davey app and your household.</p></div>
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

      {chartTotals.length > 0 && (
        <section className="card card-pad" aria-labelledby="by-category-title">
          <div className="card-head">
            <h2 id="by-category-title">By category</h2>
            <div className="segmented compact" role="group" aria-label="Chart">
              <button type="button" aria-pressed={prefs.chart === 'donut'} onClick={() => setPrefs({ chart: 'donut' })}>Donut</button>
              <button type="button" aria-pressed={prefs.chart === 'bar'} onClick={() => setPrefs({ chart: 'bar' })}>Bar</button>
            </div>
          </div>
          <CategoryChart totals={chartTotals} mode={prefs.chart} selected={prefs.categories} onToggle={(id) => setPrefs({ categories: toggle(prefs.categories, id) })} />
          <p className="muted small">The chart shows what you own; debts appear in the list with their totals. Choose a category to show only its accounts.</p>
        </section>
      )}

      {accounts.length > 0 && (
        <div className="goals-tools accounts-tools">
          <input className="input" type="search" placeholder="Search bank, name, last 4, category" aria-label="Search accounts" value={query} onChange={(e) => setQuery(e.target.value)} />
          <label className="inline-select"><span>Group</span>
            <select className="input" aria-label="Group by" value={prefs.group} onChange={(e) => setPrefs({ group: e.target.value as GroupBy })}>
              <option value="category">Category</option><option value="bank">Bank</option><option value="none">None</option>
            </select>
          </label>
          <label className="inline-select"><span>Sort</span>
            <select className="input" aria-label="Sort by" value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value as SortBy, dir: 1 })}>
              {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </label>
          <div className="segmented compact" role="group" aria-label="Layout">
            <button type="button" aria-pressed={prefs.view === 'list'} onClick={() => setPrefs({ view: 'list' })}>List</button>
            <button type="button" aria-pressed={prefs.view === 'table'} onClick={() => setPrefs({ view: 'table' })}>Table</button>
          </div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setManaging(true)}>Manage categories</button>
        </div>
      )}

      {accounts.length > 0 && (
        <div className="filter-chips" role="group" aria-label="Filter accounts">
          {usedCategories.map((c) => (
            <button key={c.id} type="button" className="filter-chip" aria-pressed={prefs.categories.includes(c.id)} onClick={() => setPrefs({ categories: toggle(prefs.categories, c.id) })}>
              <i className={`swatch cc-${c.color}`} aria-hidden="true" />{c.name}
            </button>
          ))}
          <span className="chip-sep" aria-hidden="true" />
          {banks.map((b) => (
            <button key={b} type="button" className="filter-chip" aria-pressed={prefs.banks.includes(b)} onClick={() => setPrefs({ banks: toggle(prefs.banks, b) })}>{b}</button>
          ))}
          {filtering && <button type="button" className="link-btn small" onClick={() => { setQuery(''); setPrefs({ categories: [], banks: [] }) }}>Clear filters</button>}
        </div>
      )}

      {issues.length > 0 && (
        <section className="card alert-card" aria-labelledby="issues-title">
          <div className="card-head"><h2 id="issues-title">{issues.length === 1 ? '1 connection needs attention' : `${issues.length} connections need attention`}</h2></div>
          {issues.map((c) => <ConnectionRow key={c.id} c={c} checking={!!c.itemId && check.checking.has(c.itemId)} problem={c.itemId ? check.problems.get(c.itemId) : undefined} onRetry={c.itemId ? () => void check.retry(c.itemId!) : undefined} />)}
        </section>
      )}

      {prefs.view === 'table' ? (
        <AccountsTable secs={secs} grouped={prefs.group !== 'none'} categories={categories} onPick={pick} onManage={() => setManaging(true)}
          sort={prefs.sort} dir={prefs.dir} onSort={(sort) => setPrefs(sort === prefs.sort ? { dir: prefs.dir === 1 ? -1 : 1 } : { sort, dir: 1 })} />
      ) : secs.map((g) => {
        const collapsed = prefs.collapsed.includes(g.key)
        return (
          <section className="card" key={g.key} aria-label={g.title}>
            <button type="button" className="group-label group-toggle" aria-expanded={!collapsed} onClick={() => setPrefs({ collapsed: toggle(prefs.collapsed, g.key) })}>
              <span className="group-title">{g.category && <i className={`swatch cc-${g.category.color}`} aria-hidden="true" />}{g.title}<span className="muted"> · {g.rows.length}</span></span>
              <span className="group-total num">{money(g.total / 100)}{g.goals.fraction !== undefined ? ` · ${percentText(g.goals.fraction * 100)} funded` : ''}</span>
              <ChevronIcon className={collapsed ? 'chev' : 'chev open'} />
            </button>
            {!collapsed && <ul className="list">{g.rows.map((r) => <AccountRow key={r.account.id} r={r} categories={categories} onPick={pick} onManage={() => setManaging(true)} />)}</ul>}
          </section>
        )
      })}
      {accounts.length > 0 && rows.length === 0 && <p className="muted">No accounts match. <button type="button" className="link-btn" onClick={() => { setQuery(''); setPrefs({ categories: [], banks: [] }) }}>Clear filters</button></p>}
      {accounts.length === 0 && (
        <section className="card"><div className="empty"><p>No accounts yet. Connect an account or add one to track balances and goals.</p><Link className="btn btn-primary" to="/connect">Connect an account</Link></div></section>
      )}
      {connections.length > 0 && (
        <section className="card" aria-labelledby="conn-title">
          <div className="card-head"><h2 id="conn-title">Bank connections</h2><Link to="/help">Connection help</Link></div>
          {connections.map((c) => <ConnectionRow key={c.id} c={c} checking={!!c.itemId && check.checking.has(c.itemId)} problem={c.itemId ? check.problems.get(c.itemId) : undefined} onRetry={c.itemId ? () => void check.retry(c.itemId!) : undefined} />)}
        </section>
      )}
      {managing && <CategoryManagerDialog onClose={() => setManaging(false)} />}
      {hiddenCount > 0 && (
        <button className="link-btn" onClick={() => setShowHidden((v) => !v)}>{showHidden ? 'Hide hidden accounts' : `Show ${hiddenCount} hidden ${hiddenCount === 1 ? 'account' : 'accounts'}`}</button>
      )}
    </div>
  )
}

const COLUMNS: { key: SortBy | 'category' | 'goal'; label: string; num?: boolean }[] = [
  { key: 'bank', label: 'Bank' },
  { key: 'name', label: 'Account' },
  { key: 'category', label: 'Category' },
  { key: 'balance', label: 'Balance', num: true },
  { key: 'goal', label: 'Goal', num: true },
  { key: 'funded', label: '% Funded', num: true },
  { key: 'updated', label: 'Updated', num: true },
]

/** The spreadsheet view: sortable Bank | Account | Category | Balance | Goal | % Funded | Updated, subtotal per section. */
function AccountsTable({ secs, grouped, categories, onPick, onManage, sort, dir, onSort }: {
  secs: Section[]; grouped: boolean; categories: AccountCategory[]; onPick: (a: Account, id: string | null) => Promise<void>; onManage: () => void
  sort: SortBy; dir: 1 | -1; onSort: (s: SortBy) => void
}) {
  return (
    <section className="card table-card" aria-label="Accounts table">
      <div className="table-scroll">
        <table className="accounts-table">
          <thead>
            <tr>{COLUMNS.map((c) => {
              const sortable = c.key !== 'category' && c.key !== 'goal'
              const active = sortable && c.key === sort
              return (
                <th key={c.key} scope="col" className={c.num ? 'num' : undefined} aria-sort={active ? (dir === 1 ? 'descending' : 'ascending') : undefined}>
                  {sortable ? <button type="button" className="th-sort" onClick={() => onSort(c.key as SortBy)}>{c.label}{active ? (dir === 1 ? ' ↓' : ' ↑') : ''}</button> : c.label}
                </th>
              )
            })}</tr>
          </thead>
          {secs.map((g) => (
            <tbody key={g.key}>
              {grouped && (
                <tr className="subtotal">
                  <th scope="row" colSpan={3}>{g.category && <i className={`swatch cc-${g.category.color}`} aria-hidden="true" />}{g.title} <span className="muted small">· {g.rows.length}</span></th>
                  <td className="num">{money(g.total / 100)}</td>
                  <td className="num">{g.goals.goalCount ? money(g.goals.totalGoals / 100) : '—'}</td>
                  <td className="num">{g.goals.fraction !== undefined ? percentText(g.goals.fraction * 100) : '—'}</td>
                  <td />
                </tr>
              )}
              {g.rows.map((r) => {
                const a = r.account
                const row = goalRow(a)
                const f = fraction(row)
                const debt = isLiability(a)
                return (
                  <tr key={a.id}>
                    <td><span className="acct-bank"><BankBadge name={r.bank} color={a.bankColor} logo={a.bankLogo} /><span className="acct-bank-name">{r.bank}</span></span></td>
                    <th scope="row">{displayName(a)}{a.mask ? <span className="muted small"> ••{a.mask}</span> : null}</th>
                    <td className="cat-cell"><CategoryPicker label={displayName(a)} value={r.picked ? r.category?.id : undefined} categories={categories} suggested={suggestedName(a, categories)} onPick={(id) => onPick(a, id)} onManage={onManage} /></td>
                    <td className={'num ' + (debt ? 'negative' : '')}>{money(debt ? -Math.abs(a.balance) : a.balance, a.currency)}</td>
                    <td className="num">{row.goal !== undefined ? (debt && row.goal === 0 ? 'Pay off' : money(row.goal / 100)) : '—'}</td>
                    <td className="num">{f !== undefined ? percentText(f * 100) : '—'}</td>
                    <td className="num muted small" title={a.lastSynced ? shortDateTime(a.lastSynced) : undefined}>{a.lastSynced ? new Date(a.lastSynced).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          ))}
        </table>
      </div>
    </section>
  )
}

