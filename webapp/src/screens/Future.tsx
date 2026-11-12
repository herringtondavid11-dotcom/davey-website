import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { FutureChart } from '../components/FutureChart'
import { Stat } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { useData } from '../lib/DataProvider'
import { fetchTransactionsBetween } from '../lib/data'
import { centsToDollars, yearTotalCents } from '../lib/income'
import { loadIncome } from '../lib/incomeApi'
import { money, moneyWhole } from '../lib/format'
import { normalizeSnapshots } from '../lib/investments'
import {
  marksOf,
  projectFuture,
  savingsRatePercent,
  withSavingsRate,
  YEAR_MARKS,
  type FutureAssumptions,
  type FutureEvent,
  type ProjectionPoint,
} from '../lib/future'
import { loadFutureSettings, saveFutureSettings } from '../lib/futureApi'
import {
  accountBucket,
  assumptionsFromBaseline,
  deriveFutureBaseline,
  monthlyInvestmentFlow,
  type FutureBaseline,
} from '../lib/futureBaseline'
import { useTable } from '../lib/useTable'

function useNarrow(max = 719) {
  const query = `(max-width: ${max}px)`
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [query])
  return narrow
}

async function plannedAnnualIncome(): Promise<number | null> {
  try {
    const bundle = await loadIncome()
    if (!bundle.sources.length) return null
    const year = new Date().getFullYear()
    const dollars = bundle.sources.reduce((sum, source) => sum + centsToDollars(yearTotalCents(source, year)), 0)
    return dollars > 0 ? dollars : null
  } catch {
    return null
  }
}

