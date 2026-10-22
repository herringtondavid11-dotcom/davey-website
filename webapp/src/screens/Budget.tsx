import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Meter } from '../components/BarChart'
import { MonthPicker, Stat, UsageFilter } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { budgetRows, currentMonth, summarize, type BudgetRow } from '../lib/budget'
import { useData } from '../lib/DataProvider'
import { saveBudget } from '../lib/data'
import { money } from '../lib/format'
import type { Usage } from '../lib/schema'
import { normalizeBudget, resolvedTable } from '../lib/tables'
import { useTable } from '../lib/useTable'

function BudgetLine({ row, editable, onSave }: { row: BudgetRow | { category: string; spent: number; limit?: undefined }; editable: boolean; onSave: (amount: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(row.limit ? String(row.limit) : '')
  const [error, setError] = useState('')
  const has = row.limit !== undefined
  const r = row as BudgetRow
  async function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(value)
    if (!Number.isFinite(n) || n < 0) return setError('Enter an amount')
    try {
      await onSave(Math.round(n * 100) / 100)
      setEditing(false)
      setError('')
    } catch (err) {
      setError((err as Error).message)
    }
  }
  return (
    <li className="budget-line">
      <div className="budget-top">
        <span className="row-title">{row.category}</span>
        <span className="num budget-figures">
          <b>{money(row.spent)}</b>
          {has && <span className="muted"> of {money(r.limit)}</span>}
        </span>
      </div>
      {has && <Meter value={r.used} over={r.over} label={`${row.category}: ${Math.round(r.used * 100)}% of budget`} />}
      <div className="budget-bottom small">
        {has ? (
          <span className={r.over ? 'negative' : 'muted'}>{r.over ? `${money(-r.remaining)} over` : `${money(r.remaining)} left`}</span>
        ) : (
          <span className="muted">No budget</span>
        )}
        {editable && !editing && <button className="link-btn" onClick={() => setEditing(true)}>{has ? 'Edit' : 'Set budget'}</button>}
      </div>
      {editing && (
        <form className="inline-form" onSubmit={submit}>
          <label className="visually-hidden" htmlFor={`b-${row.category}`}>Monthly budget for {row.category}</label>
          <input id={`b-${row.category}`} className="input" inputMode="decimal" autoFocus value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Monthly amount" />
          <button className="btn btn-primary btn-sm">Save</button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          {error && <span className="error small" role="alert">{error}</span>}
        </form>
      )}
    </li>
  )
}

export function Budget() {
  const { transactions } = useData()
  const budgets = useTable('budgets')
  const [month, setMonth] = useState(currentMonth())
  const [usage, setUsage] = useState<Usage | ''>('')
  const summary = useMemo(() => summarize(transactions ?? [], month, usage), [transactions, month, usage])
  const list = useMemo(() => (budgets.result?.rows ?? []).map(normalizeBudget), [budgets.result])
  const { rows, unbudgeted } = useMemo(() => budgetRows(list, summary.byCategory), [list, summary])

  if (!transactions || !budgets.result) return <Spinner label="Loading budget" />
  const available = budgets.result.available
  const table = resolvedTable('budgets')
  const totalBudget = rows.reduce((s, r) => s + r.limit, 0)
  const budgetedSpent = rows.reduce((s, r) => s + r.spent, 0)
  const spentShare = summary.income > 0 ? summary.spending / summary.income : summary.spending > 0 ? 1 : 0

  async function save(category: string, existing: Record<string, unknown> | undefined, amount: number) {
    if (!table) throw new Error('Budgets are not available yet.')
    await saveBudget(table, existing, category, amount)
    await budgets.reload()
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Budget</h1><p>What came in, what went out, and how each budget is doing.</p></div>
        <div className="head-controls">
          <UsageFilter value={usage} onChange={setUsage} />
          <MonthPicker month={month} onChange={setMonth} />
        </div>
      </div>

      <section className="card card-pad spend-hero" aria-label="Spent versus income">
        <div className="stats">
          <Stat label="Income" value={money(summary.income)} tone="positive" />
          <Stat label="Spent" value={money(summary.spending)} />
          <Stat label={summary.net >= 0 ? 'Left over' : 'Overspent'} value={money(Math.abs(summary.net))} tone={summary.net >= 0 ? 'positive' : 'negative'} />
        </div>
        <Meter value={spentShare} over={spentShare > 1} label={`Spent ${Math.round(spentShare * 100)}% of income`} />
        <p className="muted small">
          {summary.income > 0 ? `You've spent ${Math.round(spentShare * 100)}% of this month's income.` : 'No income recorded this month yet.'} Transfers between your accounts aren't counted.
        </p>
      </section>

      <section className="card" aria-labelledby="bva">
        <div className="card-head">
          <h2 id="bva">Budgets vs actual</h2>
          {rows.length > 0 && <span className="muted small num">{money(budgetedSpent)} of {money(totalBudget)}</span>}
        </div>
        {!available && <p className="notice card-notice">Budgets you set in the Davey app will appear here. Spending by category is below.</p>}
        {available && <p className="muted small card-notice">Budgets set on the web are saved in this browser; the app's budgets stay on your iPhone and Mac.</p>}
        {available && rows.length === 0 && <p className="muted card-notice">No budgets yet. Set one on any category below.</p>}
        {rows.length > 0 && (
          <ul className="list budget-list">
            {rows.map((r) => <BudgetLine key={r.category} row={r} editable={available} onSave={(amt) => save(r.category, r.budget?.raw, amt)} />)}
          </ul>
        )}
      </section>

      {unbudgeted.length > 0 && (
        <section className="card" aria-labelledby="unb">
          <div className="card-head"><h2 id="unb">{available ? 'Not budgeted' : 'Spending by category'}</h2></div>
          <ul className="list budget-list">
            {unbudgeted.map((u) => <BudgetLine key={u.category} row={u} editable={available} onSave={(amt) => save(u.category, undefined, amt)} />)}
          </ul>
        </section>
      )}
      {summary.spending === 0 && summary.income === 0 && (
        <section className="card"><div className="empty"><p>Nothing recorded for this month.</p><Link to="/transactions">See all transactions</Link></div></section>
      )}
    </div>
  )
}
