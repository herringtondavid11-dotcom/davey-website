// Web edits (account nicknames and Business/Personal, transaction category/notes/Business, budgets).
// The app keeps these in its own on-device database (SwiftData + iCloud), which the web can't reach, and the server
// has no table for them yet, so the web saves them in this browser, per signed-in user. See DECISIONS.md.
import type { Usage } from './schema'

export interface AccountNote { nickname?: string; usage?: Usage }
export interface TransactionNote { category?: string; notes?: string; usage?: Usage }
export interface BudgetNote { id: string; category: string; amount: number }

export interface Annotations {
  accounts: Record<string, AccountNote>
  transactions: Record<string, TransactionNote>
  budgets: BudgetNote[]
}

const empty = (): Annotations => ({ accounts: {}, transactions: {}, budgets: [] })
let userKey = 'anon'
let cache: Annotations | null = null

const storageKey = () => `davey.web-edits.${userKey}`

export function setAnnotationUser(userId: string | undefined) {
  userKey = userId ?? 'anon'
  cache = null
}

export function annotations(): Annotations {
  if (cache) return cache
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey()) ?? 'null')
    cache = parsed && typeof parsed === 'object' ? { ...empty(), ...parsed } : empty()
  } catch {
    cache = empty()
  }
  return cache!
}

function save() {
  try {
    localStorage.setItem(storageKey(), JSON.stringify(cache ?? empty()))
  } catch {
    /* storage full or blocked: edits last for this session */
  }
}

function clean<T extends object>(o: T): T | undefined {
  const out = Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '')) as T
  return Object.keys(out).length ? out : undefined
}

export function setAccountNote(id: string, note: AccountNote) {
  const a = annotations()
  const merged = clean({ ...a.accounts[id], ...note })
  if (merged) a.accounts[id] = merged
  else delete a.accounts[id]
  save()
}

export function setTransactionNote(id: string, note: TransactionNote) {
  const a = annotations()
  const merged = clean({ ...a.transactions[id], ...note })
  if (merged) a.transactions[id] = merged
  else delete a.transactions[id]
  save()
}

export function saveBudgetNote(category: string, amount: number, id?: string): BudgetNote {
  const a = annotations()
  const existing = a.budgets.find((b) => (id ? b.id === id : b.category.toLowerCase() === category.toLowerCase()))
  if (existing) existing.amount = amount
  else a.budgets.push({ id: id ?? `web-${Date.now().toString(36)}`, category, amount })
  save()
  return existing ?? a.budgets[a.budgets.length - 1]
}

export function clearAnnotations() {
  cache = empty()
  try {
    localStorage.removeItem(storageKey())
  } catch {
    /* ignore */
  }
}

export function annotationCount(): number {
  const a = annotations()
  return Object.keys(a.accounts).length + Object.keys(a.transactions).length + a.budgets.length
}
