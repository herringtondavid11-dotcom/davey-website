// A bank connected on the web, imported the way the Davey app imports one (PlaidImporter.swift), into the household's
// shared records. The app keeps its data on the device and in iCloud and only imports banks it connected itself, so
// without this a web connection would be invisible everywhere. Through Household Sharing the iPhone and Mac receive
// the bank, its accounts and transactions, and the Plaid cursor (they keep syncing it from there).
import { supabase } from './supabase'
import type { DaveyData } from './serverData'

type Row = Record<string, unknown>

export interface AppAccount {
  account_id: string
  name: string
  official_name?: string | null
  mask?: string | null
  type: string
  subtype?: string | null
  current_balance_cents: number | null
  available_balance_cents: number | null
  limit_cents?: number | null
}

export interface AppTransaction {
  transaction_id: string
  account_id: string
  amount_cents: number
  date: string
  name: string
  pending: boolean
  category_primary?: string | null
  category_detailed?: string | null
}

export interface SyncPage {
  added: AppTransaction[]
  modified: AppTransaction[]
  removed: string[]
  accounts: AppAccount[]
  next_cursor: string | null
  has_more: boolean
}

// PlaidCategoryMapper.swift: detailed codes win over primary ones; anything else stays uncategorized.
const BY_DETAILED: Record<string, string> = {
  INCOME_WAGES: 'Paycheck',
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: 'Credit Card Payment',
  LOAN_PAYMENTS_MORTGAGE_PAYMENT: 'Rent & Mortgage',
  RENT_AND_UTILITIES_RENT: 'Rent & Mortgage',
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: 'Utilities',
  RENT_AND_UTILITIES_WATER: 'Utilities',
  RENT_AND_UTILITIES_SEWAGE_AND_WASTE_MANAGEMENT: 'Utilities',
  RENT_AND_UTILITIES_OTHER_UTILITIES: 'Utilities',
  RENT_AND_UTILITIES_TELEPHONE: 'Internet & Phone',
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: 'Internet & Phone',
  FOOD_AND_DRINK_GROCERIES: 'Groceries',
  TRANSPORTATION_GAS: 'Gas',
  TRANSPORTATION_PUBLIC_TRANSIT: 'Transit & Parking',
  TRANSPORTATION_PARKING: 'Transit & Parking',
  TRANSPORTATION_TOLLS: 'Transit & Parking',
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: 'Transit & Parking',
  PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS: 'Fitness',
  GOVERNMENT_AND_NON_PROFIT_DONATIONS: 'Gifts & Donations',
  GENERAL_MERCHANDISE_GIFTS_AND_NOVELTIES: 'Gifts & Donations',
}
const BY_PRIMARY: Record<string, string> = {
  INCOME: 'Other Income',
  TRANSFER_IN: 'Transfer',
  TRANSFER_OUT: 'Transfer',
  FOOD_AND_DRINK: 'Dining Out',
  GENERAL_MERCHANDISE: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  MEDICAL: 'Medical',
  PERSONAL_CARE: 'Personal Care',
}

export function defaultCategoryName(primary?: string | null, detailed?: string | null): string | undefined {
  return (detailed ? BY_DETAILED[detailed] : undefined) ?? (primary ? BY_PRIMARY[primary] : undefined)
}

/** AccountType.fromPlaid (Account.swift). */
export function daveyAccountType(type: string, subtype?: string | null): string {
  const t = type.toLowerCase()
  const s = subtype?.toLowerCase()
  if (t === 'credit') return 'creditCard'
  if (t === 'investment' || t === 'brokerage') return 'investment'
  if (t === 'loan') return 'loan'
  if (t === 'depository' && (s === 'savings' || s === 'money market' || s === 'cd' || s === 'hsa')) return 'savings'
  return 'checking'
}

const isLiability = (daveyType: string) => daveyType === 'creditCard' || daveyType === 'loan' || daveyType === 'otherLiability'

/** Plaid's calendar day (yyyy-mm-dd) as local midnight, the way PlaidImporter.date(from:) stores it. */
export function plaidDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1).toISOString()
}

export interface ImportRecord {
  entity: 'bankConnection' | 'account' | 'transaction'
  id: string
  payload: Row
}

/**
 * Records for a newly connected bank: one bankConnection, its accounts (balance = the bank's, via the starting
 * balance) and its transactions (Davey sign: money out negative), categorized by the household's default categories.
 */
