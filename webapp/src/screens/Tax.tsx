import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { NumberField, Stat } from '../components/Controls'
import { DownloadIcon } from '../components/Icons'
import { Spinner } from '../components/Spinner'
import { useData } from '../lib/DataProvider'
import { fetchTransactionsBetween, updateTransaction } from '../lib/data'
import { accountNameMap, cpaZip, download, taxPdf, transactionsCsv } from '../lib/exports'
import { money, shortDate } from '../lib/format'
import type { Transaction } from '../lib/schema'
import { businessTransactions, estimateTax, findDeductions, groupDeductions, pnl, quarterly, type DeductionGroup } from '../lib/tax'

const RATE_KEY = 'davey.tax.rates'
function loadRates() {
  try {
    const r = JSON.parse(localStorage.getItem(RATE_KEY) ?? 'null')
    if (r && typeof r.federal === 'number' && typeof r.state === 'number') return r as { federal: number; state: number }
  } catch {
    /* ignore */
  }
  return { federal: 22, state: 5 }
}

export function Tax() {
  const { accounts, replaceTransaction } = useData()
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [list, setList] = useState<Transaction[] | null>(null)
  const [error, setError] = useState('')
  const [ratesPct, setRatesPct] = useState(loadRates)
  const [marked, setMarked] = useState<Set<string>>(new Set())

  useEffect(() => {
    let live = true
    setList(null)
    fetchTransactionsBetween(`${year}-01-01`, `${year}-12-31`).then(
      (l) => live && setList(l),
      (e) => live && setError(e.message),
    )
    return () => {
      live = false
    }
  }, [year])
  useEffect(() => {
    try {
      localStorage.setItem(RATE_KEY, JSON.stringify(ratesPct))
    } catch {
      /* ignore */
    }
  }, [ratesPct])

  const rates = { federal: ratesPct.federal / 100, state: ratesPct.state / 100 }
  const business = useMemo(() => businessTransactions(list ?? [], year), [list, year])
  const report = useMemo(() => pnl(business), [business])
  const est = estimateTax(report.net, rates)
  const qs = quarterly(business, year, rates)
  const hints = useMemo(() => groupDeductions(findDeductions(list ?? [], year).filter((h) => !marked.has(h.t.id))), [list, year, marked])
  const names = useMemo(() => accountNameMap(accounts ?? []), [accounts])
  const today = new Date().toISOString().slice(0, 10)

  if (error) return <div className="page"><p className="error" role="alert">{error}</p></div>
  if (!list || !accounts) return <Spinner label="Loading tax" />

  const input = { year, pnl: report, estimate: est, rates, quarters: qs, business, names }

  async function markBusiness(g: DeductionGroup) {
    try {
      for (const t of g.items) {
        const updated = await updateTransaction(t, { usage: 'business' })
        replaceTransaction(updated)
        setList((l) => l?.map((x) => (x.id === t.id ? updated : x)) ?? l)
        setMarked((m) => new Set(m).add(t.id))
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Tax</h1><p>Business profit, estimated taxes and records for your CPA. From transactions marked Business.</p></div>
        <div className="segmented" role="group" aria-label="Tax year">
          {[thisYear, thisYear - 1].map((y) => <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)}>{y}</button>)}
        </div>
      </div>

      <section className="card card-pad">
        <div className="stats">
          <Stat label="Business income" value={money(report.income)} tone="positive" />
          <Stat label="Expenses" value={money(report.expenses)} />
          <Stat label="Net profit" value={money(report.net)} tone={report.net >= 0 ? 'positive' : 'negative'} sub={`${report.count} transactions`} />
          <Stat label="Estimated tax" value={money(est.total)} sub={report.net > 0 ? `${Math.round((est.total / report.net) * 100)}% of profit` : undefined} />
        </div>
      </section>

      <div className="split-2">
        <section className="card" aria-labelledby="pnl-title">
          <div className="card-head"><h2 id="pnl-title">Profit & loss</h2></div>
          <div className="table-wrap">
            <table className="data-table">
              <tbody>
                <tr><th scope="row">Gross income</th><td className="num positive">{money(report.income)}</td></tr>
                {report.byCategory.map((c) => <tr key={c.category}><th scope="row" className="indent">{c.category}</th><td className="num">{money(-c.amount)}</td></tr>)}
                <tr><th scope="row">Total expenses</th><td className="num">{money(-report.expenses)}</td></tr>
                <tr className="total-row"><th scope="row">Net profit</th><td className={'num ' + (report.net >= 0 ? 'positive' : 'negative')}>{money(report.net)}</td></tr>
              </tbody>
            </table>
          </div>
          {report.count === 0 && <p className="muted card-notice">No Business transactions in {year}. Mark accounts or transactions as Business in <Link to="/accounts">Accounts</Link> or <Link to="/transactions">Transactions</Link>.</p>}
        </section>

        <section className="card card-pad" aria-labelledby="est-title">
          <h2 id="est-title">Estimated tax</h2>
          <div className="form-grid compact" style={{ margin: '14px 0' }}>
            <NumberField id="fed" label="Federal bracket" suffix="%" step="1" value={ratesPct.federal} onChange={(v) => setRatesPct((r) => ({ ...r, federal: Math.min(50, v) }))} />
            <NumberField id="st" label="State rate" suffix="%" step="0.1" value={ratesPct.state} onChange={(v) => setRatesPct((r) => ({ ...r, state: Math.min(20, v) }))} />
          </div>
          <dl className="est-list">
            <div><dt>Self-employment tax</dt><dd className="num">{money(est.selfEmployment)}</dd></div>
            <div><dt>Federal income tax</dt><dd className="num">{money(est.federal)}</dd></div>
            <div><dt>State income tax</dt><dd className="num">{money(est.state)}</dd></div>
            <div className="total-row"><dt>Total</dt><dd className="num">{money(est.total)}</dd></div>
          </dl>
          <p className="muted small">A planning estimate, not tax advice: 15.3% self-employment tax on 92.35% of profit, plus income tax on profit minus half of it. Ignores the Social Security wage cap, credits and other income.</p>
        </section>
      </div>

      <section className="card" aria-labelledby="q-title">
        <div className="card-head"><h2 id="q-title">Quarterly estimated payments</h2></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Period</th><th scope="col">Due</th><th scope="col">Profit</th><th scope="col">Set aside</th></tr></thead>
            <tbody>
              {qs.map((q) => (
                <tr key={q.q}>
                  <th scope="row">{q.label} <span className="muted small hide-sm">{shortDate(q.from)}–{shortDate(q.to)}</span></th>
                  <td className="wrap">{shortDate(q.due)} {q.due < today ? <span className="chip chip-pending">Past</span> : q.from <= today ? <span className="chip chip-biz">Next</span> : null}</td>
                  <td className="num">{money(q.profit)}</td>
                  <td className="num"><b>{money(q.estimate)}</b></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="muted small card-notice">Pay at IRS Direct Pay or EFTPS (and your state's site). Periods follow the IRS schedule, not calendar quarters.</p>
      </section>

      <section className="card" aria-labelledby="ded-title">
        <div className="card-head"><h2 id="ded-title">Deduction finder</h2><span className="muted small">{hints.length} to review</span></div>
        <p className="muted card-notice">These personal transactions look like business expenses. Mark the ones that are, so they count.</p>
        {hints.length === 0 ? (
          <div className="empty"><p>Nothing to review.</p></div>
        ) : (
          <ul className="list">
            {hints.slice(0, 40).map((g) => (
              <li key={g.key} className="row deduction-row">
                <span className="avatar alt" aria-hidden>{g.name.charAt(0).toUpperCase()}</span>
                <span className="row-main">
                  <span className="row-title" style={{ display: 'block' }}>{g.name}</span>
                  <span className="row-sub" style={{ display: 'block' }}>
                    {g.items.length === 1 ? shortDate(g.items[0].date) : `${g.items.length} charges`} · {g.reason}
                  </span>
                </span>
                <span className="deduction-actions">
                  <span className="num row-amount">{money(-g.total)}</span>
                  <button className="btn btn-secondary btn-sm" onClick={() => markBusiness(g)} aria-label={`Mark ${g.name} (${g.items.length}) as Business`}>
                    {g.items.length === 1 ? 'Mark Business' : 'Mark all Business'}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="card-pad tips">
          <h3>Also worth asking your CPA about</h3>
          <ul>
            <li>Home office (simplified: $5 per sq ft, up to 300 sq ft)</li>
            <li>Business mileage (log trips; standard IRS rate per mile)</li>
            <li>Health insurance premiums and retirement contributions (SEP-IRA / Solo 401k)</li>
            <li>Phone and internet, business-use share</li>
          </ul>
        </div>
      </section>

      <section className="card card-pad export-card" aria-labelledby="cpa-title">
        <h2 id="cpa-title">Send to your CPA</h2>
        <p className="muted">P&L with estimates and quarterly periods (PDF), every business transaction (CSV) and totals by category, in one ZIP.</p>
        <div className="row-actions">
          <button className="btn btn-primary" onClick={() => download(`davey-${year}-business-for-cpa.zip`, cpaZip(input), 'application/zip')}><DownloadIcon size={18} />Download CPA package (ZIP)</button>
          <button className="btn btn-secondary" onClick={() => download(`davey-${year}-profit-and-loss.pdf`, taxPdf(input), 'application/pdf')}>P&L (PDF)</button>
          <button className="btn btn-secondary" onClick={() => download(`davey-${year}-business-transactions.csv`, transactionsCsv(business, names), 'text/csv;charset=utf-8')}>Transactions (CSV)</button>
        </div>
      </section>
    </div>
  )
}
