import { addMonths, currentMonth, monthLabel } from '../lib/budget'
import type { Usage } from '../lib/schema'
import { ChevronIcon } from './Icons'

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  const isCurrent = month >= currentMonth()
  return (
    <div className="month-picker" role="group" aria-label="Month">
      <button type="button" className="btn btn-ghost icon-btn" onClick={() => onChange(addMonths(month, -1))} aria-label="Previous month">
        <ChevronIcon className="flip" />
      </button>
      <strong aria-live="polite">{monthLabel(month)}</strong>
      <button type="button" className="btn btn-ghost icon-btn" disabled={isCurrent} onClick={() => onChange(addMonths(month, 1))} aria-label="Next month">
        <ChevronIcon />
      </button>
    </div>
  )
}

export function UsageFilter({ value, onChange, label = 'Show' }: { value: Usage | ''; onChange: (v: Usage | '') => void; label?: string }) {
  const opts: [Usage | '', string][] = [['', 'All'], ['personal', 'Personal'], ['business', 'Business']]
  return (
    <div className="segmented" role="group" aria-label={label}>
      {opts.map(([v, l]) => (
        <button key={l} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>
      ))}
    </div>
  )
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: 'positive' | 'negative'; sub?: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <strong className={'stat-value num ' + (tone ?? '')}>{value}</strong>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}
