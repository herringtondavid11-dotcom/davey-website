import { moneyWhole } from '../lib/format'

export interface DonutSlice {
  id: string
  name: string
  cents: number
  className: string
}

const R = 64
const W = 22

function arc(start: number, end: number): string {
  const pt = (t: number) => [100 + R * Math.sin(2 * Math.PI * t), 100 - R * Math.cos(2 * Math.PI * t)]
  if (end - start >= 0.9999) return `${arc(start, start + 0.5)} ${arc(start + 0.5, end)}`
  const [x0, y0] = pt(start)
  const [x1, y1] = pt(end)
  return `M ${x0} ${y0} A ${R} ${R} 0 ${end - start > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
}

/** Donut of named amounts. The list under the ring repeats every number. */
export function Donut({ title, slices }: { title: string; slices: DonutSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.cents, 0)
  let at = 0
  const label = total > 0
    ? `${title}: ${slices.map((slice) => `${slice.name} ${moneyWhole(slice.cents / 100)}`).join(', ')}`
    : title
  return (
    <figure className="donut-card">
      <figcaption>{title}</figcaption>
      <svg viewBox="0 0 200 200" role="img" aria-label={label}>
        {total <= 0 && <circle cx="100" cy="100" r={R} className="donut-empty" fill="none" strokeWidth={W} />}
        {total > 0 && slices.map((slice) => {
          const start = at
          at += slice.cents / total
          return <path key={slice.id} d={arc(start, at)} className={slice.className} fill="none" strokeWidth={W} />
        })}
        <text x="100" y="108" textAnchor="middle" className="pie-total num">{moneyWhole(total / 100)}</text>
      </svg>
      <ul className="donut-legend">
        {slices.map((slice) => (
          <li key={slice.id}>
            <i className={slice.className} />
            <span>{slice.name}</span>
            <b className="num">{moneyWhole(slice.cents / 100)}</b>
          </li>
        ))}
      </ul>
    </figure>
  )
}