function day(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function Future() {
  const { accounts, status } = useData()
  const snapshotsT = useTable('snapshots')
  const budgetsT = useTable('budgets')
  const narrow = useNarrow()
  const [selected, setSelected] = useState<number>(30)
  const [assumptions, setAssumptions] = useState<FutureAssumptions | null>(null)
  const [baseline, setBaseline] = useState<FutureBaseline | null>(null)
  const [error, setError] = useState('')
  const meta = useRef({ id: null as string | null, storage: 'table' as 'table' | 'local', householdId: '' })
  const dirty = useRef(false)
  const pendingSave = useRef<FutureAssumptions | null>(null)
  const writing = useRef(false)

  useEffect(() => {
    if (!accounts || !snapshotsT.result || !budgetsT.result) return
    let live = true
    const list = accounts
    const snapshots = snapshotsT.result
    const budgets = budgetsT.result
    void (async () => {
      const now = new Date()
      const from = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      const [planned, transactions, settings] = await Promise.all([
        plannedAnnualIncome(),
        fetchTransactionsBetween(day(from), day(now)).catch(() => []),
        loadFutureSettings(),
      ])
      if (!live) return
      const ids = new Set<string>()
      for (const account of list) {
        if (accountBucket(account) !== 'investment') continue
        ids.add(account.id)
        if (account.plaidAccountId) ids.add(account.plaidAccountId)
      }
      const base = deriveFutureBaseline({
        accounts: list,
        transactions,
        plannedAnnualIncome: planned,
        investmentFlowMonthly: monthlyInvestmentFlow(normalizeSnapshots(snapshots.rows), ids, now),
        budgetLimits: budgets.rows.map((row) => Number(row.amount) || 0),
        now,
      })
      meta.current = { id: settings.id, storage: settings.storage, householdId: settings.householdId }
      setBaseline(base)
      setAssumptions((current) => current ?? settings.assumptions ?? assumptionsFromBaseline(base))
      if (settings.error) setError(settings.error)
    })()
    return () => { live = false }
  }, [accounts, snapshotsT.result, budgetsT.result])

  useEffect(() => {
    if (!assumptions || !dirty.current) return
    pendingSave.current = assumptions
    const flush = async () => {
      if (writing.current || !pendingSave.current) return
      const snapshot = pendingSave.current
      pendingSave.current = null
      writing.current = true
      try {
        const current = meta.current
        const saved = await saveFutureSettings(current.householdId, snapshot, current.id, current.storage)
        meta.current = { ...meta.current, id: saved.id, storage: saved.storage }
        setError(saved.error)
      } finally {
        writing.current = false
        if (pendingSave.current) await flush()
      }
    }
    const handle = window.setTimeout(() => { void flush() }, 300)
    return () => {
      window.clearTimeout(handle)
      // Keep the latest edit when the screen changes before the debounce fires.
      if (pendingSave.current) void flush()
    }
  }, [assumptions])

  const points = useMemo(() => {
    if (!assumptions || !baseline) return []
    return projectFuture({
      investments: baseline.investments,
      cash: baseline.cash,
      other: baseline.other,
      debts: baseline.debts,
      annualIncome: baseline.annualIncome,
      assumptions,
    })
  }, [assumptions, baseline])
  const marks = useMemo(() => marksOf(points), [points])
  const shown = points.find((point) => point.year === selected) ?? marks[marks.length - 1]
  const today = points[0]

  function update(next: FutureAssumptions) {
    dirty.current = true
    setError('')
    setAssumptions(next)
  }

  if (status === 'loading' || !assumptions || !baseline || !shown || !today) return <Spinner label="Loading future" />

  const rate = savingsRatePercent(assumptions, baseline.annualIncome)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Future</h1>
          <p>Net worth at each year mark.</p>
        </div>
        <div className="segmented future-years" role="group" aria-label="Year mark">
          {YEAR_MARKS.map((year) => (
            <button key={year} type="button" aria-pressed={selected === year} onClick={() => setSelected(year)}>{year}</button>
          ))}
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="card card-pad" aria-label="Projection summary">
        <div className="stats">
          <div data-testid="future-net">
            <Stat label={`Net worth in ${shown.year} years`} value={money(shown.netWorth)} tone={shown.netWorth >= 0 ? 'positive' : 'negative'} sub={`Today ${money(today.netWorth)}`} />
          </div>
          <Stat label="Investments" value={money(shown.investments)} sub={money(today.investments) + ' today'} />
          <div data-testid="future-debts">
            <Stat label="Debts" value={money(shown.debts)} tone={shown.debts > 0 ? 'negative' : undefined} sub={money(today.debts) + ' today'} />
          </div>
          <Stat label="Annual income" value={money(shown.annualIncome)} sub={`${money(shown.cumulativeIncome)} cumulative`} />
        </div>
      </section>

      <section className="card card-pad" aria-labelledby="future-chart-title">
        <h2 id="future-chart-title">Net worth</h2>
        <FutureChart points={points} selectedYear={selected} onSelectYear={setSelected} />
      </section>

      <section className="card" aria-labelledby="future-table-title">
        <div className="card-head"><h2 id="future-table-title">At each year</h2></div>
        {narrow ? (
          <ul className="future-cards" aria-label="Net worth by year">
            {marks.map((point) => <YearCard key={point.year} point={point} selected={point.year === selected} />)}
          </ul>
        ) : (
          <div className="table-wrap future-table-wrap">
            <table className="data-table future-table" aria-label="Net worth by year">
              <thead>
                <tr>
                  <th scope="col">Year</th>
                  {TABLE_HEADS.map((head) => <th scope="col" key={head.label} title={head.title}>{head.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {marks.map((point) => {
                  const cells = figure(point)
                  return (
                    <tr key={point.year} data-testid={`future-year-${point.year}`} data-selected={point.year === selected}>
                      <th scope="row">{point.year}</th>
                      {cells.map((cell) => <td key={cell.label} className={'num' + (cell.className ? ' ' + cell.className : '')}>{cell.value}</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="future-cal-title">
        <div className="card-head">
          <h2 id="future-cal-title">Calibration</h2>
          <button type="button" className="btn btn-secondary" onClick={() => update(assumptionsFromBaseline(baseline))}>Reset</button>
        </div>
        <div className="card-pad future-cal">
          <div className="forecast-fields">
            <Field label="Investment return" value={assumptions.investmentReturnPercent} min={0} max={15} unit="%" onChange={(value) => update({ ...assumptions, investmentReturnPercent: value })} />
            <Field label="Cash yield" value={assumptions.cashYieldPercent} min={0} max={10} unit="%" onChange={(value) => update({ ...assumptions, cashYieldPercent: value })} />
            <Field label="Inflation" value={assumptions.inflationPercent} min={0} max={10} unit="%" onChange={(value) => update({ ...assumptions, inflationPercent: value })} />
            <Field label="Income growth" value={assumptions.incomeGrowthPercent} min={0} max={15} unit="%" onChange={(value) => update({ ...assumptions, incomeGrowthPercent: value })} />
            <Field label="Monthly to investments" value={assumptions.monthlyInvestment} min={-100000} max={Math.max(20000, Math.abs(assumptions.monthlyInvestment))} unit="$" onChange={(value) => update({ ...assumptions, monthlyInvestment: value, contributionBasis: 'fixed' })} />
            <Field label="Monthly to cash" value={assumptions.monthlyCash} min={-100000} max={Math.max(20000, Math.abs(assumptions.monthlyCash))} unit="$" onChange={(value) => update({ ...assumptions, monthlyCash: value, contributionBasis: 'fixed' })} />
            <Field label="Savings rate" value={rate} min={0} max={100} unit="%" disabled={baseline.annualIncome <= 0} onChange={(value) => update(withSavingsRate(assumptions, baseline.annualIncome, value))} />
            <Field label="Debt paydown" value={assumptions.debtPayment} min={0} max={Math.max(20000, assumptions.debtPayment)} unit="$" onChange={(value) => update({ ...assumptions, debtPayment: value })} />
          </div>
          <label className="check-row">
            <input type="checkbox" checked={assumptions.realDollars} onChange={(e) => update({ ...assumptions, realDollars: e.target.checked })} />
            Today's dollars
          </label>
          <Events events={assumptions.events} onChange={(events) => update({ ...assumptions, events })} />
        </div>
      </section>
    </div>
  )
}

const TABLE_HEADS: { label: string; title: string }[] = [
  { label: 'Investments', title: 'Investments' },
  { label: 'Cash', title: 'Cash' },
  { label: 'Other', title: 'Other assets' },
  { label: 'Debts', title: 'Debts' },
  { label: 'Income', title: 'Annual income that year' },
  { label: 'Cumulative', title: 'Cumulative income' },
  { label: 'Worth', title: 'Net worth' },
]

function figure(point: ProjectionPoint): { label: string; value: string; className?: string }[] {
  return [
    { label: 'Investments', value: moneyWhole(point.investments) },
    { label: 'Cash', value: moneyWhole(point.cash) },
    { label: 'Other', value: moneyWhole(point.other) },
    { label: 'Debts', value: moneyWhole(point.debts), className: point.debts > 0 ? 'negative' : undefined },
    { label: 'Annual income', value: moneyWhole(point.annualIncome) },
    { label: 'Cumulative income', value: moneyWhole(point.cumulativeIncome) },
    { label: 'Net worth', value: moneyWhole(point.netWorth), className: point.netWorth >= 0 ? 'positive' : 'negative' },
  ]
}

function YearCard({ point, selected }: { point: ProjectionPoint; selected: boolean }) {
  return (
    <li data-testid={`future-year-${point.year}`} data-selected={selected} aria-current={selected ? 'true' : undefined}>
      <h3>Year {point.year}</h3>
      <dl>
        {figure(point).map((cell) => (
          <div key={cell.label}>
            <dt>{cell.label}</dt>
            <dd className={'num' + (cell.className ? ' ' + cell.className : '')}>{cell.value}</dd>
          </div>
        ))}
      </dl>
    </li>
  )
}

function Field({ label, value, onChange, min, max, unit, disabled = false }: {
  label: string
  value: number
  onChange: (value: number) => void
  min: number
  max: number
  unit: '%' | '$'
  disabled?: boolean
}) {
  const id = useId()
  const shown = Math.round(value * 100) / 100
  const ceiling = Math.max(max, shown)
  return (
    <div className="forecast-field">
      <label htmlFor={id}>{label}</label>
      <div className="forecast-input">
        {unit === '$' && <span className="muted">$</span>}
        <input
          id={id}
          className="input num"
          type="number"
          inputMode="decimal"
          autoComplete="off"
          min={min}
          max={ceiling}
          step="any"
          disabled={disabled}
          value={Number.isFinite(shown) ? shown : 0}
          onChange={(e) => {
            const next = e.target.value === '' ? 0 : Number(e.target.value)
            if (Number.isFinite(next)) onChange(Math.min(ceiling, Math.max(min, next)))
          }}
        />
        {unit === '%' && <span className="muted">%</span>}
      </div>
      <input
        type="range"
        aria-label={`${label} slider`}
        min={min}
        max={ceiling}
        step="any"
        disabled={disabled}
        value={Math.min(ceiling, Math.max(min, shown))}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  )
}

function Events({ events, onChange }: { events: FutureEvent[]; onChange: (events: FutureEvent[]) => void }) {
  return (
    <div className="future-events">
      <div className="future-events-head">
        <h3>Events</h3>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={events.length >= 12}
          onClick={() => onChange([...events, { id: crypto.randomUUID(), year: 10, amount: 0 }])}
        >
          Add event
        </button>
      </div>
      {events.map((event, index) => {
        const expense = event.amount < 0
        const magnitude = Math.abs(event.amount)
        const n = index + 1
        return (
          <div className="future-event" key={event.id}>
            <label className="field">
              <span>Year</span>
              <select
                className="input"
                aria-label={`Event ${n} year`}
                value={event.year}
                onChange={(e) => onChange(events.map((item) => item.id === event.id ? { ...item, year: Number(e.target.value) } : item))}
              >
                {Array.from({ length: 40 }, (_, i) => i + 1).map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Kind</span>
              <select
                className="input"
                aria-label={`Event ${n} kind`}
                value={expense ? 'expense' : 'windfall'}
                onChange={(e) => {
                  const amount = e.target.value === 'expense' ? -magnitude : magnitude
                  onChange(events.map((item) => item.id === event.id ? { ...item, amount } : item))
                }}
              >
                <option value="windfall">Windfall</option>
                <option value="expense">Expense</option>
              </select>
            </label>
            <label className="field event-amount">
              <span>Amount</span>
              <span className="affix">
                <i aria-hidden>$</i>
                <input
                  className="input"
                  type="number"
                  inputMode="decimal"
                  autoComplete="off"
                  min={0}
                  step={100}
                  aria-label={`Event ${n} amount`}
                  value={magnitude}
                  onChange={(e) => {
                    const amount = Math.max(0, Number(e.target.value) || 0)
                    onChange(events.map((item) => item.id === event.id ? { ...item, amount: expense ? -amount : amount } : item))
                  }}
                />
              </span>
            </label>
            <button type="button" className="btn btn-danger event-remove" aria-label={`Remove event ${n}`} onClick={() => onChange(events.filter((item) => item.id !== event.id))}>Remove</button>
          </div>
        )
      })}
    </div>
  )
}
