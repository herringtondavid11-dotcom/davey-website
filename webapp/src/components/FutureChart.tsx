import { useEffect, useId, useRef, useState } from 'react'
import { rangeTicks, compact } from './BarChart'
import { YEAR_MARKS, type ProjectionPoint } from '../lib/future'
import { moneyWhole } from '../lib/format'

const SERIES = [
  { key: 'investments', name: 'Investments', className: 'future-invest' },
  { key: 'cash', name: 'Cash', className: 'future-cash' },
  { key: 'other', name: 'Other', className: 'future-other' },
  { key: 'debts', name: 'Debts', className: 'future-debt' },
] as const

/**
 * Stacked investments, cash, and other assets above zero, debts below zero,
 * and a net-worth line. A marker sits on every year; the 5-year marks are larger.
 */
export function FutureChart({ points, selectedYear, onSelectYear }: {
  points: ProjectionPoint[]
  selectedYear: number
  onSelectYear: (year: number) => void
}) {
  const id = useId()
  const box = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<number | null>(null)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const update = () => setWidth(Math.max(280, Math.round(el.getBoundingClientRect().width)))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const height = width < 560 ? 240 : 300
  const pad = { l: 58, r: 12, t: 12, b: 28 }
  const plotW = width - pad.l - pad.r
  const plotH = height - pad.t - pad.b
  const last = Math.max(1, points.length - 1)
  const x = (i: number) => pad.l + (points.length <= 1 ? plotW / 2 : (i / last) * plotW)
  const assets = points.map((p) => p.investments + p.cash + p.other)
  const lows = points.map((p) => Math.min(0, -p.debts, p.netWorth))
  const highs = points.map((p, i) => Math.max(assets[i], p.netWorth, 0))
  const ticks = rangeTicks(Math.min(0, ...lows), Math.max(1, ...highs))
  const bottom = ticks[0]
  const top = ticks[ticks.length - 1]
  const span = top - bottom || 1
  const y = (v: number) => pad.t + plotH - ((v - bottom) / span) * plotH
  const labelEvery = plotW < 520 ? 10 : 5

  const stack = [
    { key: 'investments', lo: points.map(() => 0), hi: points.map((p) => p.investments) },
    { key: 'cash', lo: points.map((p) => p.investments), hi: points.map((p) => p.investments + p.cash) },
    { key: 'other', lo: points.map((p) => p.investments + p.cash), hi: assets },
  ]
  const area = (lo: number[], hi: number[]) => {
    const upper = hi.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
    const lower = [...lo].reverse().map((v, j) => `L${x(lo.length - 1 - j)},${y(v)}`).join(' ')
    return `${upper} ${lower} Z`
  }
  const line = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i)},${y(v)}`).join(' ')
  const focus = hover ?? points.findIndex((p) => p.year === selectedYear)
  const shown = points[focus] ?? points[points.length - 1]

  const move = (clientX: number, target: SVGRectElement) => {
    const rect = target.getBoundingClientRect()
    const rel = rect.width ? (clientX - rect.left) / rect.width : 0
    setHover(Math.min(points.length - 1, Math.max(0, Math.round(rel * last))))
  }
  const selectNearest = (year: number) => {
    const mark = YEAR_MARKS.reduce((best, y) => (Math.abs(y - year) < Math.abs(best - year) ? y : best))
    onSelectYear(mark)
  }

  const readout = shown
    ? `Year ${shown.year === 0 ? 'today' : shown.year}: net worth ${moneyWhole(shown.netWorth)}, investments ${moneyWhole(shown.investments)}, cash ${moneyWhole(shown.cash)}, other ${moneyWhole(shown.other)}, debts ${moneyWhole(shown.debts)}`
    : 'Net worth projection'

  return (
    <figure className="chart future-chart" aria-label="Net worth projection">
      <div className="legend" aria-hidden>
        {SERIES.map((s) => <span key={s.key}><i className={'swatch ' + s.className} />{s.name}</span>)}
        <span><i className="swatch future-net" />Net worth</span>
      </div>
      <div className="chart-box" ref={box}>
        <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
          <title id={`${id}-title`}>{readout}</title>
          {ticks.map((tick) => (
            <g key={tick}>
              <line className={tick === 0 ? 'baseline' : 'grid'} x1={pad.l} x2={width - pad.r} y1={y(tick)} y2={y(tick)} />
              <text className="axis" x={pad.l - 6} y={y(tick) + 4} textAnchor="end">{compact(tick)}</text>
            </g>
          ))}
          {stack.map((layer) => (
            <g key={layer.key} className={SERIES.find((s) => s.key === layer.key)?.className}>
              <path className="area" d={area(layer.lo, layer.hi)} />
              <path className="line" d={line(layer.hi)} />
            </g>
          ))}
          <g className="future-debt">
            <path className="area" d={area(points.map((p) => -p.debts), points.map(() => 0))} />
            <path className="line" d={line(points.map((p) => -p.debts))} />
          </g>
          <g className="future-net">
            <path className="line" d={line(points.map((p) => p.netWorth))} />
          </g>
          {points.map((p, i) => {
            const mark = p.year % 5 === 0
            const selected = p.year === selectedYear
            return (
              <circle
                key={p.year}
                className={'future-marker' + (mark ? ' mark' : '') + (selected ? ' selected' : '')}
                cx={x(i)}
                cy={y(p.netWorth)}
                r={selected ? 5.5 : mark ? 4 : 2}
              />
            )
          })}
          {points.map((p, i) => (p.year % labelEvery === 0 ? (
            <text key={p.year} className="axis" x={x(i)} y={height - 8} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}>
              {p.year === 0 ? 'Now' : p.year}
            </text>
          ) : null))}
          {focus >= 0 && <line className="baseline" x1={x(focus)} x2={x(focus)} y1={pad.t} y2={pad.t + plotH} />}
          <rect
            className="hit"
            x={pad.l}
            y={pad.t}
            width={plotW}
            height={plotH}
            tabIndex={0}
            role="slider"
            aria-valuemin={YEAR_MARKS[0]}
            aria-valuemax={YEAR_MARKS[YEAR_MARKS.length - 1]}
            aria-valuenow={selectedYear}
            aria-valuetext={readout}
            aria-label="Net worth by year"
            onPointerMove={(e) => move(e.clientX, e.currentTarget)}
            onPointerLeave={() => setHover(null)}
            onClick={() => shown && selectNearest(shown.year)}
            onKeyDown={(e) => {
              const marks: readonly number[] = YEAR_MARKS
              const index = marks.indexOf(selectedYear)
              if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                e.preventDefault()
                onSelectYear(YEAR_MARKS[Math.min(YEAR_MARKS.length - 1, Math.max(0, index) + 1)])
              } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                e.preventDefault()
                onSelectYear(YEAR_MARKS[Math.max(0, (index < 0 ? 1 : index) - 1)])
              } else if (e.key === 'Home') {
                e.preventDefault()
                onSelectYear(YEAR_MARKS[0])
              } else if (e.key === 'End') {
                e.preventDefault()
                onSelectYear(YEAR_MARKS[YEAR_MARKS.length - 1])
              }
            }}
          />
        </svg>
      </div>
      {shown && (
        <dl className="future-readout" aria-live="polite">
          <div><dt>{shown.year === 0 ? 'Today' : `Year ${shown.year}`}</dt><dd className="num">{moneyWhole(shown.netWorth)}</dd></div>
          <div><dt>Investments</dt><dd className="num">{moneyWhole(shown.investments)}</dd></div>
          <div><dt>Cash</dt><dd className="num">{moneyWhole(shown.cash)}</dd></div>
          <div><dt>Other</dt><dd className="num">{moneyWhole(shown.other)}</dd></div>
          <div><dt>Debts</dt><dd className="num">{moneyWhole(shown.debts)}</dd></div>
        </dl>
      )}
    </figure>
  )
}
