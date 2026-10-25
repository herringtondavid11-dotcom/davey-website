import { money, percentText } from '../lib/format'
import { compact } from './BarChart'
import type { Slice } from '../lib/accountCategories'

const R = 70
const W = 26

function arc(start: number, end: number): string {
  // Angles in turns (0 = top, clockwise). A full circle is drawn as two halves.
  const pt = (t: number, r: number) => [100 + r * Math.sin(2 * Math.PI * t), 100 - r * Math.cos(2 * Math.PI * t)]
  if (end - start >= 0.9999) return `${arc(start, start + 0.5)} ${arc(start + 0.5, end)}`
  const [x0, y0] = pt(start, R)
  const [x1, y1] = pt(end, R)
  return `M ${x0} ${y0} A ${R} ${R} 0 ${end - start > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
}

/** Balances by account category: a donut (one validated hue per slot, "Other" in slate) with its legend and table. */
export function CategoryPie({ slices, total }: { slices: Slice[]; total: number }) {
  let at = 0
  const cls = (s: Slice) => `pie-${s.slot === 'other' ? 'other' : s.slot}`
  return (
    <div className="category-pie">
      <svg viewBox="0 0 200 200" role="img" aria-label={`Balances by category: ${slices.map((s) => `${s.name} ${percentText(s.share * 100)}`).join(', ')}`}>
        {slices.map((s) => {
          const start = at
          at += s.share
          return (
            <path key={s.name} d={arc(start, at)} className={cls(s)} fill="none" strokeWidth={W}>
              <title>{`${s.name}: ${money(s.cents / 100)} (${percentText(s.share * 100)})`}</title>
            </path>
          )
        })}
        {/* 2px surface gaps between slices. */}
        {slices.length > 1 && slices.map((s, i) => {
          const t = slices.slice(0, i).reduce((x, y) => x + y.share, 0)
          const a = 2 * Math.PI * t
          return <line key={`gap-${s.name}`} x1={100 + (R - W / 2 - 1) * Math.sin(a)} y1={100 - (R - W / 2 - 1) * Math.cos(a)} x2={100 + (R + W / 2 + 1) * Math.sin(a)} y2={100 - (R + W / 2 + 1) * Math.cos(a)} className="pie-gap" strokeWidth={2} />
        })}
        <text x="100" y="96" textAnchor="middle" className="pie-label">Owned</text>
        <text x="100" y="116" textAnchor="middle" className="pie-total num">{total >= 100_000_000 ? compact(total / 100) : money(total / 100).replace(/\.\d\d$/, '')}</text>
      </svg>
      <ul className="alloc-legend" aria-label="Balances by category">
        {slices.map((s) => (
          <li key={s.name}><i className={`swatch alloc-${s.slot === 'other' ? 'other' : s.slot}`} /><span>{s.name}</span><b className="num">{percentText(s.share * 100)}</b><span className="muted num">{money(s.cents / 100)}</span></li>
        ))}
      </ul>
    </div>
  )
}
