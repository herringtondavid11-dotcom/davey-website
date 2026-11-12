// Household income: a monthly rate, a year total derived from it, and months that differ.
// Amounts are integer cents so a typed dollar never becomes a fraction of a cent.

import { isTransfer } from './budget'

export const INCOME_CATEGORIES = [
  { id: 'w2', label: 'W-2 job' },
  { id: 'self_employment', label: 'Self-employment' },
  { id: 'real_estate', label: 'Real estate' },
  { id: 'other', label: 'Other' },
] as const

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]['id']

/** $1,000,000,000. Matches the database check. */
export const MAX_CENTS = 100_000_000_000

export interface IncomeSource {
  id: string
  name: string
  category: IncomeCategory
  /** Amount for an active month that has no override. */
  monthlyCents: number
  /**
   * Which field was edited last. Annual means a later change to the start or end
   * keeps this year's total and recomputes the monthly rate.
   */
  amountBasis: 'monthly' | 'annual'
  /** Inclusive YYYY-MM. Null start = already on in January. Null end = still on in December. */
  startsOn: string | null
  endsOn: string | null
  /** YYYY-MM → cents. Replaces that month, including months outside the start/end window. */
  overrides: Record<string, number>
  createdAt: string
}

export function clampCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(MAX_CENTS, Math.round(n)))
}

/** Dollars typed in a field, or null when it isn't an amount. A trailing dot ("8.") counts. Empty is 0. */
export function amountToCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '').replace(/\.$/, '')
  if (t === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0 || n > MAX_CENTS / 100) return null
  return clampCents(n * 100)
}

/** What the amount field shows. Whole dollars stay whole; cents keep two places. */
export function formatAmount(cents: number): string {
  const n = clampCents(cents)
  const whole = Math.floor(n / 100)
  const frac = n % 100
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`
}

export function centsToDollars(cents: number): number {
  return Number((clampCents(cents) / 100).toFixed(2))
}

export function yearKeys(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, '0')}`)
}

export function isMonthKey(value: string): boolean {
  return /^[0-9]{4}-(0[1-9]|1[0-2])$/.test(value)
}

export function isActive(source: Pick<IncomeSource, 'startsOn' | 'endsOn'>, key: string): boolean {
  if (source.startsOn && key < source.startsOn) return false
  if (source.endsOn && key > source.endsOn) return false
  return true
}

export function monthCents(source: IncomeSource, key: string): number {
  if (Object.hasOwn(source.overrides, key)) return clampCents(source.overrides[key])
  if (!isActive(source, key)) return 0
  return clampCents(source.monthlyCents)
}

export function yearTotalCents(source: IncomeSource, year: number): number {
  return yearKeys(year).reduce((sum, key) => sum + monthCents(source, key), 0)
}

export function withMonthly(source: IncomeSource, monthlyCents: number): IncomeSource {
  return { ...source, monthlyCents: clampCents(monthlyCents), amountBasis: 'monthly' }
}

/**
 * Make this year's forecast add up to `annualCents`.
 * Months already set on their own keep that amount when the new total still covers them.
 * Otherwise every contributing month is scaled so the shape stays and the total matches.
 */
export function withAnnual(source: IncomeSource, year: number, annualCents: number): IncomeSource {
  const target = clampCents(annualCents)
  const keys = yearKeys(year)
  const slots = keys.filter((key) => isActive(source, key) || Object.hasOwn(source.overrides, key))
  const overrides = { ...source.overrides }
  if (slots.length === 0) return { ...source, monthlyCents: 0, amountBasis: 'annual' }

  const open = slots.filter((key) => isActive(source, key) && !Object.hasOwn(source.overrides, key))
  const fixed = slots
    .filter((key) => Object.hasOwn(source.overrides, key))
    .reduce((sum, key) => sum + clampCents(source.overrides[key]), 0)

  if (open.length > 0 && fixed <= target) {
    const share = target - fixed
    const each = Math.floor(share / open.length)
    const remainder = share - each * open.length
    if (remainder > 0) overrides[open[open.length - 1]] = each + remainder
    return { ...source, monthlyCents: each, amountBasis: 'annual', overrides }
  }

  const scaled = apportion(slots.map((key) => monthCents(source, key)), target)
  const base = mostCommon(scaled)
  slots.forEach((key, i) => {
    if (scaled[i] === base && isActive(source, key)) delete overrides[key]
    else overrides[key] = scaled[i]
  })
  return { ...source, monthlyCents: base, amountBasis: 'annual', overrides }
}