export function importRecords(opts: {
  itemId: string
  institutionName: string
  institutionId?: string
  pages: SyncPage[]
  categoryIdByName: Map<string, string>
  now?: Date
  newId?: () => string
}): ImportRecord[] {
  const now = (opts.now ?? new Date()).toISOString()
  const newId = opts.newId ?? (() => crypto.randomUUID())
  const removed = new Set(opts.pages.flatMap((p) => p.removed))
  const txById = new Map<string, AppTransaction>()
  for (const page of opts.pages) for (const t of [...page.added, ...page.modified]) txById.set(t.transaction_id, t)
  for (const id of removed) txById.delete(id)
  const accountsById = new Map<string, AppAccount>()
  for (const page of opts.pages) for (const a of page.accounts) accountsById.set(a.account_id, a)
  const cursor = [...opts.pages].reverse().find((p) => p.next_cursor)?.next_cursor ?? null

  const bankId = newId()
  const records: ImportRecord[] = [{
    entity: 'bankConnection',
    id: bankId,
    payload: {
      itemID: opts.itemId, institutionName: opts.institutionName, institutionID: opts.institutionId ?? null,
      cursor, status: 'ok', lastSyncedAt: now, createdAt: now, brandColorHex: null,
    },
  }]
  const accountIds = new Map<string, string>()
  const totals = new Map<string, number>()
  for (const t of txById.values()) totals.set(t.account_id, (totals.get(t.account_id) ?? 0) + t.amount_cents)
  for (const a of accountsById.values()) {
    const type = daveyAccountType(a.type, a.subtype)
    const id = newId()
    accountIds.set(a.account_id, id)
    const bankBalance = a.current_balance_cents === null ? 0 : isLiability(type) ? -a.current_balance_cents : a.current_balance_cents
    records.push({
      entity: 'account',
      id,
      payload: {
        name: a.name, nickname: null, officialName: a.official_name ?? null, type, source: 'plaid', externalID: a.account_id,
        mask: a.mask ?? null, bankConnectionID: bankId, startingBalance: bankBalance - (totals.get(a.account_id) ?? 0),
        availableBalance: a.available_balance_cents, creditLimit: type === 'creditCard' ? a.limit_cents ?? null : null,
        isArchived: false, isBusiness: false, businessName: '', notes: '', createdAt: now, isHiddenFromBudget: false,
      },
    })
  }
  for (const t of txById.values()) {
    const accountID = accountIds.get(t.account_id)
    if (!accountID) continue
    const category = defaultCategoryName(t.category_primary, t.category_detailed)
    records.push({
      entity: 'transaction',
      id: newId(),
      payload: {
        amount: t.amount_cents, date: plaidDay(t.date), payee: t.name, note: '', source: 'plaid', externalID: t.transaction_id,
        isPending: t.pending, isExcludedFromBudget: false, createdAt: now, accountID,
        categoryID: category ? opts.categoryIdByName.get(category) ?? null : null, recurringID: null,
      },
    })
  }
  return records
}

/** The household this user's shared records belong to, or null when they don't share one. */
export async function householdID(data: DaveyData): Promise<string | null> {
  for (const r of data.records.values()) return r.household_id
  const { data: rows, error } = await supabase.from('household_members').select('household_id').limit(1)
  if (error) return null
  return (rows?.[0]?.household_id as string | undefined) ?? null
}

/** Pulls the new bank's history from plaid-sync (all pages) and shares it with the household. */
export async function importNewBank(opts: { itemId: string; institutionName: string; institutionId?: string; data: DaveyData; household: string }) {
  const pages: SyncPage[] = []
  let cursor: string | undefined
  for (let round = 0; round < 10; round++) {
    const { data, error } = await supabase.functions.invoke('plaid-sync', { body: { item_id: opts.itemId, ...(cursor ? { cursor } : {}) } })
    if (error) throw new Error('The bank connected, but its accounts could not be loaded yet. They will appear after the next sync.')
    const page = data as SyncPage
    pages.push(page)
    if (!page.has_more || !page.next_cursor) break
    cursor = page.next_cursor
  }
  const categoryIdByName = new Map<string, string>()
  for (const r of opts.data.records.values()) {
    if (r.entity === 'category' && typeof r.payload.name === 'string') categoryIdByName.set(r.payload.name, r.id)
  }
  const records = importRecords({ itemId: opts.itemId, institutionName: opts.institutionName, institutionId: opts.institutionId, pages, categoryIdByName })
  const updatedAt = new Date().toISOString()
  for (let i = 0; i < records.length; i += 200) {
    const batch = records.slice(i, i + 200).map((r) => ({ ...r, updated_at: updatedAt, deleted: false }))
    const { error } = await supabase.rpc('push_household_records', { p_household: opts.household, p_records: batch })
    if (error) throw new Error(error.code === '42501' ? 'Your household is read-only right now.' : "Couldn't save the new bank's accounts. Try again.")
  }
  return records
}
