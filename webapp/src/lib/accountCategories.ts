// Account categories, round 2 (2026-10-25). The same rules as the app's AccountCategories.swift, checked by the same
// fixture (account-categories.fixture.json in both repos):
// - Built-in categories have fixed IDs, so every device and the web agree without creating copies. A household record
//   (entity "accountCategory", same ID) overrides a built-in's name, colour, order or removes it (`removed: true`);
//   records with new IDs are the household's own categories.
// - An account's category is `accountCategoryID` when that category exists; else its round-1 text (`rollupCategory`)
//   when a category has that name; else the one suggested from its type ("automatic", always overridable).
// - Removing a category moves its accounts to the category picked in the prompt, or back to automatic.
// Amounts are cents.
import { goalRow, signedCents, summary, type GoalSummary } from './accountGoals'
import type { Account } from './schema'

export const MAX_NAME = 30

/** Colour names stored in records; the app maps the same names (ChartStyle + Theme). The first six are the validated chart slots. */
export const COLORS = ['blue', 'ochre', 'sage', 'clay', 'teal', 'olive', 'slate', 'gold', 'sand', 'terracotta'] as const
export type ColorName = (typeof COLORS)[number]

const id = (n: number) => `acc0ca7e-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Built-ins: the defaults plus the categories from David's sheet, in this order. `key` is what types suggest. */
export const BUILT_IN: { id: string; name: string; color: ColorName; key?: Suggestion }[] = [
  // What people own gets its own colour where possible (they're the chart's slices); debts share the warmer ones.
  { id: id(1), name: 'Checking', color: 'blue', key: 'checking' },
  { id: id(2), name: 'Savings', color: 'sage', key: 'savings' },
  { id: id(3), name: 'Ops Cash', color: 'teal' },
  { id: id(4), name: 'Emergency Fund', color: 'ochre' },
  { id: id(5), name: 'Credit Cards', color: 'clay', key: 'credit' },
  { id: id(6), name: 'Debt Payoff', color: 'terracotta' },
  { id: id(7), name: 'Investments', color: 'olive', key: 'investments' },
  { id: id(8), name: 'Retirement', color: 'gold', key: 'retirement' },
  { id: id(9), name: 'Mortgage', color: 'slate', key: 'mortgage' },
  { id: id(10), name: 'Loans', color: 'terracotta', key: 'loans' },
  { id: id(11), name: 'Real Estate/Rental', color: 'sand', key: 'realEstate' },
  { id: id(12), name: 'Business', color: 'clay' },
  { id: id(13), name: 'Counseling', color: 'slate' },
  { id: id(14), name: 'Entertainment', color: 'blue' },
  { id: id(15), name: 'Giving', color: 'teal' },
  { id: id(16), name: 'Other', color: 'slate', key: 'other' },
]

export type Suggestion = 'checking' | 'savings' | 'credit' | 'investments' | 'retirement' | 'mortgage' | 'loans' | 'realEstate' | 'other'

export interface AccountCategory {
  id: string
  name: string
  color: ColorName
  sortOrder: number
  builtIn: boolean
}

export interface CategoryRecord {
  id: string
  payload: Record<string, unknown>
}

export function cleanName(value: string | undefined | null): string | undefined {
  const v = (value ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME)
  return v || undefined
}

const colorOf = (v: unknown, fallback: ColorName): ColorName => (COLORS as readonly string[]).includes(String(v)) ? (v as ColorName) : fallback

/** The household's categories: built-ins merged with its records, removed ones left out, by sort order then name. */
export function effectiveCategories(records: CategoryRecord[]): AccountCategory[] {
  const byId = new Map(records.map((r) => [r.id.toLowerCase(), r.payload]))
  const out: AccountCategory[] = []
  BUILT_IN.forEach((b, i) => {
    const p = byId.get(b.id)
    if (p?.removed === true) return
    out.push({ id: b.id, name: cleanName(p?.name as string) ?? b.name, color: colorOf(p?.colorName, b.color), sortOrder: typeof p?.sortOrder === 'number' ? p.sortOrder : i * 10, builtIn: true })
  })
  for (const r of records) {
    if (BUILT_IN.some((b) => b.id === r.id.toLowerCase()) || r.payload.removed === true) continue
    const name = cleanName(r.payload.name as string)
    if (!name) continue
    out.push({ id: r.id.toLowerCase(), name, color: colorOf(r.payload.colorName, 'slate'), sortOrder: typeof r.payload.sortOrder === 'number' ? r.payload.sortOrder : 10_000, builtIn: false })
  }
  return out.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
}

/** What an account's type says it is (Plaid type/subtype as Davey stores it, plus its names for retirement plans). */
export function suggestion(a: { daveyType?: string; type?: string; subtype?: string; name?: string; officialName?: string; loanKind?: string }): Suggestion {
  const t = a.daveyType ?? a.subtype ?? a.type ?? ''
  const names = `${a.name ?? ''} ${a.officialName ?? ''}`
  switch (t) {
    case 'checking': case 'cash': case 'depository': return 'checking'
    case 'savings': return 'savings'
    case 'creditCard': case 'credit': return 'credit'
    case 'investment': case 'crypto': case 'brokerage':
      return /\b(ira|roth|401\s?k|403\s?b|457|sep|simple ira|tsp|pension|retire\w*)\b/i.test(names) ? 'retirement' : 'investments'
    case 'loan': case 'otherLiability':
      return a.loanKind === 'mortgage' || /\b(mortgage|heloc|home equity|home loan)\b/i.test(names) ? 'mortgage' : 'loans'
    case 'property': return 'realEstate'
    default: return 'other'
  }
}

/** The category an account rolls up under, and whether it was picked (false = automatic). */
export function categoryFor(
  a: { accountCategoryID?: string; rollupCategory?: string; daveyType?: string; type?: string; subtype?: string; name?: string; officialName?: string; loanKind?: string },
  categories: AccountCategory[],
): { category?: AccountCategory; picked: boolean } {
  const byId = a.accountCategoryID ? categories.find((c) => c.id === a.accountCategoryID!.toLowerCase()) : undefined
  if (byId) return { category: byId, picked: true }
  const legacy = cleanName(a.rollupCategory)
  const byName = legacy ? categories.find((c) => c.name.toLowerCase() === legacy.toLowerCase()) : undefined
  if (byName) return { category: byName, picked: true }
  const key = suggestion(a)
  const builtIn = BUILT_IN.find((b) => b.key === key)
  const suggested = builtIn && categories.find((c) => c.id === builtIn.id)
  return { category: suggested ?? categories.find((c) => c.id === BUILT_IN.at(-1)!.id), picked: false }
}

export const UNCATEGORIZED = 'Uncategorized'

// ---------- Editing (each returns the records to push) ----------

export interface CategoryChange { id: string; payload: Record<string, unknown> }

function recordFor(c: AccountCategory, records: CategoryRecord[], changes: Record<string, unknown>): CategoryChange {
  const existing = records.find((r) => r.id.toLowerCase() === c.id)?.payload ?? {}
  return { id: c.id, payload: { name: c.name, colorName: c.color, sortOrder: c.sortOrder, removed: false, createdAt: existing.createdAt ?? new Date().toISOString(), ...existing, ...changes } }
}

export function addCategory(name: string, color: ColorName, categories: AccountCategory[], newId: () => string = () => crypto.randomUUID()): CategoryChange {
  const clean = cleanName(name)
  if (!clean) throw new Error('Give the category a name.')
  if (categories.some((c) => c.name.toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" is already a category.`)
  const last = categories.reduce((m, c) => Math.max(m, c.sortOrder), 0)
  return { id: newId(), payload: { name: clean, colorName: color, sortOrder: last + 10, removed: false, createdAt: new Date().toISOString() } }
}

