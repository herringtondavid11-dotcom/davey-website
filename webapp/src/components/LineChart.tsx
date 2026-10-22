import { useEffect, useRef, useState } from 'react'
import { niceTicks } from './BarChart'

export interface LineSeries {
  key: string
  name: string
  /** CSS class for the stroke/fill (colors live in app.css for light and dark). */
  className: string
}

export interface LinePoint {
  label: string
  title: string
  values: Record<string, number>
}

/**
 * Line chart (or stacked areas with `stacked`): recessive grid, one y-axis, a hover/focus readout. Same look as BarChart.
 */
export function LineChart({ points, series, format, height = 220, label, stacked = false }: {
  points: LinePoint[]
  series: LineSeries[]
  format: (v: number) => string
  height?: number
  label: string
  stacked?: boolean
}) {
  const box = useRef<HTMLDivElement>(null)
  const [W, setW] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setW(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const totals = points.map((p) => (stacked ? series.reduce((s, x) => s + Math.max(0, p.values[x.key] ?? 0), 0) : Math.max(...series.map((x) => p.values[x.key] ?? 0))))
  const ticks = niceTicks(Math.max(1, ...totals))
  const top = ticks[ticks.length - 1]
  const pad = { l: 56, r: 8, t: 8, b: 24 }
  const plotW = W - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const x = (i: number) => pad.l + (points.length <= 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (v: number) => pad.t + plotH - (Math.max(0, v) / top) * plotH
  const every = Math.ceil(points.length / Math.max(1, Math.floor(plotW / 70)))

  // Stacked: cumulative baselines per series.
  const layers = series.map((s, si) => points.map((p) => {
    const below = stacked ? series.slice(0, si).reduce((sum, x) => sum + Math.max(0, p.values[x.key] ?? 0), 0) : 0
    return { lo: below, hi: below + Math.max(0, p.values[s.key] ?? 0) }
  }))

  const onMove = (e: React.PointerEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect()
    const rel = (e.clientX - r.left) / r.width
    setHover(Math.min(points.length - 1, Math.max(0, Math.round(rel * (points.length - 1)))))
  }

  return (
    <figure className="chart" aria-label={label}>
      {series.length > 1 && (
        <div className="legend" aria-hidden>
          {series.map((s) => <span key={s.key}><i className={'swatch ' + s.className} />{s.name}</span>)}
        </div>
      )}
      <div className="chart-box" ref={box}>
        <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className="grid" x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} />
              <text className="axis" x={pad.l - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
            </g>
          ))}
          {layers.map((layer, si) => {
            const s = series[si]
            if (!points.length) return null
            const line = layer.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v.hi)}`).join(' ')
            const area = `${line} ${[...layer].reverse().map((v, j) => `L${x(layer.length - 1 - j)},${y(v.lo)}`).join(' ')} Z`
            return (
              <g key={s.key} className={s.className}>
                {stacked && <path className="area" d={area} />}
                <path className="line" d={line} />
              </g>
            )
          })}
          {points.map((p, i) => (i % every === 0 || i === points.length - 1 ? (
            <text key={i} className="axis" x={x(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>{p.label}</text>
          ) : null))}
          {hover !== null && points[hover] && <line className="baseline" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + plotH} />}
          <rect className="hit" x={pad.l} y={pad.t} width={plotW} height={plotH} tabIndex={0} role="img"
            aria-label={hover !== null && points[hover]
              ? `${points[hover].title}${series.length > 1 ? ': ' + series.map((s) => `${s.name} ${format(points[hover].values[s.key] ?? 0)}`).join(', ') : ''}`
              : `${label}. Use the arrow keys to read values.`}
            onPointerMove={onMove} onPointerLeave={() => setHover(null)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') setHover((h) => Math.min(points.length - 1, (h ?? -1) + 1))
              if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? points.length) - 1))
            }} onBlur={() => setHover(null)} />
        </svg>
        {hover !== null && points[hover] && (
          <div className="tooltip" role="status" style={{ left: `min(max(0px, calc(${(x(hover) / W) * 100}% - 80px)), calc(100% - 170px))` }}>
            <strong>{points[hover].title}</strong>
            {series.map((s) => <div key={s.key}><i className={'swatch ' + s.className} />{s.name}: {format(points[hover].values[s.key] ?? 0)}</div>)}
          </div>
        )}
      </div>
    </figure>
  )
}
