// Goal progress for the Accounts tab: the same rules and test values as the app's AccountGoals.swift.
// - Savings and investment goals: % funded = balance ÷ goal (can pass 100%).
// - Debt goals (cards, loans): a payoff goal. % paid off = paid down since the goal was set ÷ (starting balance −
//   target balance; the target is usually 0).
// - Accounts without a goal are left out of the totals.
// Amounts here are cents, like the app's minor units, so both platforms round the same way.
import { isLiability } from './finance'
import type { Account } from './schema'

export interface GoalRow {
  /** Asset: the balance. Debt: what's owed (positive). */
  amount: number
  /** Asset: the goal balance. Debt: the target balance still owed (0 = paid off). */
  goal?: number
  /** Debt only: what was owed when the goal was set. */
  start?: number
  isDebt: boolean
}

/** Toward the goal: the balance, or for a debt what's been paid down. */
export function progress(r: GoalRow): number {
  if (r.goal === undefined) return 0
  return r.isDebt ? Math.max(0, (r.start ?? r.amount) - r.amount) : Math.max(0, r.amount)
}

/** What the goal needs in total: the goal balance, or for a debt the amount to pay down. */
export function needed(r: GoalRow): number {
  if (r.goal === undefined) return 0
  return r.isDebt ? Math.max(0, (r.start ?? r.amount) - r.goal) : Math.max(0, r.goal)
}

/** % funded (or % paid off) as a fraction; undefined without a goal. */
export function fraction(r: GoalRow): number | undefined {
  if (r.goal === undefined) return undefined
  const n = needed(r)
  if (n === 0) return r.isDebt ? (r.amount <= r.goal ? 1 : 0) : undefined
  return progress(r) / n
}

/** The bar's color band: under 50% Slate, 50–99% Gold, 100%+ positive green. */
export function band(f: number): 'low' | 'mid' | 'done' {
  return f >= 1 ? 'done' : f >= 0.5 ? 'mid' : 'low'
}

export interface GoalSummary {
  /** Every account in view (debts negative), cents. */
  totalBalance: number
  totalGoals: number
  fraction?: number
  goalCount: number
}

export function summary(rows: GoalRow[], netBalance: number): GoalSummary {
  const withGoals = rows.filter((r) => r.goal !== undefined)
  const need = withGoals.reduce((s, r) => s + needed(r), 0)
  const prog = withGoals.reduce((s, r) => s + progress(r), 0)
  return {
    totalBalance: netBalance,
    totalGoals: need,
    fraction: need > 0 ? prog / need : withGoals.length ? 1 : undefined,
    goalCount: withGoals.length,
  }
}

const cents = (dollars: number) => Math.round(dollars * 100)

/** An account's goal row (web balances for cards and loans are already the amount owed). */
export function goalRow(a: Account): GoalRow {
  const isDebt = isLiability(a)
  return {
    amount: cents(isDebt ? Math.abs(a.balance) : a.balance),
    goal: a.goalTarget === undefined ? undefined : cents(a.goalTarget),
    start: a.goalStart === undefined ? undefined : cents(a.goalStart),
    isDebt,
  }
}

/** Signed cents (debts negative) for the header's total. */
export function signedCents(a: Account): number {
  return cents(isLiability(a) ? -Math.abs(a.balance) : a.balance)
}

export type AccountGroup = 'cash' | 'savings' | 'credit' | 'loans' | 'investments' | 'other'
export const GROUPS: { key: AccountGroup; title: string }[] = [
  { key: 'cash', title: 'Cash' },
  { key: 'savings', title: 'Savings' },
  { key: 'credit', title: 'Credit Cards' },
  { key: 'loans', title: 'Loans & Mortgages' },
  { key: 'investments', title: 'Investments' },
  { key: 'other', title: 'Other' },
]

/** The app's grouping, from Davey's account type (kept as `subtype`), falling back to the web type. */
export function groupOf(a: Pick<Account, 'type' | 'subtype'>): AccountGroup {
  switch (a.subtype) {
    case 'checking':
    case 'cash':
      return 'cash'
    case 'savings':
      return 'savings'
    case 'creditCard':
      return 'credit'
    case 'loan':
    case 'otherLiability':
      return 'loans'
    case 'investment':
    case 'crypto':
      return 'investments'
  }
  switch (a.type) {
    case 'depository':
      return 'cash'
    case 'credit':
      return 'credit'
    case 'loan':
      return 'loans'
    case 'investment':
    case 'brokerage':
      return 'investments'
    default:
      return 'other'
  }
}

export type GoalSort = 'funded' | 'balance' | 'name'

export function sortAccounts(list: Account[], sort: GoalSort, name: (a: Account) => string): Account[] {
  const copy = [...list]
  if (sort === 'name') return copy.sort((a, b) => name(a).localeCompare(name(b), undefined, { sensitivity: 'base' }))
  if (sort === 'balance') return copy.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  // With a goal first, by % funded (highest first); then the rest by balance.
  return copy.sort((a, b) => {
    const x = fraction(goalRow(a))
    const y = fraction(goalRow(b))
    if (x !== undefined && y !== undefined) return y - x
    if (x !== undefined) return -1
    if (y !== undefined) return 1
    return Math.abs(b.balance) - Math.abs(a.balance)
  })
}