/** Keep a year total that was entered as an annual amount when the active window changes. */
export function withRange(source: IncomeSource, year: number, startsOn: string | null, endsOn: string | null): IncomeSource {
  const next = { ...source, startsOn, endsOn }
  if (source.amountBasis !== 'annual') return next
  return withAnnual(next, year, yearTotalCents(source, year))
}

/** A month typed on its own. Matching the regular monthly amount clears the override. */
export function withOverride(source: IncomeSource, key: string, cents: number): IncomeSource {
  if (!isMonthKey(key)) return source
  const overrides = { ...source.overrides }
  const amount = clampCents(cents)
  const natural = isActive(source, key) ? source.monthlyCents : 0
  if (amount === natural) delete overrides[key]
  else overrides[key] = amount
  return { ...source, overrides }
}

export interface ForecastMonth {
  key: string
  bySource: Record<string, number>
  totalCents: number
}

export function forecastYear(sources: IncomeSource[], year: number): ForecastMonth[] {
  return yearKeys(year).map((key) => {
    const bySource: Record<string, number> = {}
    let totalCents = 0
    for (const source of sources) {
      const cents = monthCents(source, key)
      bySource[source.id] = cents
      totalCents += cents
    }
    return { key, bySource, totalCents }
  })
}

export function categoryTotals(sources: IncomeSource[], year: number): Record<IncomeCategory, number> {
  const totals: Record<IncomeCategory, number> = { w2: 0, self_employment: 0, real_estate: 0, other: 0 }
  for (const source of sources) totals[source.category] += yearTotalCents(source, year)
  return totals
}

/** Income already recorded, in cents by YYYY-MM. Transfers and pending charges are left out. */
export function actualIncomeCents(
  transactions: { date: string; amount: number; pending: boolean; category?: string; name: string }[],
  year: number,
): Record<string, number> {
  const out: Record<string, number> = {}
  const prefix = `${year}-`
  for (const t of transactions) {
    if (t.pending || t.amount <= 0 || !t.date.startsWith(prefix) || isTransfer(t)) continue
    const key = t.date.slice(0, 7)
    if (!isMonthKey(key)) continue
    out[key] = (out[key] ?? 0) + Math.round(t.amount * 100)
  }
  return out
}

export function blankSource(now = new Date()): IncomeSource {
  return {
    id: crypto.randomUUID(),
    name: 'New income',
    category: 'w2',
    monthlyCents: 0,
    amountBasis: 'monthly',
    startsOn: null,
    endsOn: null,
    overrides: {},
    createdAt: now.toISOString(),
  }
}

function mostCommon(values: number[]): number {
  const counts = new Map<number, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  let best = values[0] ?? 0
  let seen = 0
  for (const [value, count] of counts) {
    if (count > seen) {
      best = value
      seen = count
    }
  }
  return best
}

/** Split `target` across `parts` by their weights. The pieces are integers and sum to target. */
function apportion(parts: number[], target: number): number[] {
  if (parts.length === 0) return []
  const sum = parts.reduce((total, n) => total + n, 0)
  if (sum <= 0) {
    const each = Math.floor(target / parts.length)
    const remainder = target - each * parts.length
    return parts.map((_, i) => each + (i === parts.length - 1 ? remainder : 0))
  }
  const raw = parts.map((n) => (n / sum) * target)
  const floors = raw.map((n) => Math.floor(n))
  let left = target - floors.reduce((total, n) => total + n, 0)
  const order = raw
    .map((n, i) => ({ i, frac: n - Math.floor(n) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  for (const item of order) {
    if (left <= 0) break
    floors[item.i] += 1
    left -= 1
  }
  return floors
}