export function renameCategory(c: AccountCategory, name: string, categories: AccountCategory[], records: CategoryRecord[]): CategoryChange {
  const clean = cleanName(name)
  if (!clean) throw new Error('Give the category a name.')
  if (categories.some((o) => o.id !== c.id && o.name.toLowerCase() === clean.toLowerCase())) throw new Error(`"${clean}" is already a category.`)
  return recordFor(c, records, { name: clean })
}

export function recolorCategory(c: AccountCategory, color: ColorName, records: CategoryRecord[]): CategoryChange {
  return recordFor(c, records, { colorName: color })
}

/** New sort orders after moving one category up (-1) or down (+1): every category gets a record with its position. */
export function moveCategory(c: AccountCategory, by: -1 | 1, categories: AccountCategory[], records: CategoryRecord[]): CategoryChange[] {
  const list = [...categories]
  const from = list.findIndex((x) => x.id === c.id)
  const to = from + by
  if (from < 0 || to < 0 || to >= list.length) return []
  ;[list[from], list[to]] = [list[to], list[from]]
  return list.map((x, i) => ({ x, i })).filter(({ x, i }) => x.sortOrder !== i * 10).map(({ x, i }) => recordFor(x, records, { sortOrder: i * 10 }))
}

/** Removes a category: its record says removed, and each account in it moves to `reassignTo` (undefined = automatic). */
export function removeCategory(
  c: AccountCategory, reassignTo: string | undefined, accounts: { id: string; accountCategoryID?: string; rollupCategory?: string }[],
  records: CategoryRecord[],
): { category: CategoryChange; accounts: { id: string; accountCategoryID: string | null }[] } {
  const moved = accounts.filter((a) => a.accountCategoryID?.toLowerCase() === c.id || (!a.accountCategoryID && cleanName(a.rollupCategory)?.toLowerCase() === c.name.toLowerCase()))
  return {
    category: recordFor(c, records, { removed: true }),
    accounts: moved.map((a) => ({ id: a.id, accountCategoryID: reassignTo ?? null })),
  }
}

