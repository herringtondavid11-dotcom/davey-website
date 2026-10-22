// Reads and edits for the screens. Bank data comes from bank.ts (Edge Functions, in memory); edits are saved by
// annotations.ts. The functions keep the shapes the screens already use.
import { saveBudgetNote, setAccountNote, setTransactionNote } from './annotations'
import type { BankData } from './bank'
import { toAccount, toTransaction } from './bank'
import type { Account, Transaction, Usage } from './schema'

let current: BankData | null = null

export function setCurrentData(d: BankData | null) {
  current = d
}
export function currentData(): BankData | null {
  return current
}

function accountUsage(): Map<string, Usage> {
  return new Map((current?.accounts ?? []).map((a) => [a.id, a.usage]))
}

export interface TransactionEdit {
  category?: string
  notes?: string
  usage?: Usage
}

/** The stored note for an edit: only fields that were given. */
export function transactionPatch(t: Transaction, edit: TransactionEdit): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (edit.category !== undefined) patch.category = edit.category || undefined
  if (edit.notes !== undefined) patch.notes = edit.notes.trim() || undefined
  if (edit.usage !== undefined) patch.usage = edit.usage
  void t
  return patch
}

export async function updateTransaction(t: Transaction, edit: TransactionEdit): Promise<Transaction> {
  setTransactionNote(t.id, transactionPatch(t, edit))
  return toTransaction(t.raw, accountUsage())
}

function itemFor(a: Account) {
  return current?.items.find((i) => i.item_id === a.itemId) ?? { item_id: a.itemId ?? '', needs_sync: false, status: 'ok', institution_name: a.institution ?? null, created_at: a.createdAt ?? null }
}

export async function updateAccountNickname(a: Account, nickname: string): Promise<Account> {
  setAccountNote(a.id, { nickname: nickname.trim() || undefined })
  return toAccount(a.raw, itemFor(a))
}

export async function updateAccountUsage(a: Account, usage: Usage): Promise<Account> {
  setAccountNote(a.id, { usage })
  return toAccount(a.raw, itemFor(a))
}

/** Every loaded transaction between two dates (the web holds the full history in memory). */
export async function fetchTransactionsBetween(from: string, to: string): Promise<Transaction[]> {
  return (current?.transactions ?? []).filter((t) => t.date >= from && t.date <= to)
}

export async function saveBudget(_table: string, existing: Record<string, unknown> | undefined, category: string, amount: number) {
  return saveBudgetNote(category, amount, existing?.id as string | undefined) as unknown as Record<string, unknown>
}
