import { money, percentText } from '../lib/format'
import { ownedSlices, type CategoryTotal } from '../lib/accountCategories'
import { compact } from './BarChart'

const R = 70
const W = 26

function arc(start: number, end: number): string {
  const pt = (t: number) => [100 + R * Math.sin(2 * Math.PI * t), 100 - R * Math.cos(2 * Math.PI * t)]
  if (end - start >= 0.9999) return `${arc(start, start + 0.5)} ${arc(start + 0.5, end)}`
  const [x0, y0] = pt(start)
  const [x1, y1] = pt(end)
  return `M ${x0} ${y0} A ${R} ${R} 0 ${end - start > 0.5 ? 1 : 0} 1 ${x1} ${y1}`
}

/**
 * Accounts by category: a donut or a 100% bar of what's owned (each category in its own colour), and a legend row per
 * category with its total, % of net worth, accounts and goal % funded. Choosing a slice, bar segment or row filters the
 * list to that category; `selected` marks the filtered ones.
 */
export function CategoryChart({ totals, mode, selected, onToggle }: {
  totals: CategoryTotal[]
  mode: 'donut' | 'bar'
  selected: string[]
  onToggle: (id: string) => void
}) {
  const slices = ownedSlices(totals)
  const owned = slices.reduce((s, x) => s + x.total, 0)
  const dim = (id: string) => selected.length > 0 && !selected.includes(id)
  let at = 0
  const label = `What you own by category: ${slices.map((s) => `${s.name} ${percentText(s.share * 100)}`).join(', ')}`
  return (
    <div className={`category-chart mode-${mode}`}>
      {slices.length > 0 && (mode === 'donut' ? (
        <svg viewBox="0 0 200 200" role="img" aria-label={label}>
          {slices.map((s) => {
            const start = at
            at += s.share
            return (
              <path key={s.id} d={arc(start, at)} className={`slice cc-${s.color}${dim(s.id) ? ' dim' : ''}`} fill="none" strokeWidth={W}
                onClick={() => onToggle(s.id)} data-testid={`slice-${s.name}`}>
                <title>{`${s.name}: ${money(s.total / 100)} (${percentText(s.share * 100)} of what you own)`}</title>
              </path>
            )
          })}
          {slices.length > 1 && slices.map((s, i) => {
            const a = 2 * Math.PI * slices.slice(0, i).reduce((x, y) => x + y.share, 0)
            return <line key={`gap-${s.id}`} x1={100 + (R - W / 2 - 1) * Math.sin(a)} y1={100 - (R - W / 2 - 1) * Math.cos(a)} x2={100 + (R + W / 2 + 1) * Math.sin(a)} y2={100 - (R + W / 2 + 1) * Math.cos(a)} className="pie-gap" strokeWidth={2} />
          })}
          <text x="100" y="96" textAnchor="middle" className="pie-label">Owned</text>
          <text x="100" y="116" textAnchor="middle" className="pie-total num">{owned >= 100_000_000 ? compact(owned / 100) : money(owned / 100).replace(/\.\d\d$/, '')}</text>
        </svg>
      ) : (
        <div className="cat-bar" role="img" aria-label={label}>
          {slices.map((s) => (
            <span key={s.id} className={`cc-${s.color}${dim(s.id) ? ' dim' : ''}`} style={{ flexGrow: s.share }} title={`${s.name}: ${money(s.total / 100)} (${percentText(s.share * 100)})`}
              onClick={() => onToggle(s.id)} data-testid={`bar-${s.name}`} />
          ))}
        </div>
      ))}
      <div className="cat-legend" role="list" aria-label="Categories">
        <div className="cat-legend-head" aria-hidden="true"><span /><span>Category</span><span className="num">Total</span><span className="num">Net worth</span><span className="num">Accounts</span><span className="num">Funded</span></div>
        {totals.map((t) => (
          <div key={t.id} role="listitem"><button type="button" className={`cat-legend-row${selected.includes(t.id) ? ' on' : ''}${dim(t.id) ? ' dim' : ''}`}
            aria-pressed={selected.includes(t.id)} onClick={() => onToggle(t.id)}>
            <i className={`swatch cc-${t.color}`} />
            <span className="cat-legend-name">{t.name}</span>
            <span className={'num' + (t.total < 0 ? ' negative' : '')}>{money(t.total / 100)}</span>
            <span className="num muted">{t.shareOfNetWorth !== undefined ? percentText(t.shareOfNetWorth * 100) : '—'}<span className="visually-hidden"> of net worth,</span></span>
            <span className="num muted">{t.count}<span className="visually-hidden"> {t.count === 1 ? 'account' : 'accounts'},</span></span>
            <span className="num muted">{t.funded !== undefined ? percentText(t.funded * 100) : '—'}<span className="visually-hidden"> funded</span></span>
          </button></div>
        ))}
      </div>
    </div>
  )
}