// ---------- The Accounts tab ----------

export type GroupBy = 'category' | 'bank' | 'none'
export type SortBy = 'balance' | 'name' | 'bank' | 'funded' | 'updated'

export interface Row {
  account: Account
  bank: string
  category?: AccountCategory
  picked: boolean
}

export function rowsFor(accounts: Account[], categories: AccountCategory[]): Row[] {
  return accounts.map((a) => {
    const { category, picked } = categoryFor({ accountCategoryID: a.accountCategoryID, rollupCategory: a.rollupCategory, daveyType: a.subtype, type: a.type, name: a.name, officialName: a.officialName, loanKind: a.loanKind }, categories)
    return { account: a, bank: a.institution ?? (a.plaidAccountId ? 'Bank' : 'Manual'), category, picked }
  })
}

export function matches(r: Row, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [r.bank, r.account.nickname, r.account.name, r.account.mask, r.category?.name ?? UNCATEGORIZED].some((v) => v?.toLowerCase().includes(q))
}

export function filterRows(rows: Row[], f: { query?: string; categories?: string[]; banks?: string[] }): Row[] {
  return rows.filter((r) => matches(r, f.query ?? '')
    && (!f.categories?.length || f.categories.includes(r.category?.id ?? UNCATEGORIZED))
    && (!f.banks?.length || f.banks.includes(r.bank)))
}

const displayName = (a: Account) => a.nickname?.trim() || a.name

