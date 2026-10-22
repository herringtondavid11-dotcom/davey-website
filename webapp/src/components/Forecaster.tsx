import { useId, useMemo, useState } from 'react'
import { compact } from './BarChart'
import { LineChart } from './LineChart'
import { forecastPresets, projectForecast } from '../lib/forecast'
import { moneyWhole } from '../lib/format'

/** One input: a slider and a typed value that move together. */
function Field({ label, value, onChange, min, max, step, unit }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit: string
}) {
  const id = useId()
  return (
    <div className="forecast-field">
      <label htmlFor={id}>{label}</label>
      <div className="forecast-input">
        {unit === '$' && <span className="muted">$</span>}
        <input id={id} className="input num" type="number" inputMode="decimal" min={min} step={step} value={Number.isFinite(value) ? value : 0}
          onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, unit === '$' ? v : Math.min(max, v))) }} />
        {unit !== '$' && <span className="muted">{unit}</span>}
      </div>
      <input type="range" aria-label={label} min={min} max={Math.max(max, value)} step={step} value={Math.min(Math.max(value, min), Math.max(max, value))}
        onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

/**
 * Forecast: what the investments could grow to (monthly compounding, contributions at month end; the same math as the
 * app). Updates as you drag. Below: 5, 10 and 15 years at 6% with no contributions.
 */
export function Forecaster({ currentValue }: { currentValue: number }) {
  const [start, setStart] = useState<number | null>(null)
  const [monthly, setMonthly] = useState(0)
  const [rate, setRate] = useState(6)
  const [years, setYears] = useState(10)
  const [real, setReal] = useState(false)
  const startValue = start ?? currentValue
  const result = useMemo(() => projectForecast(startValue, monthly, rate / 100, years, real), [startValue, monthly, rate, years, real])
  const points = result.points.filter((p) => p.month % 12 === 0).map((p) => ({
    label: String(p.month / 12), title: `Year ${p.month / 12}: ${moneyWhole(p.value)}`,
    values: { principal: Math.max(0, p.value - p.growth), growth: Math.max(0, p.growth) },
  }))
  return (
    <section className="card card-pad forecast" aria-labelledby="forecast-title">
      <h2 id="forecast-title">Forecast</h2>
      <div className="stats">
        <div className="stat"><span className="stat-label">In {years} {years === 1 ? 'year' : 'years'}</span><span className="stat-value num" data-testid="forecast-value">{moneyWhole(result.value)}</span></div>
        <div className="stat"><span className="stat-label">Contributions</span><span className="stat-value num">{moneyWhole(result.totalContributions)}</span></div>
        <div className="stat"><span className="stat-label">Growth</span><span className="stat-value num positive">{moneyWhole(result.totalGrowth)}</span></div>
      </div>
      <LineChart stacked points={points} label={`Projected value over ${years} years`} format={compact}
        series={[{ key: 'principal', name: 'Starting value + contributions', className: 'mark-slate' }, { key: 'growth', name: 'Growth', className: 'mark-positive' }]} />
      <div className="forecast-fields">
        <Field label="Starting value" value={startValue} onChange={setStart} min={0} max={Math.max(1_000_000, currentValue * 3)} step={1000} unit="$" />
        <Field label="Monthly contribution" value={monthly} onChange={setMonthly} min={0} max={10_000} step={50} unit="$" />
        <Field label="Annual growth" value={rate} onChange={(v) => setRate(Math.min(15, Math.max(0, v)))} min={0} max={15} step={0.5} unit="%" />
        <Field label="Time horizon" value={years} onChange={(v) => setYears(Math.min(40, Math.max(1, Math.round(v))))} min={1} max={40} step={1} unit="yrs" />
      </div>
      <label className="check-row"><input type="checkbox" checked={real} onChange={(e) => setReal(e.target.checked)} /> Inflation-adjusted (today's dollars)</label>
      {start !== null && <button type="button" className="btn btn-link" onClick={() => setStart(null)}>Use current value ({moneyWhole(currentValue)})</button>}
      <table className="data-table forecast-presets" aria-label="At 6%, no contributions">
        <thead><tr><th scope="col">At 6%, no contributions</th><th scope="col" className="num">Value</th></tr></thead>
        <tbody>{forecastPresets(currentValue).map((p) => <tr key={p.years}><th scope="row">{p.years} years</th><td className="num">{moneyWhole(p.value)}</td></tr>)}</tbody>
      </table>
      <p className="muted small">Projection for planning only, not a guarantee.</p>
    </section>
  )
}
