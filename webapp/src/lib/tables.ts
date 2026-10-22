// Optional tables: features beyond accounts/transactions read these if the project has them. A missing table
// (PostgREST PGRST205 / 42P01 / 404) is reported as `available: false` so screens can explain instead of failing.
// Candidate names are tried in order and the first that exists is remembered. Assumptions: WEB-STATUS.md.
import { optNum, pick } from './schema'
import { supabase } from './supabase'

type Row = Record<string, unknown>

export const OPTIONAL_TABLES = {
  items: ['plaid_items', 'items', 'bank_connections'],
  budgets: ['budgets', 'category_budgets'],
  holdings: ['holdings', 'investment_holdings'],
  securities: ['securities'],
  households: ['households'],
  members: ['household_members'],
  invites: ['household_invites'],
  recurring: ['recurring_transactions', 'subscriptions', 'recurring'],
  profiles: ['profiles', 'user_profiles'],
} as const

export type OptionalTable = keyof typeof OPTIONAL_TABLES

export interface TableResult {
  rows: Row[]
  available: boolean
  table?: string
}

const resolved = new Map<OptionalTable, string | null>()

export function isMissingTable(error: { code?: string; message?: string } | null, status?: number): boolean {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || status === 404 || /does not exist|schema cache/i.test(error.message ?? '')
}

export async function fetchOptional(name: OptionalTable): Promise<TableResult> {
  const known = resolved.get(name)
  if (known === null) return { rows: [], available: false }
  const candidates = known ? [known] : OPTIONAL_TABLES[name]
  for (const table of candidates) {
    const { data, error, status } = await supabase.from(table).select('*')
    if (!error) {
      resolved.set(name, table)
      return { rows: (data ?? []) as Row[], available: true, table }
    }
    if (!isMissingTable(error, status)) throw error
  }
  resolved.set(name, null)
  return { rows: [], available: false }
}

export function resolvedTable(name: OptionalTable): string | undefined {
  return resolved.get(name) ?? undefined
}

/** Test hook. */
export function resetResolvedTables() {
  resolved.clear()
}

const str = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : String(v))

// ---------- Bank connections (Plaid Items) ----------
export type ItemHealth = 'ok' | 'needs_reauth' | 'error' | 'pending_expiration'
export interface BankConnection {
  id: string
  itemId?: string
  institution: string
  health: ItemHealth
  errorCode?: string
  errorMessage?: string
  lastSynced?: string
}

export function normalizeItem(row: Row): BankConnection {
  const code = str(pick(row, ['error_code', 'last_error_code', 'status_code']))
  const status = (str(pick(row, ['status', 'health', 'state'])) ?? '').toLowerCase()
  let health: ItemHealth = 'ok'
  if (code === 'ITEM_LOGIN_REQUIRED' || /login|reauth|update/.test(status)) health = 'needs_reauth'
  else if (code === 'PENDING_EXPIRATION' || /expir/.test(status)) health = 'pending_expiration'
  else if (code || /error|fail/.test(status)) health = 'error'
  return {
    id: String(pick(row, ['id'])),
    itemId: str(pick(row, ['plaid_item_id', 'item_id'])),
    institution: str(pick(row, ['institution_name', 'institution', 'name'])) ?? 'Bank',
    health,
    errorCode: code,
    errorMessage: str(pick(row, ['error_message', 'last_error_message', 'error'])),
    lastSynced: str(pick(row, ['last_synced_at', 'last_sync_at', 'transactions_synced_at', 'updated_at'])),
  }
}

// ---------- Budgets ----------
export interface Budget {
  id: string
  category: string
  amount: number
  raw: Row
}
export function normalizeBudget(row: Row): Budget {
  return {
    id: String(pick(row, ['id'])),
    category: str(pick(row, ['category', 'category_name', 'name'])) ?? 'Uncategorized',
    amount: Math.abs(optNum(pick(row, ['amount', 'limit', 'monthly_amount', 'budget'])) ?? 0),
    raw: row,
  }
}

// ---------- Investments ----------
export interface Holding {
  id: string
  accountId?: string
  name: string
  ticker?: string
  quantity: number
  price?: number
  value: number
  costBasis?: number
  type?: string
}
export function normalizeHoldings(holdings: Row[], securities: Row[]): Holding[] {
  const sec = new Map(securities.map((s) => [String(pick(s, ['security_id', 'id'])), s]))
  return holdings.map((h, i) => {
    const s = sec.get(String(pick(h, ['security_id']))) ?? {}
    const quantity = optNum(pick(h, ['quantity', 'shares'])) ?? 0
    const price = optNum(pick(h, ['institution_price', 'price', 'close_price'])) ?? optNum(pick(s, ['close_price', 'price']))
    const value = optNum(pick(h, ['institution_value', 'value', 'market_value'])) ?? (price !== undefined ? price * quantity : 0)
    return {
      id: str(pick(h, ['id'])) ?? String(i),
      accountId: str(pick(h, ['account_id'])),
      name: str(pick(h, ['name', 'security_name'])) ?? str(pick(s, ['name'])) ?? str(pick(h, ['ticker_symbol', 'ticker'])) ?? 'Holding',
      ticker: str(pick(h, ['ticker_symbol', 'ticker', 'symbol'])) ?? str(pick(s, ['ticker_symbol'])),
      quantity,
      price,
      value,
      costBasis: optNum(pick(h, ['cost_basis'])),
      type: str(pick(h, ['type', 'security_type'])) ?? str(pick(s, ['type'])),
    }
  })
}

// ---------- Household ----------
export type Role = 'owner' | 'member' | 'viewer'
export interface Member {
  id: string
  userId?: string
  name: string
  email?: string
  role: Role
  joinedAt?: string
}
export function normalizeMember(row: Row): Member {
  const r = (str(pick(row, ['role'])) ?? 'member').toLowerCase()
  return {
    id: String(pick(row, ['id', 'user_id'])),
    userId: str(pick(row, ['user_id', 'member_id'])),
    name: str(pick(row, ['display_name', 'name', 'first_name'])) ?? str(pick(row, ['email'])) ?? 'Member',
    email: str(pick(row, ['email'])),
    role: r === 'owner' || r === 'admin' ? 'owner' : r === 'viewer' || r === 'read_only' ? 'viewer' : 'member',
    joinedAt: str(pick(row, ['joined_at', 'created_at'])),
  }
}

// ---------- Recurring (server-detected, if the app stores them) ----------
export interface StoredRecurring {
  id: string
  name: string
  amount: number
  frequency: string
  nextDate?: string
  category?: string
}
export function normalizeRecurring(row: Row): StoredRecurring {
  return {
    id: String(pick(row, ['id', 'stream_id'])),
    name: str(pick(row, ['merchant_name', 'name', 'description'])) ?? 'Recurring',
    amount: Math.abs(optNum(pick(row, ['amount', 'average_amount', 'last_amount'])) ?? 0),
    frequency: (str(pick(row, ['frequency', 'cadence'])) ?? 'monthly').toLowerCase(),
    nextDate: str(pick(row, ['next_date', 'predicted_next_date', 'next_due_date']))?.slice(0, 10),
    category: str(pick(row, ['category'])),
  }
}
