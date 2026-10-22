import { supabase } from './supabase'
import {
  ACCOUNT_COLUMNS,
  TABLES,
  TRANSACTION_COLUMNS,
  normalizeAccount,
  normalizeTransaction,
  usageToRaw,
  writeColumn,
  type Account,
  type Transaction,
  type Usage,
} from './schema'

export const TRANSACTION_PAGE = 500

export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await supabase.from(TABLES.accounts).select('*')
  if (error) throw error
  return (data ?? []).map(normalizeAccount)
}

export async function fetchTransactions(page = 0, pageSize = TRANSACTION_PAGE): Promise<Transaction[]> {
  const from = page * pageSize
  const { data, error } = await supabase
    .from(TABLES.transactions)
    .select('*')
    .order(TRANSACTION_COLUMNS.date[0], { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return (data ?? []).map(normalizeTransaction)
}

export interface TransactionEdit {
  category?: string
  notes?: string
  usage?: Usage
}

/** Builds the PATCH body for an edit, writing to the columns this row actually has. */
export function transactionPatch(t: Transaction, edit: TransactionEdit): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (edit.category !== undefined) {
    const col = writeColumn(t.raw, TRANSACTION_COLUMNS.category.filter((c) => c !== 'personal_finance_category'))
    patch[col] = edit.category || null
  }
  if (edit.notes !== undefined) patch[writeColumn(t.raw, TRANSACTION_COLUMNS.notes)] = edit.notes.trim() || null
  if (edit.usage !== undefined) {
    const col = writeColumn(t.raw, TRANSACTION_COLUMNS.business)
    patch[col] = usageToRaw(edit.usage, col, t.raw)
  }
  return patch
}

export async function updateTransaction(t: Transaction, edit: TransactionEdit): Promise<Transaction> {
  const patch = transactionPatch(t, edit)
  const { data, error } = await supabase.from(TABLES.transactions).update(patch).eq('id', t.raw.id as string).select('*')
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error("You don't have permission to edit this transaction.")
  return normalizeTransaction(row)
}

export async function updateAccountNickname(a: Account, nickname: string): Promise<Account> {
  const col = writeColumn(a.raw, ACCOUNT_COLUMNS.nickname)
  const { data, error } = await supabase
    .from(TABLES.accounts)
    .update({ [col]: nickname.trim() || null })
    .eq('id', a.raw.id as string)
    .select('*')
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error("You don't have permission to rename this account.")
  return normalizeAccount(row)
}

export async function updateAccountUsage(a: Account, usage: Usage): Promise<Account> {
  const col = writeColumn(a.raw, ACCOUNT_COLUMNS.business)
  const { data, error } = await supabase
    .from(TABLES.accounts)
    .update({ [col]: usageToRaw(usage, col, a.raw) })
    .eq('id', a.raw.id as string)
    .select('*')
  if (error) throw error
  const row = data?.[0]
  if (!row) throw new Error("You don't have permission to change this account.")
  return normalizeAccount(row)
}

/** Budgets live in the optional budgets table (see tables.ts). */
export async function saveBudget(table: string, existing: Record<string, unknown> | undefined, category: string, amount: number) {
  if (existing) {
    const col = writeColumn(existing, ['amount', 'limit', 'monthly_amount', 'budget'])
    const { data, error } = await supabase.from(table).update({ [col]: amount }).eq('id', existing.id as string).select('*')
    if (error) throw error
    if (!data?.[0]) throw new Error("You don't have permission to change this budget.")
    return data[0] as Record<string, unknown>
  }
  const { data, error } = await supabase.from(table).insert({ category, amount }).select('*')
  if (error) throw new Error("Couldn't add this budget here. Add it in the Davey app for now.")
  return data?.[0] as Record<string, unknown>
}
