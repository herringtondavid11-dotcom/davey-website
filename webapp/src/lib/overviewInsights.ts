// The redesigned Overview's numbers: the same rules as the app's OverviewInsights.swift (net worth ranges, spending by
// category this month vs last month to the same day, "This week"). Transfers don't count as income or spending.
import { isTransfer, monthKey } from './budget'
import { netWorth } from './finance'
import type { Account, Transaction } from './schema'

export const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'] as const
export type Range = (typeof RANGES)[number]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (day: string) => new Date(`${day}T12:00:00`)
const addMonths = (d: Date, n: number) => {
  const out = new Date(d)
  out.setMonth(out.getMonth() + n)
  return out
}

/** The first day (yyyy-mm-dd) a range covers. ALL goes back to the earliest transaction (at least 1 month). */
export function rangeStart(range: Range, now: Date, earliest?: string): string {
  switch (range) {
    case '1M': return iso(addMonths(now, -1))
    case '3M': return iso(addMonths(now, -3))
    case '6M': return iso(addMonths(now, -6))
    case 'YTD': return `${now.getFullYear()}-01-01`
    case '1Y': return iso(addMonths(now, -12))
    case 'ALL': {
      const month = iso(addMonths(now, -1))
      return earliest && earliest < month ? earliest : month
    }
  }
}

export interface NetWorthPoint {
  date: string
  net: number
}

/**
 * Net worth on `count` evenly spaced days from `start` to today, rebuilt from today's balances by undoing later
 * transactions (a transaction moves net worth by its signed amount on both asset and debt accounts; transfers between
 * your own accounts cancel out). Hidden accounts and their transactions are left out.
 */
export function netWorthSeries(accounts: Account[], transactions: Transaction[], start: string, now: Date, count = 40): NetWorthPoint[] {
  const visible = new Set<string>()
  for (const a of accounts) if (!a.hidden) { visible.add(a.id); if (a.plaidAccountId) visible.add(a.plaidAccountId) }
  const today = iso(now)
  const moves = transactions
    .filter((t) => t.accountId && visible.has(t.accountId) && t.date > start && t.date <= today)
    .map((t) => ({ date: t.date, amount: t.amount }))
    .sort((a, b) => b.date.localeCompare(a.date))
  const days: string[] = []
  const from = parse(start).getTime()
  const to = parse(today).getTime()
  const n = Math.max(2, count)
  for (let i = 0; i < n; i++) {
    const day = iso(new Date(from + ((to - from) * i) / (n - 1)))
    if (days[days.length - 1] !== day) days.push(day)
  }
  let net = netWorth(accounts).net
  let k = 0
  const out: NetWorthPoint[] = []
  for (let i = days.length - 1; i >= 0; i--) {
    while (k < moves.length && moves[k].date > days[i]) net -= moves[k++].amount
    out.push({ date: days[i], net: Math.round(net * 100) / 100 })
  }
  return out.reverse()
}

export interface CategoryChange {
  name: string
  thisMonth: number
  lastMonth: number
  /** Change vs last month (0.25 = +25%); undefined when last month had none. */
  change?: number
}

/** This month's top spending categories, each with last month's spending up to the same day of the month. */
export function categoryComparison(transactions: Transaction[], now: Date, limit = 5): CategoryChange[] {
  const month = monthKey(iso(now))
  const prev = addMonths(new Date(now.getFullYear(), now.getMonth(), 1), -1)
  const prevMonth = monthKey(iso(prev))
  const lastDay = new Date(prev.getFullYear(), prev.getMonth() + 1, 0).getDate()
  const sameDay = `${prevMonth}-${String(Math.min(now.getDate(), lastDay)).padStart(2, '0')}`
  const current = new Map<string, number>()
  const before = new Map<string, number>()
  for (const t of transactions) {
    if (t.amount >= 0 || isTransfer(t)) continue
    const key = t.category ?? 'Uncategorized'
    if (monthKey(t.date) === month) current.set(key, (current.get(key) ?? 0) - t.amount)
    else if (monthKey(t.date) === prevMonth && t.date <= sameDay) before.set(key, (before.get(key) ?? 0) - t.amount)
  }
  return [...current]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, thisMonth]) => {
      const lastMonth = before.get(name) ?? 0
      return { name, thisMonth, lastMonth, change: lastMonth > 0 ? (thisMonth - lastMonth) / lastMonth : undefined }
    })
}

export interface Week {
  moneyIn: number
  moneyOut: number
  biggest: { id: string; name: string; amount: number }[]
}

/** The last 7 days (today and the 6 before): money in and out, and the 3 biggest expenses. */
export function week(transactions: Transaction[], now: Date): Week {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
  const from = iso(start)
  const to = iso(now)
  const counted = transactions.filter((t) => t.date >= from && t.date <= to && !isTransfer(t))
  const moneyIn = counted.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const out = counted.filter((t) => t.amount < 0)
  const moneyOut = out.reduce((s, t) => s - t.amount, 0)
  const biggest = [...out].sort((a, b) => a.amount - b.amount).slice(0, 3).map((t) => ({ id: t.id, name: t.name, amount: -t.amount }))
  return { moneyIn: round(moneyIn), moneyOut: round(moneyOut), biggest }
}

const round = (v: number) => Math.round(v * 100) / 100
