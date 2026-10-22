import { useMemo, useState } from 'react'
import { BarChart } from '../components/BarChart'
import { Stat, UsageFilter } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { averages, cashFlow, currentMonth, monthLabel } from '../lib/budget'
import { useData } from '../lib/DataProvider'
import { money, moneyWhole } from '../lib/format'
import type { Usage } from '../lib/schema'

const SERIES = [
  { key: 'income', name: 'Income', className: 's-income' },
  { key: 'spending', name: 'Spending', className: 's-spend' },
]

export function CashFlow() {
  const { transactions } = useData()
  const [range, setRange] = useState<6 | 12>(6)
  const [usage, setUsage] = useState<Usage | ''>('')
  const months = useMemo(() => cashFlow(transactions ?? [], currentMonth(), range, usage), [transactions, range, usage])
  if (!transactions) return <Spinner label="Loading cash flow" />
  const avg = averages(months)

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Cash flow</h1><p>Money in and out each month, transfers excluded.</p></div>
        <div className="head-controls">
          <UsageFilter value={usage} onChange={setUsage} />
          <div className="segmented" role="group" aria-label="Range">
            <button type="button" aria-pressed={range === 6} onClick={() => setRange(6)}>6 months</button>
            <button type="button" aria-pressed={range === 12} onClick={() => setRange(12)}>12 months</button>
          </div>
        </div>
      </div>
      <section className="card card-pad">
        <div className="stats">
          <Stat label="Avg. income / month" value={money(avg.income)} tone="positive" />
          <Stat label="Avg. spending / month" value={money(avg.spending)} />
          <Stat label="Avg. saved / month" value={money(avg.net)} tone={avg.net >= 0 ? 'positive' : 'negative'} sub={`${Math.round(avg.savingsRate * 100)}% of income`} />
        </div>
      </section>
      <section className="card card-pad" aria-labelledby="cf-chart">
        <h2 id="cf-chart" style={{ marginBottom: 12 }}>Income and spending</h2>
        <BarChart
          label={`Income and spending, last ${range} months`}
          series={SERIES}
          format={(v) => money(v)}
          groups={months.map((m) => ({ label: monthLabel(m.month, 'short'), title: monthLabel(m.month), values: { income: m.income, spending: m.spending } }))}
        />
      </section>
      <section className="card" aria-labelledby="cf-table">
        <div className="card-head"><h2 id="cf-table">By month</h2></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th><th scope="col">Net</th></tr></thead>
            <tbody>
              {[...months].reverse().map((m) => (
                <tr key={m.month}>
                  <th scope="row">{monthLabel(m.month, 'medium')}</th>
                  <td className="num">{moneyWhole(m.income)}</td>
                  <td className="num">{moneyWhole(m.spending)}</td>
                  <td className={'num ' + (m.net >= 0 ? 'positive' : 'negative')}>{moneyWhole(m.net, { sign: true })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
