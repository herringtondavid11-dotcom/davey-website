// Davey on the web reads bank data the same way the app does: the household's Plaid Items from plaid-item-status,
// then each Item's accounts and full transaction history from plaid-sync (cursor from the start, platform 'web').
// Nothing financial is stored by the web app; it lives in memory for the session. Edits come from annotations.ts.
import { annotations } from './annotations'
import { plaidCategory } from './categories'
import type { Account, Transaction, Usage } from './schema'
import { supabase } from './supabase'

type Row = Record<string, unknown>

export interface BankItem {
  item_id: string
  needs_sync: boolean
  status: string
  institution_name: string | null
  created_at: string | null
}

export interface ItemSyncError {
  itemId: string
  institution: string
  code: string
  message: string
}

async function call<T>(name: string, body: Row): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let payload: { error?: string; message?: string } = {}
    try {
      payload = await (error as { context?: Response }).context?.json()
    } catch {
      /* not JSON */
    }
    const e = new Error(payload.message || error.message || 'Something went wrong.') as Error & { code?: string; status?: number }
    e.code = payload.error
    e.status = (error as { context?: Response }).context?.status
    throw e
  }
  return data as T
}

export async function listItems(): Promise<BankItem[]> {
  const data = await call<{ items: BankItem[] }>('plaid-item-status', {})
  return data.items ?? []
}

export interface SyncResult {
  accounts: Row[]
  transactions: Row[]
}

/** Every page of /transactions/sync from the beginning; removed and replaced-pending transactions are dropped. */
export async function syncItemFull(itemId: string, maxCalls = 40): Promise<SyncResult> {
  const byId = new Map<string, Row>()
  let accounts: Row[] = []
  let cursor: string | null = null
  for (let i = 0; i < maxCalls; i++) {
    const page: { added?: Row[]; modified?: Row[]; removed?: string[]; accounts?: Row[]; next_cursor?: string | null; has_more?: boolean } =
      await call('plaid-sync', { item_id: itemId, cursor, platform: 'web' })
    for (const t of [...(page.added ?? []), ...(page.modified ?? [])]) byId.set(String(t.transaction_id), t)
    for (const id of page.removed ?? []) byId.delete(id)
    if (page.accounts?.length) accounts = page.accounts
    cursor = page.next_cursor ?? null
    if (!page.has_more) break
  }
  // A posted transaction replaces its pending version.
  const replaced = new Set([...byId.values()].map((t) => t.pending_transaction_id).filter(Boolean) as string[])
  return { accounts, transactions: [...byId.values()].filter((t) => !replaced.has(String(t.transaction_id))) }
}

const cents = (v: unknown) => (typeof v === 'number' ? v / 100 : undefined)
const text = (v: unknown) => (typeof v === 'string' && v ? v : undefined)

export function toAccount(row: Row, item: BankItem): Account {
  const id = String(row.account_id)
  const note = annotations().accounts[id] ?? {}
  const apr = typeof row.apr_basis_points === 'number' ? row.apr_basis_points / 100 : undefined
  return {
    id,
    plaidAccountId: id,
    itemId: item.item_id,
    name: text(row.name) ?? text(row.official_name) ?? 'Account',
    nickname: note.nickname,
    mask: text(row.mask),
    type: (text(row.type) ?? 'other').toLowerCase(),
    subtype: text(row.subtype),
    balance: cents(row.current_balance_cents) ?? 0,
    available: cents(row.available_balance_cents),
    currency: text(row.iso_currency_code) ?? 'USD',
    institution: item.institution_name ?? undefined,
    hidden: false,
    createdAt: item.created_at ?? undefined,
    usage: note.usage ?? 'personal',
    creditLimit: cents(row.limit_cents),
    apr,
    originalPrincipal: cents(row.origination_principal_cents),
    originationDate: text(row.origination_date),
    termMonths: typeof row.loan_term_months === 'number' ? row.loan_term_months : undefined,
    minimumPayment: cents(row.next_payment_amount_cents),
    nextPaymentDue: text(row.next_payment_due_date),
    propertyValue: undefined,
    lastSynced: undefined,
    raw: row,
  }
}

export function toTransaction(row: Row, accountUsage: Map<string, Usage>): Transaction {
  const id = String(row.transaction_id)
  const accountId = String(row.account_id)
  const note = annotations().transactions[id] ?? {}
  return {
    id,
    accountId,
    date: String(row.date ?? '').slice(0, 10),
    name: text(row.name) ?? 'Transaction',
    originalName: undefined,
    amount: cents(row.amount_cents) ?? 0,
    category: note.category ?? plaidCategory(text(row.category_primary), text(row.category_detailed)),
    notes: note.notes,
    usage: note.usage ?? accountUsage.get(accountId) ?? 'personal',
    pending: row.pending === true,
    currency: text(row.iso_currency_code) ?? 'USD',
    raw: row,
  }
}

export interface BankData {
  items: BankItem[]
  accounts: Account[]
  transactions: Transaction[]
  errors: ItemSyncError[]
  raw: { item: BankItem; result: SyncResult }[]
}

/** Lists Items, syncs them in parallel, and builds web models with this browser's edits applied. */
export async function loadBankData(onProgress?: (done: number, total: number) => void): Promise<BankData> {
  const items = await listItems()
  let done = 0
  onProgress?.(0, items.length)
  const raw: BankData['raw'] = []
  const errors: ItemSyncError[] = []
  await Promise.all(
    items.map(async (item) => {
      try {
        raw.push({ item, result: await syncItemFull(item.item_id) })
      } catch (e) {
        const err = e as Error & { code?: string }
        errors.push({ itemId: item.item_id, institution: item.institution_name ?? 'A bank', code: err.code ?? 'sync_failed', message: err.message })
        if (err.code === 'ITEM_LOGIN_REQUIRED' || /sign in|login/i.test(err.message)) item.status = 'login_required'
      } finally {
        onProgress?.(++done, items.length)
      }
    }),
  )
  return { items, errors, raw, ...rebuild(raw) }
}

/** Recompute models after an edit (annotations changed). */
export function rebuild(raw: BankData['raw']): { accounts: Account[]; transactions: Transaction[] } {
  const accounts = raw.flatMap(({ item, result }) => result.accounts.map((a) => toAccount(a, item)))
  const usage = new Map(accounts.map((a) => [a.id, a.usage]))
  const transactions = raw
    .flatMap(({ result }) => result.transactions.map((t) => toTransaction(t, usage)))
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name))
  return { accounts, transactions }
}
