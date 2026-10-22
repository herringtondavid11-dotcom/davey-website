// Davey's real server data: the iPhone/Mac app keeps accounts and transactions on the device and in iCloud; the only
// copy on Supabase is `household_records` (Household Sharing: one row per record, `entity` + `payload` jsonb, RLS:
// household members only; writes through `push_household_records`, last-write-wins on `updated_at`). There are no
// `accounts` / `transactions` tables. This adapter turns those records into the row shapes `schema.ts` normalizes,
// so the screens don't change. Payload format: the app's `HouseholdSyncCodec.swift` (amounts in minor units, Davey's
// sign: negative = money out; dates ISO 8601 UTC).
import { supabase } from './supabase'

type Row = Record<string, unknown>

export interface HouseholdRecord {
  household_id: string
  entity: string
  id: string
  payload: Row
  updated_at: string
}

const PAGE = 1000
const LIABILITY_TYPES = new Set(['creditCard', 'loan', 'otherLiability'])

/** Every live (not deleted) record of an entity the signed-in user can read. */
export async function fetchRecords(entity: string): Promise<HouseholdRecord[]> {
  const all: HouseholdRecord[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('household_records')
      .select('household_id,entity,id,payload,updated_at')
      .eq('entity', entity)
      .eq('deleted', false)
      .order('id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...((data ?? []) as HouseholdRecord[]))
    if (!data || data.length < PAGE) return all
  }
}

const minor = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v / 100 : 0)
const optMinor = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v / 100 : undefined)
const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)

