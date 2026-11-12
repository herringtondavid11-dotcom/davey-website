// Household income. Amounts are integer cents.
// A monthly cadence keeps a flat amount per active month (the original model).
// Biweekly is 26 pays a year and weekly is 52; those months are not all equal.
// One-time, a fixed number of pays, and a short date range only land in the months they occur.

import { isTransfer } from './budget'

export const INCOME_CATEGORIES = [
  { id: 'w2', label: 'W-2' },
  { id: 'self_employment', label: 'Self-employment' },
  { id: 'contract_1099', label: '1099 contract' },
  { id: 'k1', label: 'Business / K-1' },
  { id: 'side_gig', label: 'Side gig' },
  { id: 'real_estate', label: 'Real estate / rental' },
  { id: 'investment', label: 'Investments / dividends / interest' },
  { id: 'retirement', label: 'Social Security / pension / retirement' },
  { id: 'support', label: 'Alimony / child support' },
  { id: 'other', label: 'Other' },
] as const

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number]['id']

/** Self-employment tax. K-1 is treated as active (general partner / working owner). */
export const SE_CATEGORIES = new Set<IncomeCategory>(['self_employment', 'contract_1099', 'k1', 'side_gig'])
/** Counted as cash income, left out of the tax estimate. */
export const UNTAXED_CATEGORIES = new Set<IncomeCategory>(['support'])

export const CADENCES = [
  { id: 'monthly', label: 'Once a month' },
  { id: 'twice', label: 'Twice a month' },
  { id: 'four', label: 'Four times a month' },
  { id: 'biweekly', label: 'Every two weeks (26 a year)' },
  { id: 'weekly', label: 'Weekly (52 a year)' },
  { id: 'custom', label: 'Custom' },
] as const

export type Cadence = (typeof CADENCES)[number]['id']

export const DURATIONS = [
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'once', label: 'One-time' },
  { id: 'repeat', label: 'A couple of times' },
  { id: 'range', label: 'Short-term' },
] as const

export type Duration = (typeof DURATIONS)[number]['id']

export type IncomeStatus = 'confirmed' | 'planned'

/** $1,000,000,000. Matches the database check. */
export const MAX_CENTS = 100_000_000_000

export interface IncomeSource {
  id: string
  name: string
  category: IncomeCategory
  /** Flat amount for an active month when the cadence pays a fixed number of times each month. */
  monthlyCents: number
  amountBasis: 'monthly' | 'annual'
  startsOn: string | null
  endsOn: string | null
  overrides: Record<string, number>
  cadence: Cadence
  /** Custom cadence: how many times it pays in about 30 days. */
  timesPerMonth: number
  /** Amount of one paycheck or payment. */
  occurrenceCents: number
  duration: Duration
  /** How many payments, for "a couple of times". */
  occurrenceCount: number
  status: IncomeStatus
  /** Household member. Null with no personOther is unassigned (older rows). */
  personUserId: string | null
  personOther: string | null
  createdAt: string
}

export interface IncomeScenario {
  id: string
  name: string
  kind: 'raise' | 'hypothetical'
  sourceId: string | null
  /** Percent added to each month from the effective month. */
  raisePercent: number | null
  /** Cents added to each month from the effective month. */
  raiseCents: number | null
  effectiveMonth: string | null
  enabled: boolean
  hypothetical: IncomeSource | null
  createdAt: string
}

export interface HouseholdPerson {
  userId: string
  name: string
}

export function clampCents(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(MAX_CENTS, Math.round(n)))
}

export function amountToCents(text: string): number | null {
  const t = text.replace(/[$,\s]/g, '').replace(/\.$/, '')
  if (t === '') return 0
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0 || n > MAX_CENTS / 100) return null
  return clampCents(n * 100)
}

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

export function isShortTerm(source: Pick<IncomeSource, 'duration'>): boolean {
  return source.duration !== 'ongoing'
}

/** Pays inside a typical 30-day month. Biweekly and weekly are yearly counts, not this. */
export function timesEachMonth(source: Pick<IncomeSource, 'cadence' | 'timesPerMonth'>): number {
  switch (source.cadence) {
    case 'monthly': return 1
    case 'twice': return 2
    case 'four': return 4
    case 'custom': return Math.max(1, Math.round(source.timesPerMonth) || 1)
    default: return 0
  }
}

