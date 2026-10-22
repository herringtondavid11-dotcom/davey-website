import { useEffect, useId, useRef, useState } from 'react'

export interface Series {
  key: string
  name: string
  /** CSS class giving the mark its fill (colors live in app.css for light/dark). */
  className: string
}

export interface Group {
  label: string
  title: string
  values: Record<string, number>
}

/**
 * Grouped bar chart: thin bars with rounded tops on a shared baseline, recessive grid, one y-axis, hover tooltip
 * per group, legend above. Values are non-negative magnitudes.
 */
export function BarChart({ groups, series, format, height = 240, label }: {
  groups: Group[]
  series: Series[]
  format: (v: number) => string
  height?: number
  label: string
}) {
  const id = useId()
  const [hover, setHover] = useState<number | null>(null)
  // Draw at the real pixel width so text stays 11–12px on every screen.
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const max = Math.max(1, ...groups.flatMap((g) => series.map((s) => g.values[s.key] ?? 0)))
  const ticks = niceTicks(max)
  const top = ticks[ticks.length - 1]
  const H = height
  const pad = { l: 48, r: 4, t: 8, b: 26 }
  const every = Math.ceil(groups.length / Math.max(1, Math.floor((W - 52) / 44)))
  const plotW = W - pad.l - pad.r
  const plotH = H - pad.t - pad.b
  const gw = plotW / Math.max(1, groups.length)
  const barW = Math.max(4, Math.min(18, (gw - 10) / series.length - 2))
  const y = (v: number) => pad.t + plotH - (v / top) * plotH

  return (
    <figure className="chart" aria-label={label}>
      <div className="legend" aria-hidden>
        {series.map((s) => (
          <span key={s.key}><i className={'swatch ' + s.className} />{s.name}</span>
        ))}
      </div>
      <div className="chart-box" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby={`${id}-t`} width={W} height={H}>
          <title id={`${id}-t`}>{label}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text className="axis" x={pad.l - 8} y={y(t) + 4} textAnchor="end">{compact(t)}</text>
            </g>
          ))}
          {groups.map((g, i) => {
            const x0 = pad.l + i * gw + (gw - series.length * (barW + 2)) / 2
            return (
              <g key={g.label}>
                {hover === i && <rect className="hover-band" x={pad.l + i * gw} y={pad.t} width={gw} height={plotH} />}
                {series.map((s, j) => {
                  const v = g.values[s.key] ?? 0
                  const h = Math.max(0, y(0) - y(v))
                  const r = Math.min(4, barW / 2, h)
                  const x = x0 + j * (barW + 2)
                  return h > 0 ? <path key={s.key} className={'bar ' + s.className} d={roundedTop(x, y(v), barW, h, r)} /> : null
                })}
                {i % every === 0 && <text className="axis" x={pad.l + i * gw + gw / 2} y={H - 8} textAnchor="middle">{g.label}</text>}
                <rect
                  className="hit"
                  x={pad.l + i * gw}
                  y={0}
                  width={gw}
                  height={H}
                  onMouseEnter={() => setHover(i)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  tabIndex={0}
                  role="img"
                  aria-label={`${g.title}: ${series.map((s) => `${s.name} ${format(g.values[s.key] ?? 0)}`).join(', ')}`}
                />
              </g>
            )
          })}
          <line className="baseline" x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} />
        </svg>
        {hover !== null && (
          <div className="tooltip" role="presentation" style={{ left: `${((pad.l + (hover + 0.5) * gw) / W) * 100}%` }}>
            <strong>{groups[hover].title}</strong>
            {series.map((s) => (
              <span key={s.key}><i className={'swatch ' + s.className} />{s.name} <b className="num">{format(groups[hover].values[s.key] ?? 0)}</b></span>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}

function roundedTop(x: number, yTop: number, w: number, h: number, r: number) {
  const yb = yTop + h
  return `M${x},${yb}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yb}Z`
}

export function niceTicks(max: number, count = 4): number[] {
  const raw = max / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw
  return Array.from({ length: Math.ceil(max / step) + 1 }, (_, i) => i * step)
}

export function compact(v: number): string {
  if (v >= 1_000_000) return `$${+(v / 1_000_000).toFixed(1)}M`
  if (v >= 1000) return `$${+(v / 1000).toFixed(1)}k`
  return `$${v}`
}

/** Single progress meter: status color + text, never color alone. */
export function Meter({ value, over, label }: { value: number; over?: boolean; label: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div className={'meter' + (over ? ' over' : '')} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)} aria-label={label}>
      <span style={{ width: `${pct}%` }} />
    </div>
  )
}
