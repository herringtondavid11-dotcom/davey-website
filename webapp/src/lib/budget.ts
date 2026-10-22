import type { Budget } from './tables'
import type { Transaction, Usage } from './schema'

/** Money moving between your own accounts: not income, not spending. */
export function isTransfer(t: Pick<Transaction, 'category' | 'name'>): boolean {
  return /transfer|credit card payment|payment.*thank you|autopay/i.test(`${t.category ?? ''} ${t.category ? '' : t.name}`)
}

export const monthKey = (iso: string) => iso.slice(0, 7)

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function monthLabel(month: string, style: 'long' | 'short' | 'medium' = 'long'): string {
  const [y, m] = month.split('-').map(Number)
  const opts: Intl.DateTimeFormatOptions =
    style === 'long' ? { month: 'long', year: 'numeric' } : style === 'medium' ? { month: 'short', year: 'numeric' } : { month: 'short' }
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', opts)
}

export function currentMonth(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export interface MonthSummary {
  income: number
  spending: number
  net: number
  byCategory: Map<string, number>
}

export function summarize(list: Transaction[], month: string, usage: Usage | '' = ''): MonthSummary {
  let income = 0
  let spending = 0
  const byCategory = new Map<string, number>()
  for (const t of list) {
    if (monthKey(t.date) !== month || isTransfer(t) || (usage && t.usage !== usage)) continue
    if (t.amount > 0) income += t.amount
    else {
      const spent = -t.amount
      spending += spent
      const c = t.category ?? 'Uncategorized'
      byCategory.set(c, (byCategory.get(c) ?? 0) + spent)
    }
  }
  return { income, spending, net: income - spending, byCategory }
}

export interface BudgetRow {
  category: string
  budget?: Budget
  limit: number
  spent: number
  remaining: number
  /** 0..1+ share of the budget used. */
  used: number
  over: boolean
}

export function budgetRows(budgets: Budget[], byCategory: Map<string, number>): { rows: BudgetRow[]; unbudgeted: { category: string; spent: number }[] } {
  const seen = new Set<string>()
  const rows = budgets.map((b) => {
    seen.add(b.category.toLowerCase())
    const spent = byCategory.get(b.category) ?? [...byCategory].find(([c]) => c.toLowerCase() === b.category.toLowerCase())?.[1] ?? 0
    return { category: b.category, budget: b, limit: b.amount, spent, remaining: b.amount - spent, used: b.amount > 0 ? spent / b.amount : spent > 0 ? 1 : 0, over: spent > b.amount }
  })
  rows.sort((a, b) => Number(b.over) - Number(a.over) || b.used - a.used)
  const unbudgeted = [...byCategory]
    .filter(([c]) => !seen.has(c.toLowerCase()))
    .map(([category, spent]) => ({ category, spent }))
    .sort((a, b) => b.spent - a.spent)
  return { rows, unbudgeted }
}

export interface CashFlowMonth {
  month: string
  income: number
  spending: number
  net: number
}

export function cashFlow(list: Transaction[], endMonth: string, months: number, usage: Usage | '' = ''): CashFlowMonth[] {
  const out: CashFlowMonth[] = []
  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(endMonth, -i)
    const s = summarize(list, month, usage)
    out.push({ month, income: s.income, spending: s.spending, net: s.net })
  }
  return out
}

export function averages(months: CashFlowMonth[]) {
  const withData = months.filter((m) => m.income || m.spending)
  const n = withData.length || 1
  const income = withData.reduce((s, m) => s + m.income, 0) / n
  const spending = withData.reduce((s, m) => s + m.spending, 0) / n
  return { income, spending, net: income - spending, savingsRate: income > 0 ? (income - spending) / income : 0 }
}