export function sortRows(rows: Row[], by: SortBy, dir: 1 | -1 = 1): Row[] {
  const cmp = (x: Row, y: Row): number => {
    switch (by) {
      case 'name': return displayName(x.account).localeCompare(displayName(y.account), undefined, { sensitivity: 'base' })
      case 'bank': return x.bank.localeCompare(y.bank, undefined, { sensitivity: 'base' }) || displayName(x.account).localeCompare(displayName(y.account))
      case 'updated': return (Date.parse(y.account.lastSynced ?? y.account.createdAt ?? '') || 0) - (Date.parse(x.account.lastSynced ?? x.account.createdAt ?? '') || 0)
      case 'funded': {
        const fx = fundedOf(x.account), fy = fundedOf(y.account)
        if (fx !== undefined && fy !== undefined) return fy - fx
        if (fx !== undefined) return -1
        if (fy !== undefined) return 1
        return Math.abs(signedCents(y.account)) - Math.abs(signedCents(x.account))
      }
      default: return Math.abs(signedCents(y.account)) - Math.abs(signedCents(x.account))
    }
  }
  return [...rows].sort((x, y) => dir * cmp(x, y) || displayName(x.account).localeCompare(displayName(y.account)))
}

function fundedOf(a: Account): number | undefined {
  return summary([goalRow(a)], 0).goalCount ? summary([goalRow(a)], 0).fraction : undefined
}

export interface Section {
  key: string
  title: string
  category?: AccountCategory
  rows: Row[]
  /** Signed cents. */
  total: number
  goals: GoalSummary
}

export function sections(rows: Row[], by: GroupBy, categories: AccountCategory[]): Section[] {
  const make = (key: string, title: string, list: Row[], category?: AccountCategory): Section => {
    const total = list.reduce((s, r) => s + signedCents(r.account), 0)
    return { key, title, category, rows: list, total, goals: summary(list.map((r) => goalRow(r.account)), total) }
  }
  if (by === 'none') return rows.length ? [make('all', 'All accounts', rows)] : []
  if (by === 'bank') {
    const banks = [...new Set(rows.map((r) => r.bank))].sort((a, b) => a.localeCompare(b))
    return banks.map((b) => make(`bank:${b}`, b, rows.filter((r) => r.bank === b)))
  }
  // Categories in their own order (Settings), then accounts with none.
  const out = categories.map((c) => make(c.id, c.name, rows.filter((r) => r.category?.id === c.id), c)).filter((s) => s.rows.length)
  const none = rows.filter((r) => !r.category)
  if (none.length) out.push(make(UNCATEGORIZED, UNCATEGORIZED, none))
  return out
}

export interface CategoryTotal {
  id: string
  name: string
  color: ColorName
  /** Signed cents. */
  total: number
  /**
   * Of its side: an asset category's share of everything owned, a debt category's share of everything owed. Always
   * 0…1, so a negative net worth can't flip the signs (a share of net worth made the mortgage +370% and savings −86%).
   */
  share?: number
  count: number
  funded?: number
}

/** The chart's rows: every category with accounts, in category order, with its share of assets or of debts. */
export function categoryTotals(rows: Row[], categories: AccountCategory[]): CategoryTotal[] {
  const list = sections(rows, 'category', categories)
  const owned = list.reduce((sum, s) => sum + Math.max(s.total, 0), 0)
  const owed = list.reduce((sum, s) => sum + Math.max(-s.total, 0), 0)
  return list.map((s) => ({
    id: s.category?.id ?? UNCATEGORIZED,
    name: s.title,
    color: s.category?.color ?? 'slate',
    total: s.total,
    share: s.total > 0 ? (owned ? s.total / owned : undefined) : s.total < 0 ? (owed ? -s.total / owed : undefined) : undefined,
    count: s.rows.length,
    funded: s.goals.fraction,
  }))
}

/** Slices: what's owned (positive totals) per category, as shares of everything owned. Debts aren't slices. */
export function ownedSlices(totals: CategoryTotal[]): (CategoryTotal & { share: number })[] {
  const owned = totals.filter((t) => t.total > 0)
  const sum = owned.reduce((s, t) => s + t.total, 0)
  return sum ? owned.map((t) => ({ ...t, share: t.total / sum })) : []
}
