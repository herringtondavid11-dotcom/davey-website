import { isTransfer } from './budget'
import type { Transaction } from './schema'
import type { StoredRecurring } from './tables'

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly'
export type RecurringKind = 'subscription' | 'bill' | 'income'

export interface Recurring {
  key: string
  name: string
  kind: RecurringKind
  frequency: Frequency
  /** Typical amount, positive. */
  amount: number
  variable: boolean
  lastDate: string
  nextDate: string
  category?: string
  accountId?: string
  count: number
  /** Normalized to a month. */
  monthly: number
  /** Actual charge dates seen (ascending). */
  dates: string[]
}

const BANDS: [Frequency, number, number, number][] = [
  // name, min days, max days, typical
  ['weekly', 6, 8, 7],
  ['biweekly', 13, 16, 14],
  ['monthly', 26, 35, 30.4],
  ['quarterly', 84, 98, 91],
  ['yearly', 350, 380, 365],
]
const PER_MONTH: Record<Frequency, number> = { weekly: 52 / 12, biweekly: 26 / 12, monthly: 1, quarterly: 1 / 3, yearly: 1 / 12 }
const SUBSCRIPTION_HINT = /subscription|streaming|software|netflix|spotify|hulu|disney|apple|google|youtube|adobe|microsoft|amazon prime|icloud|dropbox|patreon|gym|equinox|peloton|nytimes|audible/i
const BILL_HINT = /rent|mortgage|utilit|electric|gas co|water|internet|comcast|xfinity|verizon|at&t|t-mobile|insurance|loan/i

export function merchantKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(sq|tst|pp|paypal|sp|py|in)\s*\*\s*/, '')
    .replace(/[#*].*$/, '')
    .replace(/\d{3,}/g, '')
    .replace(/\b(inc|llc|co|corp|com|www|pos|debit|purchase|ach|payment)\b/g, '')
    .replace(/[^a-z&]+/g, ' ')
    .trim()
}

const DAY = 86400000
const toTime = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
const toIso = (t: number) => new Date(t).toISOString().slice(0, 10)
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** Next occurrence after `iso`; monthly-type steps keep the day of month. */
export function step(iso: string, f: Frequency, times = 1): string {
  if (f === 'weekly' || f === 'biweekly') return toIso(toTime(iso) + times * (f === 'weekly' ? 7 : 14) * DAY)
  const months = f === 'monthly' ? 1 : f === 'quarterly' ? 3 : 12
  const y = +iso.slice(0, 4)
  const m = +iso.slice(5, 7) - 1 + months * times
  const d = +iso.slice(8, 10)
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return toIso(Date.UTC(y, m, Math.min(d, last)))
}

export function detectRecurring(list: Transaction[], today = new Date().toISOString().slice(0, 10)): Recurring[] {
  const groups = new Map<string, Transaction[]>()
  for (const t of list) {
    if (t.pending || isTransfer(t) || !t.date) continue
    const key = `${t.amount > 0 ? 'in' : 'out'}:${merchantKey(t.name)}`
    if (key.endsWith(':')) continue
    groups.set(key, [...(groups.get(key) ?? []), t])
  }
  const out: Recurring[] = []
  for (const [key, txns] of groups) {
    if (txns.length < 3) continue
    txns.sort((a, b) => a.date.localeCompare(b.date))
    // Collapse same-day duplicates.
    const dates = [...new Set(txns.map((t) => t.date))]
    if (dates.length < 3) continue
    const gaps = dates.slice(1).map((d, i) => (toTime(d) - toTime(dates[i])) / DAY)
    const med = median(gaps)
    const band = BANDS.find(([, lo, hi]) => med >= lo && med <= hi)
    if (!band) continue
    const [frequency, lo, hi] = band
    const regular = gaps.filter((g) => g >= lo - 2 && g <= hi + 2).length / gaps.length
    if (regular < 0.66) continue
    const last = dates[dates.length - 1]
    // Stale: missed more than two cycles.
    if ((toTime(today) - toTime(last)) / DAY > band[3] * 2.5) continue
    const amounts = txns.map((t) => Math.abs(t.amount))
    const amount = median(amounts)
    const variable = amounts.some((a) => Math.abs(a - amount) > Math.max(1, amount * 0.15))
    const sample = txns[txns.length - 1]
    const income = key.startsWith('in:')
    const text = `${sample.name} ${sample.category ?? ''}`
    const kind: RecurringKind = income ? 'income' : SUBSCRIPTION_HINT.test(text) && !BILL_HINT.test(text) ? 'subscription' : 'bill'
    let next = step(last, frequency)
    while (next < today) next = step(next, frequency)
    out.push({
      key,
      name: sample.name,
      kind,
      frequency,
      amount,
      variable,
      lastDate: last,
      nextDate: next,
      category: sample.category,
      accountId: sample.accountId,
      count: txns.length,
      monthly: amount * PER_MONTH[frequency],
      dates,
    })
  }
  return out.sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}

/** Stored streams (if the app saves them) win over detection for the same merchant. */
export function mergeStored(detected: Recurring[], stored: StoredRecurring[], today = new Date().toISOString().slice(0, 10)): Recurring[] {
  const byKey = new Map(detected.map((r) => [merchantKey(r.name), r]))
  for (const s of stored) {
    const f = (['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as Frequency[]).find((x) => s.frequency.startsWith(x.slice(0, 4))) ?? 'monthly'
    const k = merchantKey(s.name)
    const prev = byKey.get(k)
    const next = s.nextDate ?? prev?.nextDate ?? today
    byKey.set(k, {
      key: `stored:${s.id}`,
      name: s.name,
      kind: prev?.kind ?? (SUBSCRIPTION_HINT.test(s.name) ? 'subscription' : 'bill'),
      frequency: f,
      amount: s.amount,
      variable: prev?.variable ?? false,
      lastDate: prev?.lastDate ?? '',
      nextDate: next,
      category: s.category ?? prev?.category,
      accountId: prev?.accountId,
      count: prev?.count ?? 0,
      monthly: s.amount * PER_MONTH[f],
      dates: prev?.dates ?? [],
    })
  }
  return [...byKey.values()].sort((a, b) => a.nextDate.localeCompare(b.nextDate))
}

/** Every expected charge in a calendar month (yyyy-mm). */
export function occurrencesInMonth(items: Recurring[], month: string): { date: string; item: Recurring }[] {
  const out: { date: string; item: Recurring }[] = []
  const start = `${month}-01`
  const end = `${month}-31`
  for (const item of items) {
    if (item.dates.length) {
      // Real charges up to the last one, projections after it.
      for (const d of item.dates) if (d.startsWith(month)) out.push({ date: d, item })
      let d = step(item.dates[item.dates.length - 1], item.frequency)
      let guard = 0
      while (d <= end && guard++ < 400) {
        if (d >= start && d.startsWith(month)) out.push({ date: d, item })
        d = step(d, item.frequency)
      }
      continue
    }
    let d = item.nextDate
    let guard = 0
    while (d >= start && guard++ < 400) d = step(d, item.frequency, -1)
    guard = 0
    while (d <= end && guard++ < 400) {
      if (d >= start && d.startsWith(month)) out.push({ date: d, item })
      d = step(d, item.frequency)
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
}