export function paysPerYear(source: Pick<IncomeSource, 'cadence' | 'timesPerMonth'>): number {
  switch (source.cadence) {
    case 'monthly': return 12
    case 'twice': return 24
    case 'four': return 48
    case 'biweekly': return 26
    case 'weekly': return 52
    case 'custom': return timesEachMonth(source) * 12
  }
}

function flatMonth(source: IncomeSource): boolean {
  return (source.duration === 'ongoing' || source.duration === 'range') && timesEachMonth(source) > 0
}

function onePay(source: IncomeSource): number {
  return source.occurrenceCents > 0 ? source.occurrenceCents : source.monthlyCents
}

export function monthCents(source: IncomeSource, key: string): number {
  if (Object.hasOwn(source.overrides, key)) return clampCents(source.overrides[key])
  if (source.duration === 'once') {
    const month = source.startsOn ?? `${key.slice(0, 4)}-01`
    return key === month ? onePay(source) : 0
  }
  if (source.duration === 'repeat') {
    return (repeatCounts(source, Number(key.slice(0, 4))).get(key) ?? 0) * onePay(source)
  }
  if (!isActive(source, key)) return 0
  if (source.cadence === 'biweekly' || source.cadence === 'weekly') {
    return (periodCounts(source, Number(key.slice(0, 4))).get(key) ?? 0) * onePay(source)
  }
  return clampCents(source.monthlyCents)
}

export function yearTotalCents(source: IncomeSource, year: number): number {
  return yearKeys(year).reduce((sum, key) => sum + monthCents(source, key), 0)
}

export function withMonthly(source: IncomeSource, monthlyCents: number): IncomeSource {
  const monthly = clampCents(monthlyCents)
  if (source.cadence === 'biweekly') {
    return { ...source, monthlyCents: monthly, occurrenceCents: Math.round((monthly * 12) / 26), amountBasis: 'monthly' }
  }
  if (source.cadence === 'weekly') {
    return { ...source, monthlyCents: monthly, occurrenceCents: Math.round((monthly * 12) / 52), amountBasis: 'monthly' }
  }
  const times = Math.max(1, timesEachMonth(source))
  return { ...source, monthlyCents: monthly, occurrenceCents: Math.round(monthly / times), amountBasis: 'monthly' }
}

export function withOccurrence(source: IncomeSource, occurrenceCents: number, year: number): IncomeSource {
  const occurrence = clampCents(occurrenceCents)
  const next = { ...source, occurrenceCents: occurrence, amountBasis: 'monthly' as const }
  if (next.duration === 'once') return { ...next, monthlyCents: occurrence }
  if (flatMonth(next)) return { ...next, monthlyCents: clampCents(occurrence * timesEachMonth(next)) }
  const total = yearKeys(year).reduce((sum, key) => sum + monthCents({ ...next, overrides: {} }, key), 0)
  return { ...next, monthlyCents: Math.round(total / 12) }
}

export function withCadence(source: IncomeSource, cadence: Cadence, year: number): IncomeSource {
  return withOccurrence({ ...source, cadence, occurrenceCents: source.occurrenceCents || source.monthlyCents }, source.occurrenceCents || source.monthlyCents, year)
}

export function withDuration(source: IncomeSource, duration: Duration, year: number): IncomeSource {
  const next = { ...source, duration, occurrenceCents: source.occurrenceCents || source.monthlyCents }
  if (flatMonth(next)) return { ...next, monthlyCents: clampCents(next.occurrenceCents * Math.max(1, timesEachMonth(next))) }
  const total = yearKeys(year).reduce((sum, key) => sum + monthCents({ ...next, overrides: {} }, key), 0)
  return { ...next, monthlyCents: duration === 'once' ? next.occurrenceCents : Math.round(total / 12) }
}

export function withTimes(source: IncomeSource, timesPerMonth: number, year: number): IncomeSource {
  const times = Math.max(1, Math.min(31, Math.round(timesPerMonth) || 1))
  return withOccurrence({ ...source, timesPerMonth: times }, source.occurrenceCents || source.monthlyCents, year)
}

/**
 * Make this year's forecast add up to `annualCents`.
 * A flat monthly cadence keeps each open month equal (remainder on the last month).
 * Biweekly and weekly change the amount of each paycheck so the pays in the year add up.
 */
