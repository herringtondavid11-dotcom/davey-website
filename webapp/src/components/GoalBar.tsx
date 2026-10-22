import { band } from '../lib/accountGoals'
import { percentText } from '../lib/format'

/** A goal progress bar in the Davey palette: under 50% Slate, 50–99% Gold, 100%+ positive green (app: GoalBar). */
export function GoalBar({ fraction, big = false, label }: { fraction: number; big?: boolean; label: string }) {
  const width = Math.min(Math.max(fraction, 0), 1) * 100
  return (
    <div className={'goal-bar ' + (big ? 'big ' : '') + `band-${band(fraction)}`} role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-valuetext={percentText(fraction * 100)}>
      <span style={{ width: `${width}%` }} />
    </div>
  )
}
