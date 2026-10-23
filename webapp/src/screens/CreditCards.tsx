import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Meter } from '../components/BarChart'
import { NumberField, Stat } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { useData } from '../lib/DataProvider'
import { BAND_LABEL, avalanche, utilization } from '../lib/debt'
import { displayName, maskLabel, money, shortDate } from '../lib/format'

const months = (n: number) => (n === Infinity ? 'never' : n >= 12 ? `${Math.floor(n / 12)} yr ${n % 12} mo` : `${n} mo`)

export function CreditCards() {
  const { accounts } = useData()
  const cards = useMemo(() => (accounts ?? []).filter((a) => a.type === 'credit' && !a.hidden), [accounts])
  const totalBalance = cards.reduce((s, c) => s + Math.max(0, c.balance), 0)
  const totalLimit = cards.reduce((s, c) => s + (c.creditLimit ?? 0), 0)
  const overall = utilization(totalBalance, totalLimit)
  const minimums = cards.reduce((s, c) => s + (c.minimumPayment ?? Math.max(25, c.balance * 0.02)), 0)
  const [budget, setBudget] = useState(0)
  const monthly = budget || Math.ceil(minimums * 2)
  const plan = useMemo(
    () => avalanche(cards.map((c) => ({ id: c.id, balance: c.balance, apr: c.apr ?? 22, minimum: c.minimumPayment ?? Math.max(25, c.balance * 0.02) })), monthly),
    [cards, monthly],
  )

  if (!accounts) return <Spinner label="Loading cards" />
  return (
    <div className="page">
      <div className="page-head"><div><h1>Credit cards</h1><p>Balances, utilization and a plan to pay them down.</p></div></div>
      {cards.length === 0 ? (
        <section className="card"><div className="empty"><p>No credit cards connected.</p><Link className="btn btn-primary" to="/connect">Connect an account</Link></div></section>
      ) : (
        <>
          <section className="card card-pad util-hero">
            <div className="stats">
              <Stat label="Total balance" value={money(totalBalance)} tone="negative" />
              <Stat label="Total limit" value={totalLimit ? money(totalLimit) : '—'} />
              <Stat label="Overall utilization" value={overall ? `${overall.pct.toFixed(0)}%` : '—'} sub={overall ? BAND_LABEL[overall.band] : 'Limits not reported'} />
            </div>
            {overall && <Meter value={overall.pct / 100} over={overall.band === 'high' || overall.band === 'fair'} label={`Overall utilization ${overall.pct.toFixed(0)}%`} />}
            <p className="muted small">Keeping utilization under 30% (ideally under 10%) helps your credit score.</p>
          </section>

          <section className="card" aria-labelledby="cards-title">
            <div className="card-head"><h2 id="cards-title">Your cards</h2></div>
            {cards.map((c) => {
              const u = utilization(c.balance, c.creditLimit)
              return (
                <div className="card-line" key={c.id}>
                  <div className="budget-top">
                    <span style={{ minWidth: 0 }}>
                      <span className="row-title" style={{ display: 'block' }}>{displayName(c)}</span>
                      <span className="row-sub" style={{ display: 'block' }}>{[c.institution, maskLabel(c.mask)].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="num budget-figures"><b>{money(c.balance)}</b>{c.creditLimit ? <span className="muted"> of {money(c.creditLimit)}</span> : null}</span>
                  </div>
                  {u && <Meter value={u.pct / 100} over={u.band === 'high' || u.band === 'fair'} label={`${displayName(c)} utilization ${u.pct.toFixed(0)}%`} />}
                  <div className="facts small">
                    <span><b>{u ? `${u.pct.toFixed(0)}%` : '—'}</b> used</span>
                    <span><b>{c.apr !== undefined ? `${c.apr.toFixed(2)}%` : '—'}</b> APR</span>
                    <span><b>{c.minimumPayment !== undefined ? money(c.minimumPayment) : '—'}</b> minimum</span>
                    <span>Due <b>{c.nextPaymentDue ? shortDate(c.nextPaymentDue) : '—'}</b></span>
                  </div>
                </div>
              )
            })}
          </section>

          <section className="card card-pad" aria-labelledby="plan-title">
            <h2 id="plan-title">Payoff plan</h2>
            <p className="muted" style={{ margin: '6px 0 16px' }}>Pay every minimum, then put the rest on the highest-APR card (avalanche). Cards without a reported APR assume 22%.</p>
            <div className="form-grid">
              <NumberField id="cc-budget" label="Monthly amount for cards" prefix="$" value={monthly} onChange={setBudget} />
            </div>
            <div className="stats plan-stats">
              {plan.feasible ? (
                <>
                  <Stat label="Debt-free in" value={months(plan.months)} tone="positive" />
                  <Stat label="Interest you'll pay" value={money(plan.totalInterest)} />
                  <Stat label="Pay off first" value={displayName(cards.find((c) => c.id === plan.order[0]) ?? cards[0])} />
                </>
              ) : (
                <p className="error" role="alert">That's less than the minimums ({money(minimums)}). Raise the monthly amount.</p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  )
}
