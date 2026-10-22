import { useMemo, useState } from 'react'
import { MonthPicker, Stat } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { currentMonth } from '../lib/budget'
import { useData } from '../lib/DataProvider'
import { displayName, money, shortDate } from '../lib/format'
import { FREQUENCY_LABEL, detectRecurring, mergeStored, occurrencesInMonth, type Recurring, type RecurringKind } from '../lib/recurring'
import { normalizeRecurring } from '../lib/tables'
import { useTable } from '../lib/useTable'

const KINDS: [RecurringKind, string][] = [['subscription', 'Subscriptions'], ['bill', 'Bills'], ['income', 'Income']]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function Calendar({ month, items, selected, onSelect }: { month: string; items: Recurring[]; selected: string | null; onSelect: (d: string) => void }) {
  const occ = useMemo(() => occurrencesInMonth(items, month), [items, month])
  const byDay = new Map<string, Recurring[]>()
  for (const o of occ) byDay.set(o.date, [...(byDay.get(o.date) ?? []), o.item])
  const [y, m] = month.split('-').map(Number)
  const first = new Date(y, m - 1, 1).getDay()
  const days = new Date(y, m, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  while (cells.length % 7) cells.push(null)
  return (
    <div className="calendar" role="grid" aria-label="Recurring charges calendar">
      <div className="cal-row cal-head" role="row">{WEEKDAYS.map((d) => <span key={d} role="columnheader" aria-label={d}>{d.slice(0, 1)}<span className="cal-wd-rest">{d.slice(1)}</span></span>)}</div>
      {Array.from({ length: cells.length / 7 }, (_, w) => (
        <div className="cal-row" role="row" key={w}>
          {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
            if (!d) return <span key={i} className="cal-cell empty-cell" role="gridcell" />
            const iso = `${month}-${String(d).padStart(2, '0')}`
            const list = byDay.get(iso) ?? []
            const out = list.filter((r) => r.kind !== 'income').reduce((s, r) => s + r.amount, 0)
            const label = `${shortDate(iso)}: ${list.length ? list.map((r) => `${r.name} ${money(r.amount)}`).join(', ') : 'nothing due'}`
            return (
              <button
                key={i}
                type="button"
                role="gridcell"
                className={'cal-cell' + (iso === today ? ' today' : '') + (iso === selected ? ' selected' : '') + (list.length ? ' has' : '')}
                aria-selected={iso === selected}
                onClick={() => onSelect(iso)}
              >
                <span className="visually-hidden">{label}</span>
                <span className="cal-day" aria-hidden>{d}</span>
                {list.length > 0 && (
                  <span className="cal-marks" aria-hidden>
                    {list.slice(0, 3).map((r) => <i key={r.key} className={'dot dot-' + r.kind} />)}
                  </span>
                )}
                {out > 0 && <span className="cal-amt num" aria-hidden>{money(out).replace('.00', '')}</span>}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function RecurringRow({ r, account }: { r: Recurring; account?: string }) {
  return (
    <div className="row">
      <span className="avatar alt" aria-hidden>{r.name.charAt(0).toUpperCase()}</span>
      <span className="row-main">
        <span className="row-title" style={{ display: 'block' }}>{r.name}</span>
        <span className="row-sub" style={{ display: 'block' }}>
          {[FREQUENCY_LABEL[r.frequency], `next ${shortDate(r.nextDate)}`, account].filter(Boolean).join(' · ')}
        </span>
      </span>
      <span className={'row-amount ' + (r.kind === 'income' ? 'positive' : '')}>
        {r.variable ? '~' : ''}{money(r.amount)}
        <small>{money(r.monthly)}/mo</small>
      </span>
    </div>
  )
}

export function RecurringScreen() {
  const { transactions, accounts } = useData()
  const stored = useTable('recurring')
  const [month, setMonth] = useState(currentMonth())
  const [kind, setKind] = useState<RecurringKind>('subscription')
  const [selected, setSelected] = useState<string | null>(null)
  const items = useMemo(() => {
    const detected = detectRecurring(transactions ?? [])
    return mergeStored(detected, (stored.result?.rows ?? []).map(normalizeRecurring))
  }, [transactions, stored.result])
  const names = useMemo(() => {
    const m = new Map<string, string>()
    for (const a of accounts ?? []) {
      m.set(a.id, displayName(a))
      if (a.plaidAccountId) m.set(a.plaidAccountId, displayName(a))
    }
    return m
  }, [accounts])

  if (!transactions) return <Spinner label="Loading recurring" />
  const subs = items.filter((r) => r.kind === 'subscription')
  const bills = items.filter((r) => r.kind === 'bill')
  const today = new Date().toISOString().slice(0, 10)
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const dueSoon = items.filter((r) => r.kind !== 'income' && r.nextDate >= today && r.nextDate <= weekOut)
  const shown = items.filter((r) => r.kind === kind)
  const dayItems = selected ? occurrencesInMonth(items, selected.slice(0, 7)).filter((o) => o.date === selected).map((o) => o.item) : []

  return (
    <div className="page">
      <div className="page-head"><div><h1>Recurring</h1><p>Subscriptions, bills and paychecks from your transactions and the Davey app.</p></div></div>
      <section className="card card-pad">
        <div className="stats">
          <Stat label="Subscriptions / month" value={money(subs.reduce((s, r) => s + r.monthly, 0))} sub={`${subs.length} active`} />
          <Stat label="Bills / month" value={money(bills.reduce((s, r) => s + r.monthly, 0))} sub={`${bills.length} bills`} />
          <Stat label="Due in the next 7 days" value={money(dueSoon.reduce((s, r) => s + r.amount, 0))} sub={`${dueSoon.length} ${dueSoon.length === 1 ? 'charge' : 'charges'}`} />
        </div>
      </section>

      <div className="split-2">
        <section className="card card-pad" aria-labelledby="cal-title">
          <div className="cal-top">
            <h2 id="cal-title">Calendar</h2>
            <MonthPicker month={month} onChange={(m) => { setMonth(m); setSelected(null) }} />
          </div>
          <Calendar month={month} items={items} selected={selected} onSelect={setSelected} />
          <div className="legend cal-legend" aria-hidden>
            <span><i className="dot dot-subscription" />Subscription</span>
            <span><i className="dot dot-bill" />Bill</span>
            <span><i className="dot dot-income" />Income</span>
          </div>
          {selected && (
            <div className="day-detail" aria-live="polite">
              <h3>{shortDate(selected)}</h3>
              {dayItems.length ? dayItems.map((r) => <RecurringRow key={r.key} r={r} account={r.accountId ? names.get(r.accountId) : undefined} />) : <p className="muted">Nothing expected.</p>}
            </div>
          )}
        </section>

        <section className="card" aria-labelledby="list-title">
          <div className="card-head">
            <h2 id="list-title" className="visually-hidden">Recurring list</h2>
            <div className="segmented" role="group" aria-label="Type">
              {KINDS.map(([k, l]) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{l}</button>)}
            </div>
          </div>
          {shown.length === 0 ? (
            <div className="empty"><p>None found yet. Davey needs about three months of history to spot a pattern.</p></div>
          ) : (
            <ul className="list">{shown.map((r) => <li key={r.key}><RecurringRow r={r} account={r.accountId ? names.get(r.accountId) : undefined} /></li>)}</ul>
          )}
        </section>
      </div>
      <p className="muted small">"~" means the amount varies; the typical amount is shown. Amounts per month are normalized (weekly × 52 ÷ 12).</p>
    </div>
  )
}
