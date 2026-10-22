import { categoryID, loadDaveyData, pushChange, reloadDaveyData, saveMonthlyBudget } from './serverData'
import { isLiability } from './finance'
import {
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
  return (await loadDaveyData()).accounts.map(normalizeAccount)
}

export async function fetchTransactions(page = 0, pageSize = TRANSACTION_PAGE): Promise<Transaction[]> {
  const from = page * pageSize
  return (await loadDaveyData()).transactions.slice(from, from + pageSize).map(normalizeTransaction)
}

/** Every loaded transaction (not just the first page): the Overview's history and trends need all of them. */
export async function fetchAllTransactions(): Promise<Transaction[]> {
  return (await loadDaveyData()).transactions.map(normalizeTransaction)
}

/** After connecting a bank: the app imports it and shares it with the household; reload what's on the server. */
export async function refreshData(): Promise<void> {
  await reloadDaveyData()
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
  const data = await loadDaveyData()
  const changes: Record<string, unknown> = {}
  if (edit.category !== undefined) {
    const id = edit.category ? categoryID(data, edit.category) : null
    if (edit.category && !id) throw new Error(`"${edit.category}" isn't one of your Davey categories. Add it in the app first.`)
    changes.categoryID = id
  }
  if (edit.notes !== undefined) changes.note = edit.notes.trim()
  if (edit.usage !== undefined && edit.usage !== t.usage) {
    throw new Error('In Davey, Business or Personal is set on the account. Change it under Accounts.')
  }
  if (Object.keys(changes).length) await pushChange('transaction', t.id, changes)
  return { ...t, category: edit.category ?? t.category, notes: edit.notes !== undefined ? edit.notes.trim() || undefined : t.notes }
}

export async function updateAccountNickname(a: Account, nickname: string): Promise<Account> {
  await pushChange('account', a.id, { nickname: nickname.trim() || null })
  return { ...a, nickname: nickname.trim() || undefined }
}

export async function updateAccountUsage(a: Account, usage: Usage): Promise<Account> {
  await pushChange('account', a.id, { isBusiness: usage === 'business' })
  return { ...a, usage }
}

/**
 * Sets (or clears, with `target` undefined) an account's goal, as the app's Account.setGoal does: for a card or loan it
 * remembers what's owed now, so progress is what's paid down from here.
 */
export async function updateAccountGoal(a: Account, target: number | undefined, date?: string): Promise<Account> {
  const owed = isLiability(a) ? Math.abs(a.balance) : undefined
  const goalStart = target !== undefined ? owed : undefined
  await pushChange('account', a.id, {
    goalTarget: target === undefined ? null : Math.round(Math.abs(target) * 100),
    goalTargetDate: target === undefined || !date ? null : new Date(`${date}T12:00:00`).toISOString(),
    goalStart: goalStart === undefined ? null : Math.round(goalStart * 100),
  })
  // Keep the session's rows in step so a reload shows the new goal before the next full fetch.
  const row = (await loadDaveyData()).accounts.find((r) => r.id === a.id)
  if (row) Object.assign(row, { goal_target: target === undefined ? undefined : Math.abs(target), goal_start: goalStart, goal_target_date: target === undefined ? undefined : date || undefined })
  return { ...a, goalTarget: target === undefined ? undefined : Math.abs(target), goalStart, goalTargetDate: target === undefined ? undefined : date || undefined }
}

/** This month's budget for a category, saved to the household's shared records (the app's Budget tab shows it). */
export async function saveBudget(_table: string, existing: Record<string, unknown> | undefined, category: string, amount: number): Promise<Record<string, unknown>> {
  return saveMonthlyBudget(category, amount, existing?.id as string | undefined)
}

/** Every transaction between two dates (inclusive). Used by exports and tax. */
export async function fetchTransactionsBetween(from: string, to: string): Promise<Transaction[]> {
  return (await loadDaveyData()).transactions
    .filter((t) => String(t.date) >= from && String(t.date) <= to)
    .map(normalizeTransaction)
}
