// Account categories (2026-10-25): the user's own roll-up for accounts, like a spreadsheet's "Asset Location" column
// (Ops Cash, Emergency, Retirement, …). Same rules as the app's AccountCategories.swift:
// - An account's category is its `rollupCategory`; without one it rolls up under its type group (Cash, Savings, …).
// - Each category totals its balances (debts negative) and its goals (% funded across the accounts with a goal).
// - Categories are listed largest total first; ties by name.
// - The pie shows what's owned (positive balances) by category: the six largest, then "Other". Debts aren't slices.
// Amounts are cents.
import { GROUPS, goalRow, groupOf, signedCents, summary, type GoalSummary } from './accountGoals'
import type { Account } from './schema'

export const MAX_CATEGORY_LENGTH = 30

/** Offered when picking a category, after the ones already in use. */
export const SUGGESTED_CATEGORIES = [
  'Operating Cash', 'Emergency', 'Savings', 'Retirement', 'Education', 'Business', 'Real Estate', 'Taxes',
  'Debt Payoff', 'Giving', 'Entertainment',
]

export function cleanCategory(value: string | undefined): string | undefined {
  const v = value?.trim().replace(/\s+/g, ' ').slice(0, MAX_CATEGORY_LENGTH)
  return v || undefined
}

/** The account's category: its own, else its type group's title. */
export function categoryOf(a: Pick<Account, 'rollupCategory' | 'type' | 'subtype'>): string {
  return cleanCategory(a.rollupCategory) ?? GROUPS.find((g) => g.key === groupOf(a))!.title
}

export interface CategoryGroup {
  name: string
  accounts: Account[]
  /** Signed cents (debts negative). */
  total: number
  goals: GoalSummary
}

export function categoryGroups(accounts: Account[]): CategoryGroup[] {
  const byName = new Map<string, Account[]>()
  for (const a of accounts) {
    const name = categoryOf(a)
    // Case-insensitive: "retirement" and "Retirement" are one category, named as first seen.
    const key = [...byName.keys()].find((k) => k.toLowerCase() === name.toLowerCase()) ?? name
    byName.set(key, [...(byName.get(key) ?? []), a])
  }
  return [...byName.entries()]
    .map(([name, list]) => {
      const total = list.reduce((s, a) => s + signedCents(a), 0)
      return { name, accounts: list, total, goals: summary(list.map(goalRow), total) }
    })
    .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name))
}

export interface Slice {
  name: string
  cents: number
  share: number
  /** 0–5: the validated categorical slot; 'other' for the rest. */
  slot: number | 'other'
}

/** Positive totals by category for the pie: six slots, then "Other". */
export function pieSlices(groups: CategoryGroup[]): Slice[] {
  const owned = groups.map((g) => ({ name: g.name, cents: g.accounts.reduce((s, a) => s + Math.max(0, signedCents(a)), 0) }))
    .filter((g) => g.cents > 0)
    .sort((x, y) => y.cents - x.cents || x.name.localeCompare(y.name))
  const total = owned.reduce((s, g) => s + g.cents, 0)
  if (!total) return []
  const slices: Slice[] = owned.slice(0, 6).map((g, i) => ({ ...g, share: g.cents / total, slot: i }))
  const rest = owned.slice(6)
  if (rest.length) {
    const cents = rest.reduce((s, g) => s + g.cents, 0)
    slices.push({ name: 'Other', cents, share: cents / total, slot: 'other' })
  }
  return slices
}

/** Categories already used (as typed first), then the suggestions not yet used. */
export function categoryChoices(accounts: Account[]): string[] {
  const used: string[] = []
  for (const a of accounts) {
    const c = cleanCategory(a.rollupCategory)
    if (c && !used.some((u) => u.toLowerCase() === c.toLowerCase())) used.push(c)
  }
  used.sort((x, y) => x.localeCompare(y))
  return [...used, ...SUGGESTED_CATEGORIES.filter((s) => !used.some((u) => u.toLowerCase() === s.toLowerCase()))]
}
