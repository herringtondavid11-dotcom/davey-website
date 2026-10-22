import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart, compact } from '../components/BarChart'
import { GoalBar } from '../components/GoalBar'
import { LineChart } from '../components/LineChart'
import { Spinner } from '../components/Spinner'
import { TransactionRow } from '../components/TransactionRow'
import { goalRow, signedCents, summary as goalSummary } from '../lib/accountGoals'
import { cashFlow, currentMonth, monthLabel, summarize } from '../lib/budget'
import { useData } from '../lib/DataProvider'
import { fetchAllTransactions } from '../lib/data'
import { netWorth } from '../lib/finance'
import { money, moneyWhole, percentText } from '../lib/format'
import { RANGES, categoryComparison, netWorthSeries, rangeStart, week, type Range } from '../lib/overviewInsights'
import { detectRecurring } from '../lib/recurring'
import type { Transaction } from '../lib/schema'
import { normalizeBudget } from '../lib/tables'
import { useTable } from '../lib/useTable'

// The redesigned Overview (same cards as the app's OverviewView): net worth trend, this week, cash flow with net
// savings, spending by category vs last month, the monthly budget, goals snapshot, and the 5 latest transactions.
// The account list lives on the Accounts tab.

const CASH_SERIES = [
  { key: 'income', name: 'Income', className: 's-income' },
  { key: 'spending', name: 'Spending', className: 's-spend' },
]
const pct = (f: number) => percentText(f * 100)
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function Overview() {
  const { accounts, transactions, error } = useData()
  const budgets = useTable('budgets')
  const [all, setAll] = useState<Transaction[] | null>(null)
  const [range, setRange] = useState<Range>('6M')
  const byId = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts])
  const byPlaidId = useMemo(() => new Map((accounts ?? []).map((a) => [a.plaidAccountId ?? a.id, a])), [accounts])

  // History needs every transaction, not just the first page the provider loads.
  useEffect(() => {
    if (!transactions) return
    let live = true
    fetchAllTransactions().then((t) => live && setAll(t), () => live && setAll(transactions))
    return () => { live = false }
  }, [transactions])

  const now = useMemo(() => new Date(), [])
  const list = all ?? transactions ?? []
  const earliest = list.length ? list[list.length - 1].date : undefined
  const series = useMemo(() => (accounts ? netWorthSeries(accounts, list, rangeStart(range, now, earliest), now) : []), [accounts, list, range, now, earliest])
  const months = useMemo(() => cashFlow(list, currentMonth(now), 6), [list, now])
  const changes = useMemo(() => categoryComparison(list, now), [list, now])
  const thisWeek = useMemo(() => week(list, now), [list, now])
  const bills = useMemo(() => {
    const today = iso(now)
    const end = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))
    return detectRecurring(list, today).filter((r) => r.kind !== 'income' && r.nextDate >= today && r.nextDate <= end).slice(0, 3)
  }, [list, now])
  const monthSpend = useMemo(() => summarize(list, currentMonth(now)), [list, now])

  if (!accounts || !transactions) return <Spinner label="Loading your accounts" />
  const worth = netWorth(accounts)
  const first = series[0]?.net ?? worth.net
  const change = worth.net - first
  const net6 = months.reduce((s, m) => s + m.net, 0)
  const visible = accounts.filter((a) => !a.hidden)
  const goals = goalSummary(visible.map(goalRow), visible.reduce((s, a) => s + signedCents(a), 0))
  const monthKeyNum = now.getFullYear() * 100 + now.getMonth() + 1
  const monthBudgets = (budgets.result?.rows ?? []).filter((r) => r.month_key === undefined || Number(r.month_key) === monthKeyNum).map(normalizeBudget)
  const budgetTotal = monthBudgets.reduce((s, b) => s + b.amount, 0)
  const budgetSpent = monthBudgets.reduce((s, b) => s + (monthSpend.byCategory.get(b.category) ?? 0), 0)
  const recent = list.slice(0, 5)
  const empty = accounts.length === 0

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Everything in one place.</p>
        </div>
        <Link className="btn btn-primary" to="/connect">Connect a Bank</Link>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {empty && (
        <section className="card"><div className="empty"><p>Connect a bank or add an account to see your net worth, cash flow and goals.</p><Link className="btn btn-primary" to="/connect">Connect a Bank</Link></div></section>
      )}
      <div className="overview-cards">
        <section className="card networth nw-trend" aria-labelledby="nw">
          <div className="nw-top">
            <div>
              <div className="label" id="nw">Net worth</div>
              <div className="value num" data-testid="net-worth">{money(worth.net)}</div>
              <div className={'nw-change num ' + (change >= 0 ? 'up' : 'down')} data-testid="net-worth-change">
                {change >= 0 ? '+' : ''}{money(change)}{first !== 0 && ` (${change >= 0 ? '+' : ''}${pct(change / Math.abs(first))})`} · {range}
              </div>
            </div>
            <div className="segmented compact on-navy" role="group" aria-label="Net worth range">
              {RANGES.map((r) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}
            </div>
          </div>
          {series.length > 1 && (
            <LineChart fitRange label={`Net worth, ${range}`} height={170} format={compact}
              points={series.map((p) => ({ label: new Date(`${p.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), title: `${p.date}: ${moneyWhole(p.net)}`, values: { net: p.net } }))}
              series={[{ key: 'net', name: 'Net worth', className: 'mark-gold' }]} />
          )}
          <div className="split">
            <div><span>Assets</span><strong className="assets num">{money(worth.assets)}</strong></div>
            <div><span>Debts</span><strong className="debts num">{money(worth.liabilities)}</strong></div>
          </div>
        </section>

        <section className="card card-pad" aria-labelledby="week">
          <h2 id="week">This week</h2>
          <div className="week-stats" data-testid="this-week">
            <div><span className="muted small">In</span><strong className="num positive">{money(thisWeek.moneyIn)}</strong></div>
            <div><span className="muted small">Out</span><strong className="num">{money(thisWeek.moneyOut)}</strong></div>
          </div>
          {thisWeek.biggest.length > 0 && (
            <>
              <div className="mini-label">Biggest expenses</div>
              <ul className="mini-list">{thisWeek.biggest.map((b) => <li key={b.id}><span>{b.name}</span><span className="num">{money(b.amount)}</span></li>)}</ul>
            </>
          )}
          {bills.length > 0 && (
            <>
              <div className="mini-label">Bills in the next 7 days</div>
              <ul className="mini-list">{bills.map((b) => <li key={b.key}><span>{b.name}</span><span className="num">{new Date(`${b.nextDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })} · {money(b.amount)}</span></li>)}</ul>
            </>
          )}
          {budgetTotal > 0 && <p className={'small ' + (budgetSpent > budgetTotal ? 'negative' : '')}>Budget {pct(budgetSpent / budgetTotal)} used</p>}
          {thisWeek.moneyIn === 0 && thisWeek.moneyOut === 0 && <p className="muted">No activity in the last 7 days.</p>}
        </section>

        <section className="card card-pad" aria-labelledby="cf">
          <div className="card-head wrap" style={{ padding: 0 }}><h2 id="cf">Cash flow</h2><Link to="/cash-flow">Details</Link></div>
          <BarChart label="Income and spending, last 6 months" series={CASH_SERIES} format={(v) => money(v)} height={200}
            groups={months.map((m) => ({ label: monthLabel(m.month, 'short'), title: monthLabel(m.month), values: { income: m.income, spending: m.spending } }))} />
          <p className={'net-savings ' + (net6 >= 0 ? 'positive' : 'negative')} data-testid="net-savings">Net savings, 6 months: {net6 >= 0 ? '+' : ''}{money(net6)}</p>
        </section>

        <section className="card card-pad" aria-labelledby="cats">
          <div className="card-head wrap" style={{ padding: 0 }}><h2 id="cats">Spending by category</h2><Link to="/budget">Budget</Link></div>
          {changes.length === 0 ? <p className="muted">No spending yet this month.</p> : (
            <ul className="mini-list cats" data-testid="category-changes">
              {changes.map((c) => (
                <li key={c.name}>
                  <span>{c.name}</span>
                  <span className="num cat-amt">
                    {money(c.thisMonth)}
                    <small className={c.change === undefined ? 'muted' : c.change > 0 ? 'negative' : 'positive'}>
                      {c.change === undefined ? 'New this month' : `${c.change >= 0 ? '+' : ''}${pct(c.change)} vs last month`}
                    </small>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card card-pad" aria-labelledby="mb">
          <div className="card-head wrap" style={{ padding: 0 }}><h2 id="mb">Monthly budget</h2><Link to="/budget">Open</Link></div>
          {budgetTotal > 0 ? (
            <>
              <p><strong className="num">{money(budgetSpent)}</strong> <span className="muted">of {money(budgetTotal)}</span></p>
              <GoalBar fraction={budgetSpent / budgetTotal} label="Budget used" />
              <p className="muted small">{budgetSpent > budgetTotal ? `${money(budgetSpent - budgetTotal)} over` : `${money(budgetTotal - budgetSpent)} left this month`}</p>
            </>
          ) : <p className="muted">No budgets this month. Set them on the Budget tab.</p>}
        </section>

        <section className="card card-pad" aria-labelledby="goals">
          <div className="card-head wrap" style={{ padding: 0 }}><h2 id="goals">Goals</h2><Link to="/accounts" data-testid="goals-open">Open Accounts</Link></div>
          {goals.fraction !== undefined ? (
            <>
              <p><strong>{pct(goals.fraction)} funded</strong> <span className="muted">· {goals.goalCount} {goals.goalCount === 1 ? 'goal' : 'goals'}</span></p>
              <GoalBar fraction={goals.fraction} label="All goals" />
            </>
          ) : <p className="muted">Set goals on your accounts to track them here.</p>}
        </section>

        <section className="card recent-card" aria-labelledby="recent">
          <div className="card-head"><h2 id="recent">Recent transactions</h2><Link to="/transactions">See all</Link></div>
          {recent.length === 0 ? (
            <div className="empty"><p>Transactions appear here after your first bank sync.</p></div>
          ) : (
            <ul className="list">
              {recent.map((t) => (
                <li key={t.id}><TransactionRow t={t} account={t.accountId ? byId.get(t.accountId) ?? byPlaidId.get(t.accountId) : undefined} /></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