export function withAnnual(source: IncomeSource, year: number, annualCents: number): IncomeSource {
  const target = clampCents(annualCents)
  if (!flatMonth(source)) return withAnnualByPay(source, year, target)
  const keys = yearKeys(year)
  const slots = keys.filter((key) => isActive(source, key) || Object.hasOwn(source.overrides, key))
  const overrides = { ...source.overrides }
  if (slots.length === 0) return { ...source, monthlyCents: 0, occurrenceCents: 0, amountBasis: 'annual' }

  const open = slots.filter((key) => isActive(source, key) && !Object.hasOwn(source.overrides, key))
  const fixed = slots
    .filter((key) => Object.hasOwn(source.overrides, key))
    .reduce((sum, key) => sum + clampCents(source.overrides[key]), 0)

  if (open.length > 0 && fixed <= target) {
    const share = target - fixed
    const each = Math.floor(share / open.length)
    const remainder = share - each * open.length
    if (remainder > 0) overrides[open[open.length - 1]] = each + remainder
    const times = Math.max(1, timesEachMonth(source))
    return { ...source, monthlyCents: each, occurrenceCents: Math.round(each / times), amountBasis: 'annual', overrides }
  }

  const scaled = apportion(slots.map((key) => monthCents(source, key)), target)
  const base = mostCommon(scaled)
  slots.forEach((key, i) => {
    if (scaled[i] === base && isActive(source, key)) delete overrides[key]
    else overrides[key] = scaled[i]
  })
  const times = Math.max(1, timesEachMonth(source))
  return { ...source, monthlyCents: base, occurrenceCents: Math.round(base / times), amountBasis: 'annual', overrides }
}

export function withRange(source: IncomeSource, year: number, startsOn: string | null, endsOn: string | null): IncomeSource {
  const next = { ...source, startsOn, endsOn }
  if (source.amountBasis !== 'annual') {
    if (flatMonth(next)) return next
    const total = yearKeys(year).reduce((sum, key) => sum + monthCents({ ...next, overrides: next.overrides }, key), 0)
    return { ...next, monthlyCents: Math.round(total / 12) }
  }
  return withAnnual(next, year, yearTotalCents(source, year))
}

export function withOverride(source: IncomeSource, key: string, cents: number): IncomeSource {
  if (!isMonthKey(key)) return source
  const overrides = { ...source.overrides }
  const amount = clampCents(cents)
  const natural = naturalMonth(source, key)
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
  const totals = Object.fromEntries(INCOME_CATEGORIES.map((item) => [item.id, 0])) as Record<IncomeCategory, number>
  for (const source of sources) totals[source.category] += yearTotalCents(source, year)
  return totals
}

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

export function blankSource(userId: string | null = null, now = new Date()): IncomeSource {
  return {
    id: crypto.randomUUID(),
    name: 'New income',
    category: 'w2',
    monthlyCents: 0,
    amountBasis: 'monthly',
    startsOn: null,
    endsOn: null,
    overrides: {},
    cadence: 'monthly',
    timesPerMonth: 1,
    occurrenceCents: 0,
    duration: 'ongoing',
    occurrenceCount: 2,
    status: 'confirmed',
    personUserId: userId,
    personOther: null,
    createdAt: now.toISOString(),
  }
}

export function personLabel(source: IncomeSource, people: HouseholdPerson[]): string {
  if (source.personOther?.trim()) return source.personOther.trim()
  const found = people.find((person) => person.userId === source.personUserId)
  return found?.name || 'Household'
}

/** Confirmed rows, plus planned rows and enabled what-ifs when asked. Confirmed rows are copied, not edited. */
export function projectIncome(sources: IncomeSource[], scenarios: IncomeScenario[], year: number, includePlanned: boolean): IncomeSource[] {
  const base = sources.filter((source) => source.status === 'confirmed' || (includePlanned && source.status === 'planned'))
  const raised = base.map((source) => scenarios
    .filter((scenario) => scenario.enabled && scenario.kind === 'raise' && scenario.sourceId === source.id)
    .reduce((current, scenario) => applyRaise(current, scenario, year), source))
  const added = scenarios
    .filter((scenario) => scenario.enabled && scenario.kind === 'hypothetical' && scenario.hypothetical)
    .map((scenario) => scenario.hypothetical as IncomeSource)
  return [...raised, ...added]
}