/** An ISO timestamp as the viewer's local calendar day (yyyy-mm-dd), the way the app shows it. */
export function localDay(iso: unknown): string | undefined {
  if (typeof iso !== 'string' || !iso) return undefined
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Davey's account type → the Plaid-style type the web screens group by. */
export function webAccountType(daveyType: unknown): string {
  switch (daveyType) {
    case 'checking':
    case 'savings':
    case 'cash':
      return 'depository'
    case 'creditCard':
      return 'credit'
    case 'loan':
    case 'otherLiability':
      return 'loan'
    case 'investment':
    case 'crypto':
      return 'investment'
    default:
      return 'other'
  }
}

export interface DaveyData {
  accounts: Row[]
  transactions: Row[]
  budgets: Row[]
  connections: Row[]
  records: Map<string, HouseholdRecord>
}

/**
 * Rows in the column names `schema.ts` and `tables.ts` read. Balances follow the app: starting balance plus every
 * transaction (a linked account's starting balance is set so the sum equals the bank's balance).
 */
export function toRows(input: {
  accounts: HouseholdRecord[]
  transactions: HouseholdRecord[]
  categories: HouseholdRecord[]
  connections: HouseholdRecord[]
  budgets: HouseholdRecord[]
}): DaveyData {
  const records = new Map<string, HouseholdRecord>()
  for (const list of Object.values(input)) for (const r of list) records.set(`${r.entity}:${r.id}`, r)
  const categoryName = new Map(input.categories.map((c) => [c.id, text(c.payload.name) ?? 'Uncategorized']))
  const connection = new Map(input.connections.map((c) => [c.id, c.payload]))
  const accountPayload = new Map(input.accounts.map((a) => [a.id, a.payload]))
  const sums = new Map<string, number>()
  for (const t of input.transactions) {
    const id = text(t.payload.accountID)
    if (id) sums.set(id, (sums.get(id) ?? 0) + (typeof t.payload.amount === 'number' ? t.payload.amount : 0))
  }
  const balanceOf = (id: string) => {
    const p = accountPayload.get(id)
    return p ? ((typeof p.startingBalance === 'number' ? p.startingBalance : 0) + (sums.get(id) ?? 0)) / 100 : undefined
  }
  const propertyValue = (id: string | undefined) => (id ? balanceOf(id) : undefined)
  const accounts = input.accounts.map((a) => {
    const p = a.payload
    const bank = connection.get(text(p.bankConnectionID) ?? '')
    const daveyBalance = (typeof p.startingBalance === 'number' ? p.startingBalance : 0) + (sums.get(a.id) ?? 0)
    // Davey keeps debts negative; the web screens use Plaid's convention (a card or loan's balance = amount owed).
    const balanceMinor = LIABILITY_TYPES.has(String(p.type)) ? -daveyBalance : daveyBalance
    return {
      id: a.id,
      plaid_account_id: text(p.externalID),
      item_id: text(bank?.itemID),
      name: text(p.name) ?? 'Account',
      official_name: text(p.officialName),
      nickname: text(p.nickname),
      mask: text(p.mask),
      type: webAccountType(p.type),
      subtype: text(p.type),
      current_balance: balanceMinor / 100,
      available_balance: optMinor(p.availableBalance),
      iso_currency_code: 'USD',
      institution_name: text(bank?.institutionName),
      is_hidden: p.isArchived === true,
      created_at: text(p.createdAt),
      is_business: p.isBusiness === true,
      credit_limit: optMinor(p.creditLimit),
      apr: typeof p.aprBasisPoints === 'number' ? p.aprBasisPoints / 100 : undefined,
      original_principal: optMinor(p.originalPrincipal),
      loan_start_date: localDay(p.loanStartDate),
      loan_term_months: typeof p.loanTermMonths === 'number' ? p.loanTermMonths : undefined,
      monthly_payment: optMinor(p.monthlyPayment),
      // Cards: the bank's next payment; loans: the monthly payment.
      minimum_payment: optMinor(p.monthlyPayment) ?? optMinor(p.nextPaymentAmount),
      // A mortgage's home is its own account in Davey (linkedPropertyID); its value feeds equity and LTV.
      property_value: propertyValue(text(p.linkedPropertyID)),
      next_payment_due_date: localDay(p.nextPaymentDueDate),
      last_synced_at: text(bank?.lastSyncedAt),
      household_id: a.household_id,
    } as Row
  })
  const transactions = input.transactions
    .map((t) => {
      const p = t.payload
      const account = accountPayload.get(text(p.accountID) ?? '')
      return {
        id: t.id,
        // The screens join transactions to accounts by the account's Plaid ID when it has one, else its own ID.
        account_id: text(account?.externalID) ?? text(p.accountID),
        date: localDay(p.date) ?? '',
        merchant_name: text(p.payee) ?? 'Transaction',
        // Plaid sign for schema.ts (AMOUNT_POSITIVE_IS_OUTFLOW): Davey stores money out as negative.
        amount: -minor(p.amount),
        category: categoryName.get(text(p.categoryID) ?? ''),
        notes: text(p.note),
        is_business: account?.isBusiness === true,
        pending: p.isPending === true,
        excluded_from_budget: p.isExcludedFromBudget === true,
        household_id: t.household_id,
      } as Row
    })
    .sort((x, y) => String(y.date).localeCompare(String(x.date)))
  const budgets = input.budgets.map((b) => ({
    id: b.id,
    category: categoryName.get(text(b.payload.categoryID) ?? '') ?? 'Uncategorized',
    amount: minor(b.payload.limit),
    month_key: b.payload.monthKey,
    household_id: b.household_id,
  }))
  const connections = input.connections.map((c) => ({
    id: c.id,
    item_id: text(c.payload.itemID),
    institution_name: text(c.payload.institutionName) ?? 'Bank',
    status: c.payload.status === 'needsReauth' ? 'login_required' : c.payload.status === 'error' ? 'error' : 'ok',
    last_synced_at: text(c.payload.lastSyncedAt),
  }))
  return { accounts, transactions, budgets, connections, records }
}

let cache: Promise<DaveyData> | null = null

/** Everything the screens read, loaded once per session (call `reloadDaveyData` after a write or a new bank). */
export function loadDaveyData(): Promise<DaveyData> {
  cache ??= (async () => {
    const [accounts, transactions, categories, connections, budgets] = await Promise.all(
      ['account', 'transaction', 'category', 'bankConnection', 'budget'].map(fetchRecords),
    )
    return toRows({ accounts, transactions, categories, connections, budgets })
  })().catch((error) => {
    cache = null
    throw error
  })
  return cache
}

export function reloadDaveyData(): Promise<DaveyData> {
  cache = null
  return loadDaveyData()
}

/**
 * Changes fields of one record and pushes it the way the app does (whole payload, `updated_at` now; the server keeps
 * the newest per record and the iPhone/Mac pick it up on their next sync).
 */
export async function pushChange(entity: string, id: string, changes: Row): Promise<void> {
  const data = await loadDaveyData()
  const record = data.records.get(`${entity}:${id}`)
  if (!record) throw new Error("This record isn't shared with your household, so it can't be changed here.")
  const payload = { ...record.payload, ...changes }
  const { data: applied, error } = await supabase.rpc('push_household_records', {
    p_household: record.household_id,
    p_records: [{ entity, id, payload, updated_at: new Date().toISOString(), deleted: false }],
  })
  if (error) throw new Error(error.code === '42501' ? 'Your household is read-only right now.' : error.message)
  if (applied === 0) throw new Error('This record was changed on another device. Reload and try again.')
  record.payload = payload
}

/** Davey's All Accounts View (Lens.allAccountsID): budgets made on the web belong to it. */
export const ALL_ACCOUNTS_LENS_ID = 'c1ec84cb-2a5b-465a-88dc-943539790645'

/** Davey's month key (yyyymm) for a date. */
export const monthKey = (d = new Date()) => d.getFullYear() * 100 + d.getMonth() + 1

/**
 * Sets this month's budget for a category: changes the existing budget record, or creates one in All Accounts the way
 * the app does (BudgetService: one budget per category per month and View).
 */
export async function saveMonthlyBudget(categoryName: string, amount: number, existingId?: string): Promise<Row> {
  const data = await loadDaveyData()
  const limit = Math.round(Math.abs(amount) * 100)
  if (existingId && data.records.has(`budget:${existingId}`)) {
    await pushChange('budget', existingId, { limit })
    const row = data.budgets.find((b) => b.id === existingId)
    if (row) row.amount = limit / 100
    return row ?? { id: existingId, category: categoryName, amount: limit / 100 }
  }
  const category = categoryID(data, categoryName)
  if (!category) throw new Error(`"${categoryName}" isn't one of your Davey categories.`)
  const household = [...data.records.values()][0]?.household_id
  if (!household) throw new Error('Budgets are shared through your household. Turn on Household Sharing in the Davey app.')
  const id = crypto.randomUUID()
  const payload = { categoryID: category, lensID: ALL_ACCOUNTS_LENS_ID, limit, monthKey: monthKey() }
  const { error } = await supabase.rpc('push_household_records', {
    p_household: household,
    p_records: [{ entity: 'budget', id, payload, updated_at: new Date().toISOString(), deleted: false }],
  })
  if (error) throw new Error(error.code === '42501' ? 'Your household is read-only right now.' : error.message)
  data.records.set(`budget:${id}`, { household_id: household, entity: 'budget', id, payload, updated_at: new Date().toISOString() })
  const row = { id, category: categoryName, amount: limit / 100, month_key: payload.monthKey, household_id: household }
  data.budgets.push(row)
  return row
}

/** The category record ID for a category name, for writing a transaction's category. */
export function categoryID(data: DaveyData, name: string): string | undefined {
  for (const r of data.records.values()) if (r.entity === 'category' && r.payload.name === name) return r.id
  return undefined
}

export function resetDaveyData() {
  cache = null
}
