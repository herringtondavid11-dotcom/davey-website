// The iOS app's schema isn't visible from this repo, so rows are read with select=* and normalized here.
// Each field lists the column names tried in order; writes go to whichever candidate column the row already has
// (falling back to the first). Assumptions are documented in WEB-PHASE1.md. Change names here, nowhere else.
import { AMOUNT_POSITIVE_IS_OUTFLOW } from '../config'

export const TABLES = { accounts: 'accounts', transactions: 'transactions' } as const

type Row = Record<string, unknown>

export const ACCOUNT_COLUMNS = {
  id: ['id'],
  plaidAccountId: ['plaid_account_id', 'account_id'],
  itemId: ['plaid_item_id', 'item_id'],
  name: ['name', 'official_name'],
  officialName: ['official_name'],
  nickname: ['nickname', 'display_name', 'custom_name'],
  mask: ['mask', 'last4', 'last_four'],
  type: ['type', 'account_type'],
  subtype: ['subtype', 'account_subtype'],
  balance: ['current_balance', 'balance_current', 'balance', 'current'],
  available: ['available_balance', 'balance_available', 'available'],
  currency: ['iso_currency_code', 'currency'],
  institution: ['institution_name', 'institution'],
  hidden: ['is_hidden', 'hidden'],
  createdAt: ['created_at'],
} as const

export const TRANSACTION_COLUMNS = {
  id: ['id'],
  accountId: ['account_id'],
  date: ['date', 'authorized_date', 'posted_at'],
  name: ['merchant_name', 'name', 'description'],
  originalName: ['name', 'description', 'original_description'],
  amount: ['amount'],
  category: ['category', 'user_category', 'category_name', 'personal_finance_category'],
  notes: ['notes', 'note', 'memo'],
  business: ['is_business', 'business', 'usage', 'classification'],
  pending: ['pending'],
  currency: ['iso_currency_code', 'currency'],
} as const

export function pick(row: Row, candidates: readonly string[]): unknown {
  for (const key of candidates) if (row[key] !== undefined && row[key] !== null) return row[key]
  return undefined
}

/** The column to write a field to: the first candidate present on the row, else the first candidate. */
export function writeColumn(row: Row | undefined, candidates: readonly string[]): string {
  if (row) for (const key of candidates) if (key in row) return key
  return candidates[0]
}

const str = (v: unknown): string | undefined => (v === undefined || v === null || v === '' ? undefined : String(v))
const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : 0
}

export interface Account {
  id: string
  plaidAccountId?: string
  itemId?: string
  name: string
  nickname?: string
  mask?: string
  type: string
  subtype?: string
  balance: number
  available?: number
  currency: string
  institution?: string
  hidden: boolean
  createdAt?: string
  raw: Row
}

export type Usage = 'business' | 'personal'

export interface Transaction {
  id: string
  accountId?: string
  date: string
  name: string
  originalName?: string
  /** Signed from the user's point of view: negative = money out. */
  amount: number
  category?: string
  notes?: string
  usage: Usage
  pending: boolean
  currency: string
  raw: Row
}

function categoryText(v: unknown): string | undefined {
  if (Array.isArray(v)) return str(v[v.length - 1])
  if (v && typeof v === 'object') {
    const o = v as Row
    return str(o.detailed ?? o.primary)?.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())
  }
  return str(v)
}

export function normalizeAccount(row: Row): Account {
  const c = ACCOUNT_COLUMNS
  return {
    id: String(pick(row, c.id)),
    plaidAccountId: str(pick(row, c.plaidAccountId)),
    itemId: str(pick(row, c.itemId)),
    name: str(pick(row, c.name)) ?? 'Account',
    nickname: str(pick(row, c.nickname)),
    mask: str(pick(row, c.mask)),
    type: (str(pick(row, c.type)) ?? 'other').toLowerCase(),
    subtype: str(pick(row, c.subtype)),
    balance: num(pick(row, c.balance)),
    available: pick(row, c.available) === undefined ? undefined : num(pick(row, c.available)),
    currency: str(pick(row, c.currency)) ?? 'USD',
    institution: str(pick(row, c.institution)),
    hidden: pick(row, c.hidden) === true,
    createdAt: str(pick(row, c.createdAt)),
    raw: row,
  }
}

export function usageFromRaw(v: unknown): Usage {
  if (v === true) return 'business'
  if (typeof v === 'string' && v.toLowerCase() === 'business') return 'business'
  return 'personal'
}

/** Value to store for a usage, matching the column's existing type (boolean flag or text). */
export function usageToRaw(usage: Usage, column: string, row?: Row): boolean | string {
  const existing = row?.[column]
  if (typeof existing === 'string' || column === 'usage' || column === 'classification') return usage
  return usage === 'business'
}

export function normalizeTransaction(row: Row): Transaction {
  const c = TRANSACTION_COLUMNS
  const amount = num(pick(row, c.amount))
  return {
    id: String(pick(row, c.id)),
    accountId: str(pick(row, c.accountId)),
    date: (str(pick(row, c.date)) ?? '').slice(0, 10),
    name: str(pick(row, c.name)) ?? 'Transaction',
    originalName: str(pick(row, c.originalName)),
    amount: AMOUNT_POSITIVE_IS_OUTFLOW ? -amount : amount,
    category: categoryText(pick(row, c.category)),
    notes: str(pick(row, c.notes)),
    usage: usageFromRaw(pick(row, c.business)),
    pending: pick(row, c.pending) === true,
    currency: str(pick(row, c.currency)) ?? 'USD',
    raw: row,
  }
}
