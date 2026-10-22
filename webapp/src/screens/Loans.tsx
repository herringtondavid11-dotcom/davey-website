import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Meter } from '../components/BarChart'
import { NumberField, Stat } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { useData } from '../lib/DataProvider'
import { addMonthsToDate, equity, monthlyPayment, monthsBetween, payoff, refinance, yearlySchedule } from '../lib/debt'
import { displayName, maskLabel, money, moneyWhole } from '../lib/format'
import type { Account } from '../lib/schema'

const fmtMonths = (n: number) =>
  n === Infinity ? 'Never at this payment' : n <= 0 ? 'Immediately' : n < 12 ? `${n} mo` : `${Math.floor(n / 12)} yr ${n % 12} mo`
const dateIn = (n: number) => (n === Infinity ? '—' : addMonthsToDate(new Date(), n).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }))

function remainingMonths(a: Account): number {
  if (a.termMonths && a.originationDate) return Math.max(1, a.termMonths - monthsBetween(a.originationDate))
  return a.subtype === 'mortgage' ? 300 : 60
}

function LoanCard({ a }: { a: Account }) {
  const isMortgage = a.subtype === 'mortgage' || /mortgage|home/i.test(a.name)
  const balance = Math.abs(a.balance)
  const left = remainingMonths(a)
  const [rate, setRate] = useState(a.apr ?? 6.5)
  const [payment, setPayment] = useState(Math.round((a.minimumPayment ?? monthlyPayment(balance, a.apr ?? 6.5, left)) * 100) / 100)
  const [extra, setExtra] = useState(0)
  const [homeValue, setHomeValue] = useState(a.propertyValue ?? 0)
  const [newRate, setNewRate] = useState(Math.max(0, Math.round(((a.apr ?? 6.5) - 1) * 100) / 100))
  const [newTerm, setNewTerm] = useState(isMortgage ? 30 : Math.max(1, Math.ceil(left / 12)))
  const [costs, setCosts] = useState(isMortgage ? Math.round(balance * 0.02) : 0)
  const [showSchedule, setShowSchedule] = useState(false)

  const base = useMemo(() => payoff(balance, rate, payment), [balance, rate, payment])
  const withExtra = useMemo(() => payoff(balance, rate, payment + extra), [balance, rate, payment, extra])
  const refi = useMemo(() => refinance(balance, rate, payment, newRate, newTerm * 12, costs), [balance, rate, payment, newRate, newTerm, costs])
  const eq = homeValue > 0 ? equity(homeValue, balance) : null
  const schedule = useMemo(() => (showSchedule ? yearlySchedule(balance, rate, payment + extra) : []), [showSchedule, balance, rate, payment, extra])
  const id = a.id

  return (
    <section className="card loan-card" aria-labelledby={`loan-${id}`}>
      <div className="card-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={`loan-${id}`}>{displayName(a)}</h2>
          <p className="muted small">{[a.institution, maskLabel(a.mask), a.originationDate ? `since ${a.originationDate.slice(0, 4)}` : null].filter(Boolean).join(' · ')}</p>
        </div>
        <strong className="num negative loan-balance">{money(balance)}</strong>
      </div>
      {a.originalPrincipal ? (
        <div className="card-pad-x">
          <Meter value={1 - balance / a.originalPrincipal} label={`${Math.round((1 - balance / a.originalPrincipal) * 100)}% paid off`} />
          <p className="muted small" style={{ marginTop: 6 }}>{Math.round((1 - balance / a.originalPrincipal) * 100)}% of {money(a.originalPrincipal)} paid off</p>
        </div>
      ) : null}

      <div className="loan-grid">
        <div className="loan-block">
          <h3>Payoff</h3>
          <div className="form-grid compact">
            <NumberField id={`r-${id}`} label="Interest rate" suffix="%" step="0.01" value={rate} onChange={setRate} />
            <NumberField id={`p-${id}`} label="Monthly payment (P&I)" prefix="$" value={payment} onChange={setPayment} />
            <NumberField id={`x-${id}`} label="Extra each month" prefix="$" value={extra} onChange={setExtra} />
          </div>
          <div className="stats">
            <Stat label="Paid off" value={dateIn(withExtra.months)} sub={fmtMonths(withExtra.months)} />
            <Stat label="Interest left" value={withExtra.paysOff ? moneyWhole(withExtra.totalInterest) : '—'} />
            {extra > 0 && base.paysOff && withExtra.paysOff && (
              <Stat label="Extra saves" value={moneyWhole(base.totalInterest - withExtra.totalInterest)} tone="positive" sub={`${base.months - withExtra.months} months sooner`} />
            )}
          </div>
          <button type="button" className="link-btn" onClick={() => setShowSchedule((v) => !v)} aria-expanded={showSchedule}>{showSchedule ? 'Hide amortization' : 'Show amortization by year'}</button>
          {showSchedule && (
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th scope="col">Year</th><th scope="col">Principal</th><th scope="col">Interest</th><th scope="col">Balance</th></tr></thead>
                <tbody>
                  {schedule.map((r) => (
                    <tr key={r.year}><th scope="row">{new Date().getFullYear() + r.year - 1}</th><td className="num">{moneyWhole(r.principal)}</td><td className="num">{moneyWhole(r.interest)}</td><td className="num">{moneyWhole(r.endBalance)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="loan-block">
          <h3>Refinance</h3>
          <div className="form-grid compact">
            <NumberField id={`nr-${id}`} label="New rate" suffix="%" step="0.01" value={newRate} onChange={setNewRate} />
            <NumberField id={`nt-${id}`} label="New term" suffix="years" step="1" value={newTerm} onChange={(v) => setNewTerm(Math.max(1, Math.round(v)))} />
            <NumberField id={`cc-${id}`} label="Closing costs" prefix="$" value={costs} onChange={setCosts} />
          </div>
          <div className="stats">
            <Stat label="New payment" value={money(refi.newPayment)} sub={`${refi.monthlySavings >= 0 ? 'saves' : 'costs'} ${money(Math.abs(refi.monthlySavings))}/mo`} tone={refi.monthlySavings >= 0 ? 'positive' : 'negative'} />
            <Stat label="Break-even" value={refi.breakEvenMonths === Infinity ? 'Never' : fmtMonths(refi.breakEvenMonths)} />
            <Stat label="Lifetime interest" value={moneyWhole(refi.lifetimeSavings)} tone={refi.lifetimeSavings >= 0 ? 'positive' : 'negative'} sub={refi.lifetimeSavings >= 0 ? 'saved after costs' : 'more after costs'} />
          </div>
        </div>

        {isMortgage && (
          <div className="loan-block">
            <h3>Equity</h3>
            <div className="form-grid compact">
              <NumberField id={`hv-${id}`} label="Home value" prefix="$" value={homeValue} onChange={setHomeValue} />
            </div>
            {eq ? (
              <>
                <div className="stats">
                  <Stat label="Your equity" value={moneyWhole(eq.equity)} tone={eq.equity >= 0 ? 'positive' : 'negative'} />
                  <Stat label="Loan-to-value" value={`${eq.ltv.toFixed(1)}%`} sub={eq.pmiLikely ? 'Over 80%: PMI likely' : 'Under 80%: no PMI needed'} />
                </div>
                <Meter value={eq.ltv / 100} over={eq.pmiLikely} label={`Loan-to-value ${eq.ltv.toFixed(0)}%`} />
              </>
            ) : (
              <p className="muted small">Enter your home's value to see equity and loan-to-value.</p>
            )}
          </div>
        )}
      </div>
      <p className="muted small card-pad-x" style={{ paddingBottom: 16 }}>Estimates for planning; your lender's figures are final. Changes here aren't saved.</p>
    </section>
  )
}

export function Loans() {
  const { accounts } = useData()
  const loans = useMemo(() => (accounts ?? []).filter((a) => a.type === 'loan' && !a.hidden), [accounts])
  if (!accounts) return <Spinner label="Loading loans" />
  const total = loans.reduce((s, a) => s + Math.abs(a.balance), 0)
  return (
    <div className="page">
      <div className="page-head"><div><h1>Mortgages & loans</h1><p>Payoff dates, extra payments, refinancing and home equity.</p></div>{loans.length > 0 && <Stat label="Total owed" value={money(total)} tone="negative" />}</div>
      {loans.length === 0 ? (
        <section className="card"><div className="empty"><p>No loans or mortgages connected.</p><Link className="btn btn-primary" to="/connect">Connect a Bank</Link></div></section>
      ) : (
        loans.map((a) => <LoanCard key={a.id} a={a} />)
      )}
    </div>
  )
}