export function applyRaise(source: IncomeSource, scenario: IncomeScenario, year: number): IncomeSource {
  const overrides = { ...source.overrides }
  for (const key of yearKeys(year)) {
    if (scenario.effectiveMonth && key < scenario.effectiveMonth) continue
    const base = monthCents(source, key)
    if (base <= 0) continue
    const next = scenario.raisePercent != null
      ? Math.round(base * (1 + scenario.raisePercent / 100))
      : base + (scenario.raiseCents ?? 0)
    if (next !== base) overrides[key] = clampCents(next)
  }
  return { ...source, overrides }
}

export interface MixSlice {
  id: string
  name: string
  cents: number
}

export function mixBy(sources: IncomeSource[], year: number, keyOf: (source: IncomeSource) => { id: string; name: string }): MixSlice[] {
  const map = new Map<string, MixSlice>()
  for (const source of sources) {
    const cents = yearTotalCents(source, year)
    if (cents <= 0) continue
    const key = keyOf(source)
    const current = map.get(key.id) ?? { id: key.id, name: key.name, cents: 0 }
    current.cents += cents
    map.set(key.id, current)
  }
  return [...map.values()].sort((a, b) => b.cents - a.cents)
}

function withAnnualByPay(source: IncomeSource, year: number, target: number): IncomeSource {
  const counts = payCounts(source, year)
  const pays = [...counts.values()].reduce((sum, n) => sum + n, 0)
  if (pays <= 0) return { ...source, monthlyCents: 0, occurrenceCents: 0, amountBasis: 'annual' }
  const each = Math.floor(target / pays)
  const remainder = target - each * pays
  const overrides = { ...source.overrides }
  if (remainder > 0) {
    const last = [...counts.keys()].sort().at(-1)
    if (last) overrides[last] = (counts.get(last) ?? 0) * each + remainder
  }
  const next = { ...source, occurrenceCents: each, amountBasis: 'annual' as const, overrides }
  const total = yearKeys(year).reduce((sum, key) => sum + monthCents(next, key), 0)
  return { ...next, monthlyCents: Math.round(total / 12) }
}

function naturalMonth(source: IncomeSource, key: string): number {
  return monthCents({ ...source, overrides: {} }, key)
}

function payCounts(source: IncomeSource, year: number): Map<string, number> {
  if (source.duration === 'repeat') return repeatCounts(source, year)
  if (source.cadence === 'biweekly') return periodCounts(source, year)
  if (source.cadence === 'weekly') return periodCounts(source, year)
  const counts = new Map<string, number>()
  const times = Math.max(1, timesEachMonth(source))
  for (const key of yearKeys(year)) if (isActive(source, key)) counts.set(key, times)
  return counts
}

/** 26 biweekly dates or 52 weekly dates anchored on 6 January, kept inside the start and end months. */
function periodCounts(source: IncomeSource, year: number): Map<string, number> {
  const step = source.cadence === 'weekly' ? 7 : 14
  const limit = source.cadence === 'weekly' ? 52 : 26
  const counts = new Map<string, number>()
  let cursor = `${year}-01-06`
  for (let i = 0; i < limit; i++) {
    const key = cursor.slice(0, 7)
    if (key.startsWith(String(year)) && isActive(source, key)) counts.set(key, (counts.get(key) ?? 0) + 1)
    cursor = addDays(cursor, step)
  }
  return counts
}

function repeatCounts(source: IncomeSource, year: number): Map<string, number> {
  const counts = new Map<string, number>()
  const total = Math.max(1, Math.min(366, Math.round(source.occurrenceCount) || 1))
  let cursor = source.startsOn ? `${source.startsOn}-01` : `${year}-01-01`
  for (let i = 0; i < total; i++) {
    const key = cursor.slice(0, 7)
    if (key.startsWith(String(year))) counts.set(key, (counts.get(key) ?? 0) + 1)
    cursor = source.cadence === 'monthly' || source.cadence === 'custom' ? addMonths(cursor, 1) : addDays(cursor, source.cadence === 'weekly' || source.cadence === 'four' ? 7 : source.cadence === 'twice' ? 15 : 14)
  }
  return counts
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

function addMonths(iso: string, count: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1 + count, 1))
  const last = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()
  const day = Math.min(d, last)
  return new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), day)).toISOString().slice(0, 10)
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
