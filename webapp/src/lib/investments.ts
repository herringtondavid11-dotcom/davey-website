// Portfolio history and returns for Davey on the web: the same rules as InvestmentAnalytics.swift. Daily values come from
// the server's investment_snapshots (estimated before Davey's own daily values; net_flow = money added or withdrawn).

export interface Snapshot {
  accountId: string
  date: string // yyyy-mm-dd
  value: number
  netFlow: number
  estimated: boolean
}

export interface DayPoint {
  date: string
  value: number
  netFlow: number
}

/** Snapshot rows from the API (numeric columns arrive as strings). */
export function normalizeSnapshots(rows: Record<string, unknown>[]): Snapshot[] {
  return rows.map((r) => ({
    accountId: String(r.account_id),
    date: String(r.date).slice(0, 10),
    value: Number(r.value) || 0,
    netFlow: Number(r.net_flow) || 0,
    estimated: r.estimated === true,
  }))
}

/** The portfolio's value per day for the given accounts: each account carries its last known value forward. */
export function portfolioSeries(snapshots: Snapshot[], accountIds: Set<string>): DayPoint[] {
  const scoped = snapshots.filter((s) => accountIds.has(s.accountId)).sort((a, b) => a.date.localeCompare(b.date))
  const dates = [...new Set(scoped.map((s) => s.date))].sort()
  const last = new Map<string, number>()
  const byDate = new Map<string, Snapshot[]>()
  for (const s of scoped) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s])
  return dates.map((date) => {
    let flow = 0
    for (const s of byDate.get(date) ?? []) {
      last.set(s.accountId, s.value)
      flow += s.netFlow
    }
    let value = 0
    for (const v of last.values()) value += v
    return { date, value: Math.round(value * 100) / 100, netFlow: Math.round(flow * 100) / 100 }
  })
}

/** Time-weighted return: growth with deposits and withdrawals taken out, chained day by day (TimeWeightedReturn.swift). */
export function timeWeightedReturn(points: DayPoint[]): number | undefined {
  if (points.length < 2) return undefined
  let growth = 1
  let counted = false
  for (let i = 1; i < points.length; i++) {
    if (points[i - 1].value <= 0) continue
    growth *= (points[i].value - points[i].netFlow) / points[i - 1].value
    counted = true
  }
  return counted ? growth - 1 : undefined
}

export type Range = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL'
export const RANGES: Range[] = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL']

/** The first day of a range ending `today` (yyyy-mm-dd). */
export function rangeStart(range: Range, today: string): string {
  const [y, m, d] = today.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  switch (range) {
    case '1M': date.setUTCMonth(date.getUTCMonth() - 1); break
    case '3M': date.setUTCMonth(date.getUTCMonth() - 3); break
    case '6M': date.setUTCMonth(date.getUTCMonth() - 6); break
    case 'YTD': return `${y}-01-01`
    case '1Y': date.setUTCFullYear(date.getUTCFullYear() - 1); break
    case 'ALL': return '0000-01-01'
  }
  return date.toISOString().slice(0, 10)
}

/** The points within [start, today], starting from the last value before `start` so the first change counts. */
export function pointsSince(points: DayPoint[], start: string): DayPoint[] {
  const before = points.filter((p) => p.date < start).pop()
  const inside = points.filter((p) => p.date >= start)
  return before ? [{ ...before, netFlow: 0 }, ...inside] : inside
}

export interface Period {
  label: string
  start: string
  end: string
  startValue: number
  endValue: number
  contributions: number
  growth: number
  returnFraction?: number
}

/** The last `count` monthly / quarterly / annual periods (oldest first), like InvestmentAnalytics.periods. */
export function periods(points: DayPoint[], granularity: 'monthly' | 'quarterly' | 'annual', count: number, today: string): Period[] {
  const months = granularity === 'monthly' ? 1 : granularity === 'quarterly' ? 3 : 12
  const [ty, tm] = today.split('-').map(Number)
  const align = granularity === 'monthly' ? 0 : (tm - 1) % months
  const currentStart = new Date(Date.UTC(ty, tm - 1 - align, 1))
  const out: Period[] = []
  for (let back = count - 1; back >= 0; back--) {
    const s = new Date(currentStart)
    s.setUTCMonth(s.getUTCMonth() - back * months)
    const e = new Date(s)
    e.setUTCMonth(e.getUTCMonth() + months)
    const start = s.toISOString().slice(0, 10)
    const endExclusive = e.toISOString().slice(0, 10)
    const window = pointsSince(points.filter((p) => p.date < endExclusive), start)
    if (window.length < 2) continue
    const startValue = window[0].value
    const endValue = window[window.length - 1].value
    const contributions = window.slice(1).reduce((sum, p) => sum + p.netFlow, 0)
    const label = granularity === 'monthly'
      ? s.toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
      : granularity === 'quarterly' ? `Q${Math.floor(s.getUTCMonth() / 3) + 1} '${String(s.getUTCFullYear()).slice(2)}` : String(s.getUTCFullYear())
    out.push({ label, start, end: window[window.length - 1].date, startValue, endValue, contributions,
      growth: endValue - startValue - contributions, returnFraction: timeWeightedReturn(window) })
  }
  return out
}

/** "Estimated history" until Davey has 30 real daily values for these accounts. */
export function historyIsEstimated(snapshots: Snapshot[], accountIds: Set<string>): boolean {
  const scoped = snapshots.filter((s) => accountIds.has(s.accountId))
  const realDays = new Set(scoped.filter((s) => !s.estimated).map((s) => s.date)).size
  return scoped.some((s) => s.estimated) && realDays < 30
}

/** Short names for lists (AccountNaming.compactName): nickname, else "{Institution} – {short name} ••{last4}". */
export function compactName(a: { nickname?: string; name: string; institution?: string; mask?: string }, limit = 24): string {
  if (a.nickname?.trim()) return a.nickname.trim()
  const instWords = (a.institution ?? '').split(' ').filter(Boolean)
  const shortInst = instWords.slice(0, 2).join(' ')
  const skip = new Set([...instWords.map((w) => w.toLowerCase()), 'account', 'acct', '-', '–'])
  const keepUpper = new Set(['IRA', 'HSA', '401K', '403B', '529', 'UTMA', 'UGMA', 'SEP', 'LLC', 'USD'])
  const words = a.name.split(/[ _]+/).filter((w) => w && !skip.has(w.toLowerCase())).map((w) => {
    const up = w.toUpperCase()
    if (keepUpper.has(up)) return up
    return w === up && w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w
  })
  let short = ''
  for (const w of words) if (short.length + w.length + (short ? 1 : 0) <= limit) short += (short ? ' ' : '') + w
  if (!short) short = a.name.slice(0, limit)
  const last4 = a.mask?.trim() ? ` ••${a.mask.trim().slice(-4)}` : ''
  return (shortInst ? `${shortInst} – ${short}` : short) + last4
}
