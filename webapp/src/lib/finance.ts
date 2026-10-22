import type { Account, Transaction, Usage } from './schema'

export const LIABILITY_TYPES = new Set(['credit', 'loan'])

export function isLiability(a: Pick<Account, 'type'>): boolean {
  return LIABILITY_TYPES.has(a.type)
}

/** Plaid reports liabilities as positive amounts owed. */
export function netWorth(accounts: Account[]) {
  let assets = 0
  let liabilities = 0
  for (const a of accounts) {
    if (a.hidden) continue
    if (isLiability(a)) liabilities += Math.abs(a.balance)
    else assets += a.balance
  }
  return { assets, liabilities, net: assets - liabilities }
}

export const TYPE_ORDER = ['depository', 'credit', 'investment', 'brokerage', 'loan', 'other']

export function groupAccounts(accounts: Account[]): [string, Account[]][] {
  const groups = new Map<string, Account[]>()
  for (const a of accounts) {
    if (a.hidden) continue
    const list = groups.get(a.type) ?? []
    list.push(a)
    groups.set(a.type, list)
  }
  const rank = (t: string) => (TYPE_ORDER.indexOf(t) === -1 ? 99 : TYPE_ORDER.indexOf(t))
  return [...groups.entries()].sort((x, y) => rank(x[0]) - rank(y[0]))
}

export interface TransactionFilter {
  search: string
  accountId: string // '' = all
  category: string // '' = all
  usage: Usage | ''
  from: string // yyyy-mm-dd or ''
  to: string
  direction: 'in' | 'out' | ''
}

export const EMPTY_FILTER: TransactionFilter = {
  search: '',
  accountId: '',
  category: '',
  usage: '',
  from: '',
  to: '',
  direction: '',
}

export function filterTransactions(list: Transaction[], f: TransactionFilter, accountNames: Map<string, string> = new Map()) {
  const q = f.search.trim().toLowerCase()
  return list.filter((t) => {
    if (f.accountId && t.accountId !== f.accountId) return false
    if (f.category && (t.category ?? 'Uncategorized') !== f.category) return false
    if (f.usage && t.usage !== f.usage) return false
    if (f.from && t.date < f.from) return false
    if (f.to && t.date > f.to) return false
    if (f.direction === 'in' && t.amount <= 0) return false
    if (f.direction === 'out' && t.amount >= 0) return false
    if (q) {
      const hay = [t.name, t.originalName, t.category, t.notes, t.accountId && accountNames.get(t.accountId), Math.abs(t.amount).toFixed(2)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
}

export const DEFAULT_CATEGORIES = [
  'Bills & Utilities',
  'Business Expenses',
  'Dining',
  'Education',
  'Entertainment',
  'Fees',
  'Gas & Transport',
  'Gifts & Donations',
  'Groceries',
  'Health',
  'Home',
  'Income',
  'Insurance',
  'Kids',
  'Personal Care',
  'Pets',
  'Shopping',
  'Subscriptions',
  'Taxes',
  'Transfer',
  'Travel',
  'Uncategorized',
]

export function categoryOptions(list: Transaction[]): string[] {
  const set = new Set(DEFAULT_CATEGORIES)
  for (const t of list) if (t.category) set.add(t.category)
  return [...set].sort((a, b) => a.localeCompare(b))
}
