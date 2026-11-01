// Bringing an existing bank up to date on the web: after a reconnect (Plaid update mode) or when the same bank is
// connected again as a new Item. The app does this in PlaidImporter.swift; the web used to call plaid-sync without the
// bank's cursor and throw the answer away, so a reconnect on the web changed nothing anywhere: the connection stayed
// "needs reconnect" and balances and transactions stayed stale (David, PenFed, 2026-10-25).
//
// The household's records are the shared copy, so what's written here reaches the iPhone and Mac too.
import { supabase } from './supabase'
import { daveyAccountType, defaultCategoryName, isLiability, plaidDay, type AppAccount, type AppTransaction, type SyncPage } from './importBank'
import { fetchRecordsById, pushRecords, reloadDaveyData, type DaveyData, type HouseholdRecord } from './serverData'
import { repairOnce } from './repairAccounts'

type Row = Record<string, unknown>

export interface RecordChange {
  entity: 'bankConnection' | 'account' | 'transaction'
  id: string
  payload: Row
  deleted?: boolean
}

const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const cents = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const sameDay = (iso: unknown, plaid: string) => typeof iso === 'string' && iso.slice(0, 10) === plaidDay(plaid).slice(0, 10)

/** The bank's records in the household: its connection, accounts, and every transaction in those accounts. */
export function bankRecords(data: DaveyData, match: { itemId?: string; bankId?: string }) {
  const all = [...data.records.values()]
  const bank = all.find((r) => r.entity === 'bankConnection' && (match.bankId ? r.id === match.bankId : r.payload.itemID === match.itemId))
  if (!bank) return null
  const accounts = all.filter((r) => r.entity === 'account' && r.payload.bankConnectionID === bank.id)
  const ids = new Set(accounts.map((a) => a.id))
  const transactions = all.filter((r) => r.entity === 'transaction' && ids.has(String(r.payload.accountID)))
  return { bank, accounts, transactions }
}

/**
 * An existing bank connected again as a new Item (Connect an account instead of Reconnect): the same institution with
 * at least one account mask in common. That's the same login, so the new Item replaces the old one instead of
 * adding a second copy of every account and transaction.
 */
const BROKEN_CONNECTION = new Set(['needsReauth', 'error', 'login_required', 'pending_expiration', 'pending_disconnect', 'revoked'])

/**
 * Banks a new link should replace: the same institution with a shared mask, a broken connection at that
 * institution, an Item the server already retired, or a shared persistent account id.
 */
export function banksToReplace(data: DaveyData, opts: {
  institutionId?: string
  newItemId: string
  masks: string[]
  persistentIds?: string[]
  retiredItemIds?: string[]
}): HouseholdRecord[] {
  const all = [...data.records.values()]
  const chosen = new Map<string, HouseholdRecord>()
  const add = (bank: HouseholdRecord | null | undefined) => { if (bank) chosen.set(bank.id, bank) }
  add(findSameBank(data, opts.institutionId, opts.newItemId, opts.masks))
  const retired = new Set(opts.retiredItemIds ?? [])
  const persistent = new Set((opts.persistentIds ?? []).filter(Boolean))
  for (const bank of all) {
    if (bank.entity !== 'bankConnection' || bank.payload.itemID === opts.newItemId) continue
    const itemID = text(bank.payload.itemID)
    if (itemID && retired.has(itemID)) add(bank)
    const broken = BROKEN_CONNECTION.has(String(bank.payload.status ?? ''))
    if (broken && opts.institutionId && bank.payload.institutionID === opts.institutionId) add(bank)
    if (persistent.size && all.some((r) => r.entity === 'account' && r.payload.bankConnectionID === bank.id && persistent.has(String(r.payload.persistentAccountID ?? '')))) {
      add(bank)
    }
  }
  return [...chosen.values()]
}

export function findSameBank(data: DaveyData, institutionId: string | undefined, newItemId: string, masks: string[]): HouseholdRecord | null {
  if (!institutionId) return null
  const wanted = new Set(masks.filter(Boolean))
  if (!wanted.size) return null
  const all = [...data.records.values()]
  for (const bank of all) {
    if (bank.entity !== 'bankConnection' || bank.payload.institutionID !== institutionId || bank.payload.itemID === newItemId) continue
    const shared = all.some((r) => r.entity === 'account' && r.payload.bankConnectionID === bank.id && wanted.has(String(r.payload.mask ?? '')))
    if (shared) return bank
  }
  return null
}

/**
 * The changes that bring a bank's records up to date with Plaid's pages (PlaidImporter.swift rules):
 * - Added and modified transactions update amount, date, payee and pending state but keep the household's category
 *   and note. Removed ones are deleted.
 * - A linked account's balance follows the bank's: startingBalance = bank balance − its transactions (debts negated).
 * - The connection is marked OK, with the new cursor (an empty cursor, history not ready yet, is never saved) and
 *   lastSyncedAt.
 * - Accounts are matched by Plaid account ID across the whole household (`household`), not only the ones pointing at
 *   this connection record, and a sync never adds accounts: like PlaidImporter.apply, it updates only the accounts the
 *   household already has. Accounts the user didn't pick when connecting stay out (Refresh all used to add every
 *   account Plaid reported, so a brokerage's accounts showed up twice beside the ones added by hand; David, 2026-10-26).
 * - `newItemId` (a second Item for the same login): the connection moves to the new Item, accounts are matched by
 *   Plaid account ID, else mask and type, and transactions the new Item reports again (new IDs) are matched by account,
 *   amount and day instead of being added twice. Only then are accounts new to the household added.
 */
export function refreshRecords(opts: {
  bank: HouseholdRecord
  accounts: HouseholdRecord[]
  transactions: HouseholdRecord[]
  /** Every account and transaction record in the household, to find this bank's accounts wherever they point. */
  household?: HouseholdRecord[]
  pages: SyncPage[]
  categoryIdByName: Map<string, string>
  newItemId?: string
  now?: Date
  newId?: () => string
}): RecordChange[] {
  const now = (opts.now ?? new Date()).toISOString()
  const newId = opts.newId ?? (() => crypto.randomUUID())
  const changes: RecordChange[] = []
  const removed = new Set(opts.pages.flatMap((p) => p.removed))
  const txById = new Map<string, AppTransaction>()
  for (const page of opts.pages) for (const t of [...page.added, ...page.modified]) txById.set(t.transaction_id, t)
  for (const id of removed) txById.delete(id)
  const plaidAccounts = new Map<string, AppAccount>()
  for (const page of opts.pages) for (const a of page.accounts) plaidAccounts.set(a.account_id, a)
  const cursor = [...opts.pages].reverse().map((p) => p.next_cursor).find((c) => c)

  // This bank's accounts that point elsewhere (another copy of the connection record, or none): same Plaid account ID.
  const own = new Set(opts.accounts.map((r) => r.id))
  const elsewhere = (opts.household ?? []).filter((r) => r.entity === 'account' && !own.has(r.id) &&
    plaidAccounts.has(String(r.payload.externalID ?? '')))
  if (elsewhere.length) {
    const ids = new Set(elsewhere.map((r) => r.id))
    const seen = new Set(opts.transactions.map((r) => r.id))
    opts = {
      ...opts,
      accounts: [...opts.accounts, ...elsewhere],
      transactions: [...opts.transactions, ...(opts.household ?? []).filter((r) => r.entity === 'transaction' && !seen.has(r.id) && ids.has(String(r.payload.accountID)))],
    }
  }

  // Accounts: Plaid account ID first; for a new Item, the same mask and type (or the same name without a mask).
  const accountFor = new Map<string, HouseholdRecord | RecordChange>()
  const unmatched = new Set(opts.accounts)
  for (const a of plaidAccounts.values()) {
    // Two records for one Plaid account (an earlier Refresh all's copy): the one in use, else the oldest.
    const byId = opts.accounts.filter((r) => r.payload.externalID === a.account_id)
      .sort((x, y) => Number(x.payload.isArchived === true) - Number(y.payload.isArchived === true) ||
        String(x.payload.createdAt ?? '').localeCompare(String(y.payload.createdAt ?? '')))[0]
    if (byId) { accountFor.set(a.account_id, byId); unmatched.delete(byId); continue }
    if (!opts.newItemId) continue
    const type = daveyAccountType(a.type, a.subtype)
    const byPersistent = a.persistent_account_id
      ? [...unmatched].find((r) => r.payload.persistentAccountID === a.persistent_account_id)
      : undefined
    const same = byPersistent ?? [...unmatched].find((r) => r.payload.type === type && (a.mask ? r.payload.mask === a.mask : r.payload.name === a.name))
    if (same) { accountFor.set(a.account_id, same); unmatched.delete(same) }
  }
  const accountPayload = new Map<string, Row>()
  // Plaid says which Item an account belongs to: an account whose record lost its connection (no bank name or logo
  // on any device) is attached to this one again.
  for (const [plaidId, r] of accountFor) {
    const incoming = plaidAccounts.get(plaidId)
    accountPayload.set(r.id, {
      ...r.payload, externalID: plaidId, bankConnectionID: opts.bank.id,
      ...(incoming?.persistent_account_id ? { persistentAccountID: incoming.persistent_account_id } : {}),
    })
  }
  for (const a of [...plaidAccounts.values()]) {
    if (accountFor.has(a.account_id)) continue
    // An account the household doesn't have: a plain sync leaves it out (and its transactions and balance with it).
    if (!opts.newItemId) { plaidAccounts.delete(a.account_id); continue }
    const type = daveyAccountType(a.type, a.subtype)
    const record: RecordChange = {
      entity: 'account', id: newId(),
      payload: {
        name: a.name, nickname: null, officialName: a.official_name ?? null, type, source: 'plaid', externalID: a.account_id,
        mask: a.mask ?? null, bankConnectionID: opts.bank.id, startingBalance: 0, availableBalance: a.available_balance_cents,
        creditLimit: type === 'creditCard' ? a.limit_cents ?? null : null, isArchived: false, isBusiness: false, businessName: '',
        notes: '', createdAt: now, isHiddenFromBudget: false,
      },
    }
    accountFor.set(a.account_id, record)
    accountPayload.set(record.id, record.payload)
  }

  // Transactions.
  const amounts = new Map<string, number>() // transaction id → amount after these changes, for the balances
  for (const t of opts.transactions) amounts.set(t.id, cents(t.payload.amount))
  const byExternal = new Map(opts.transactions.filter((t) => text(t.payload.externalID)).map((t) => [String(t.payload.externalID), t]))
  const claimed = new Set<string>()
  for (const t of txById.values()) {
    const account = accountFor.get(t.account_id)
    if (!account) continue
    let existing = byExternal.get(t.transaction_id)
    if (!existing && opts.newItemId) {
      existing = opts.transactions.find((r) => !claimed.has(r.id) && r.payload.accountID === account.id &&
        cents(r.payload.amount) === t.amount_cents && sameDay(r.payload.date, t.date) && !txById.has(String(r.payload.externalID ?? '')))
    }
    if (existing) {
      claimed.add(existing.id)
      const payload: Row = { ...existing.payload, amount: t.amount_cents, date: plaidDay(t.date), payee: t.name, isPending: t.pending, externalID: t.transaction_id }
      const changed = ['amount', 'date', 'payee', 'isPending', 'externalID'].some((k) => payload[k] !== existing!.payload[k])
      if (changed) changes.push({ entity: 'transaction', id: existing.id, payload })
      amounts.set(existing.id, t.amount_cents)
    } else {
      const category = defaultCategoryName(t.category_primary, t.category_detailed)
      const id = newId()
      changes.push({
        entity: 'transaction', id,
        payload: {
          amount: t.amount_cents, date: plaidDay(t.date), payee: t.name, note: '', source: 'plaid', externalID: t.transaction_id,
          isPending: t.pending, isExcludedFromBudget: false, createdAt: now, accountID: account.id,
          categoryID: category ? opts.categoryIdByName.get(category) ?? null : null, recurringID: null,
        },
      })
      amounts.set(id, t.amount_cents)
    }
  }
  for (const id of removed) {
    const existing = byExternal.get(id)
    if (!existing) continue
    changes.push({ entity: 'transaction', id: existing.id, payload: existing.payload, deleted: true })
    amounts.delete(existing.id)
  }

  // Balances: the bank's balance through the starting balance, like the app.
  const accountOfTx = new Map<string, string>()
  for (const t of opts.transactions) accountOfTx.set(t.id, String(t.payload.accountID))
  for (const c of changes) if (c.entity === 'transaction' && !c.deleted) accountOfTx.set(c.id, String(c.payload.accountID))
  const totals = new Map<string, number>()
  for (const [txId, amount] of amounts) {
    const acc = accountOfTx.get(txId)
    if (acc) totals.set(acc, (totals.get(acc) ?? 0) + amount)
  }
  for (const [plaidId, a] of plaidAccounts) {
    const record = accountFor.get(plaidId)!
    const payload = accountPayload.get(record.id)!
    const type = String(payload.type)
    if (a.current_balance_cents !== null) {
      const bankBalance = isLiability(type) ? -a.current_balance_cents : a.current_balance_cents
      payload.startingBalance = bankBalance - (totals.get(record.id) ?? 0)
    }
    payload.availableBalance = a.available_balance_cents
    if (type === 'creditCard' && a.limit_cents != null) payload.creditLimit = a.limit_cents
    const before = 'household_id' in record ? record.payload : null
    const changed = !before || ['startingBalance', 'availableBalance', 'creditLimit', 'externalID', 'bankConnectionID', 'persistentAccountID'].some((k) => payload[k] !== before[k])
    if (changed) changes.push({ entity: 'account', id: record.id, payload })
  }

  changes.unshift({
    entity: 'bankConnection', id: opts.bank.id,
    payload: {
      ...opts.bank.payload, itemID: opts.newItemId ?? opts.bank.payload.itemID, status: 'ok', lastSyncedAt: now,
      cursor: cursor ?? opts.bank.payload.cursor ?? null,
    },
  })
  return changes
}

/** plaid-sync pages from a cursor (none: the whole history). A cursor Plaid no longer accepts starts over. */
/** plaid-sync's answer when it failed: `code` is the function's error code (item_login_required, item_not_found, …). */
export class SyncError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
  }
}

async function syncError(error: unknown): Promise<SyncError> {
  let body: Row = {}
  try {
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') body = (await context.clone().json()) as Row
  } catch { /* not JSON */ }
  const code = text(body.error) ?? 'unknown'
  if (code === 'item_login_required') return new SyncError(code, 'This bank needs you to sign in again.')
  return new SyncError(code, text(body.message) ?? "Couldn't load the bank's latest balances. Try again in a minute.")
}

async function syncPages(itemId: string, cursor: string | undefined, realtime = false): Promise<SyncPage[]> {
  const pages: SyncPage[] = []
  let next = cursor
  for (let round = 0; round < 10; round++) {
    // Refresh all asks for a live balance on the first page only (the server checks at most once per 5 minutes).
    const body = { item_id: itemId, ...(next ? { cursor: next } : {}), ...(realtime && round === 0 ? { realtime: true } : {}) }
    const { data, error } = await supabase.functions.invoke('plaid-sync', { body })
    if (error) {
      const failed = await syncError(error)
      // A stale cursor: start over once. A login problem won't change by retrying.
      if (round === 0 && next && failed.code !== 'item_login_required') { next = undefined; continue }
      throw failed
    }
    const page = data as SyncPage
    pages.push(page)
    if (!page.has_more || !page.next_cursor) break
    next = page.next_cursor
  }
  return pages
}

/** The fields a sync owns. Everything else (nickname, category, note, goal, hidden…) is the household's. */
const SYNC_FIELDS: Record<string, string[]> = {
  account: ['startingBalance', 'availableBalance', 'creditLimit', 'externalID', 'bankConnectionID', 'persistentAccountID'],
  transaction: ['amount', 'date', 'payee', 'isPending', 'externalID'],
}

/**
 * A sync's changes laid onto the newest copy of each record, so an edit made on any device while the bank was syncing
 * (a nickname, a category, Hide) isn't written back over. New records and deletions go as they are.
 */
export function mergeOntoLatest(changes: RecordChange[], latest: Map<string, HouseholdRecord>): RecordChange[] {
  return changes.map((c) => {
    const fields = SYNC_FIELDS[c.entity]
    const now = latest.get(`${c.entity}:${c.id}`)
    if (!fields || !now || c.deleted) return c
    const payload: Row = { ...now.payload }
    for (const f of fields) if (f in c.payload) payload[f] = c.payload[f]
    return { ...c, payload }
  })
}

/** The newest copy of just the records these changes touch (not the whole household). */
async function latestOf(changes: RecordChange[]): Promise<Map<string, HouseholdRecord>> {
  const byEntity = new Map<string, string[]>()
  for (const c of changes) if (!c.deleted && SYNC_FIELDS[c.entity]) byEntity.set(c.entity, [...(byEntity.get(c.entity) ?? []), c.id])
  const latest = new Map<string, HouseholdRecord>()
  for (const [entity, ids] of byEntity) for (const r of await fetchRecordsById(entity, ids)) latest.set(`${entity}:${r.id}`, r)
  return latest
}

async function push(household: string, changes: RecordChange[]) {
  changes = mergeOntoLatest(changes, await latestOf(changes))
  const updatedAt = new Date().toISOString()
  for (let i = 0; i < changes.length; i += 200) {
    const batch = changes.slice(i, i + 200).map((c) => ({ entity: c.entity, id: c.id, payload: c.payload, updated_at: updatedAt, deleted: c.deleted === true }))
    const { error } = await supabase.rpc('push_household_records', { p_household: household, p_records: batch })
    if (error) throw new Error(error.code === '42501' ? 'Your household is read-only right now.' : "Couldn't save the bank's update. Try again.")
  }
}

function categories(data: DaveyData) {
  const byName = new Map<string, string>()
  for (const r of data.records.values()) if (r.entity === 'category' && typeof r.payload.name === 'string') byName.set(r.payload.name, r.id)
  return byName
}

/** The server says this Item needs a sign-in. Remember that on the household connection so every device shows Reconnect. */
export async function rememberReauth(itemIds: string[]): Promise<void> {
  if (!itemIds.length) return
  const data = await reloadDaveyData()
  const list = itemIds.flatMap((itemId) => {
    const found = bankRecords(data, { itemId })
    if (!found || found.bank.payload.status === 'needsReauth') return []
    return [{ id: found.bank.id, payload: { ...found.bank.payload, status: 'needsReauth' } }]
  })
  if (list.length) await pushRecords('bankConnection', list)
}

async function callRefresh(itemId?: string): Promise<ServerRefresh> {
  const { data, error } = await supabase.functions.invoke('plaid-refresh', { body: itemId ? { item_id: itemId } : {} })
  if (error) throw await syncError(error)
  const report = data as ServerRefresh
  if (!report || !Array.isArray(report.results)) throw new SyncError('unknown', "Couldn't refresh accounts. Try again.")
  return report
}

/** Apply the server's pages to the household. A stale result does not move Last synced. */
async function applyReport(report: ServerRefresh, data: DaveyData): Promise<number> {
  let changes = 0
  const household = [...data.records.values()]
  const byItem = new Map<string, ServerAccountResult[]>()
  for (const result of report.results) byItem.set(result.item_id, [...(byItem.get(result.item_id) ?? []), result])
  for (const page of report.syncs ?? []) {
    const itemId = page.item_id
    if (!itemId) continue
    const found = bankRecords(data, { itemId })
    if (!found) continue
    const bump = (byItem.get(itemId) ?? []).some((r) => r.status === 'updated')
    const written = keepPreviousSyncTime(
      refreshRecords({ ...found, household, pages: [page], categoryIdByName: categories(data) }),
      found.bank.payload.lastSyncedAt,
      bump,
    )
    await push(found.bank.household_id, written)
    changes += written.length
  }
  for (const [itemId, rows] of byItem) {
    if (!rows.some((r) => r.status === 'needs_reconnect')) continue
    if ((report.syncs ?? []).some((p) => p.item_id === itemId)) continue
    const found = bankRecords(data, { itemId })
    if (!found || found.bank.payload.status === 'needsReauth') continue
    await push(found.bank.household_id, [{ entity: 'bankConnection', id: found.bank.id, payload: { ...found.bank.payload, status: 'needsReauth' } }]).catch(() => undefined)
  }
  rememberRetries(report.results)
  return changes
}

/** After a reconnect (update mode): refresh that item and share the changes. Returns null without a record. */
export async function refreshBank(itemId: string, data: DaveyData, _opts: { realtime?: boolean } = {}): Promise<{ changes: number; balanceSource?: string } | null> {
  const found = bankRecords(data, { itemId })
  if (!found) return null
  let report: ServerRefresh
  try {
    report = await callRefresh(itemId)
  } catch (e) {
    if (e instanceof SyncError && e.code === 'item_login_required' && found.bank.payload.status !== 'needsReauth') {
      await push(found.bank.household_id, [{ entity: 'bankConnection', id: found.bank.id, payload: { ...found.bank.payload, status: 'needsReauth' } }]).catch(() => undefined)
    }
    throw e
  }
  const changes = await applyReport(report, data)
  const live = report.syncs?.some((p) => (p as { balance_source?: string }).balance_source === 'live')
  return { changes, balanceSource: live ? 'live' : report.results[0]?.status }
}

/** What Refresh all found for one account (the app's AccountRefreshResult). */
export interface RefreshResult {
  itemId: string
  institution: string
  accountId?: string
  name?: string
  mask?: string
  outcome: 'updated' | 'stale' | 'needsReconnect' | 'failed' | 'institutionDown'
  message?: string
  lastUpdated?: string
  live?: boolean
  reason?: string
}

/** The server's per-account row (`plaid-refresh`). */
export interface ServerAccountResult {
  item_id: string
  institution_name?: string | null
  institution_id?: string | null
  account_id?: string | null
  name?: string | null
  mask?: string | null
  status: string
  message: string
  last_updated?: string | null
  reconnect?: boolean
  retry_after?: string | null
}

export interface ServerRefresh {
  refreshed_at?: string
  results: ServerAccountResult[]
  syncs: (SyncPage & { item_id?: string })[]
}

/** Every account the server returned. Savings-only, OAuth, and household items are not filtered out here. */
export function presentRefresh(results: ServerAccountResult[]): RefreshResult[] {
  return results.map((r) => ({
    itemId: r.item_id,
    institution: r.institution_name || 'Bank',
    accountId: r.account_id || undefined,
    name: r.name || undefined,
    mask: r.mask || undefined,
    outcome: outcomeOf(r.status),
    message: r.message,
    lastUpdated: r.last_updated || undefined,
  }))
}

function outcomeOf(status: string): RefreshResult['outcome'] {
  switch (status) {
    case 'updated': return 'updated'
    case 'stale': return 'stale'
    case 'needs_reconnect': return 'needsReconnect'
    case 'institution_down': return 'institutionDown'
    default: return 'failed'
  }
}

/** The short label on the Accounts table. The sheet uses the full sentence. */
export function shortRefreshLabel(outcome: RefreshResult['outcome']): string {
  switch (outcome) {
    case 'updated': return 'Updated just now'
    case 'stale': return 'Stale'
    case 'needsReconnect': return 'Reconnect'
    case 'institutionDown': return 'Bank down'
    default: return 'Failed'
  }
}

/**
 * Last synced moves only when the bank sent new data. A stale cache keeps the previous time, so a savings account
 * Plaid hasn't re-extracted doesn't look freshly updated.
 */
export function keepPreviousSyncTime(changes: RecordChange[], previous: unknown, bump: boolean): RecordChange[] {
  if (bump) return changes
  return changes.map((c) => c.entity === 'bankConnection'
    ? { ...c, payload: { ...c.payload, lastSyncedAt: previous ?? null } }
    : c)
}

const RETRY_KEY = 'davey.refresh.retry'

export function dueRetries(stored: { itemId: string; after: string }[], now = Date.now()): string[] {
  return stored.filter((r) => Date.parse(r.after) <= now).map((r) => r.itemId)
}

function readRetries(): { itemId: string; after: string }[] {
  try { return JSON.parse(localStorage.getItem(RETRY_KEY) ?? '[]') as { itemId: string; after: string }[] } catch { return [] }
}

function writeRetries(rows: { itemId: string; after: string }[]) {
  try { localStorage.setItem(RETRY_KEY, JSON.stringify(rows)) } catch { /* private window */ }
}

/** Remember INSTITUTION_DOWN retries and drop them once the bank answers. */
export function rememberRetries(results: ServerAccountResult[], now = Date.now()): { itemId: string; after: string }[] {
  const byItem = new Map(readRetries().map((r) => [r.itemId, r]))
  const grouped = new Map<string, ServerAccountResult[]>()
  for (const r of results) grouped.set(r.item_id, [...(grouped.get(r.item_id) ?? []), r])
  for (const [itemId, rows] of grouped) {
    const after = rows.map((r) => r.retry_after).filter((v): v is string => !!v).sort().at(-1)
    if (after && Date.parse(after) > now) byItem.set(itemId, { itemId, after })
    else if (rows.some((r) => r.status === 'updated' || r.status === 'stale' || r.status === 'needs_reconnect')) byItem.delete(itemId)
  }
  const next = [...byItem.values()]
  writeRetries(next)
  return next
}

/** The same words as the app for which balances came back (plaid-sync's balance_source). */
export function balanceNote(live: boolean, reason?: string): string {
  if (live) return 'Live balance from the bank'
  switch (reason) {
    case 'recent': return 'Checked live in the last 5 minutes; showing that balance'
    case 'unavailable': return "The bank didn't answer a live check; showing Plaid's latest balance"
    default: return "Plaid's latest balance (live checks are off)"
  }
}

/**
 * Accounts › Refresh all: syncs every bank in the household now (transactions and balances, a live balance where
 * that's switched on) and shares the results, one bank after another. Banks that need a sign-in are tried too.
 */
export async function refreshAllBanks(load: () => Promise<DaveyData>, _opts: { realtime?: boolean } = {}): Promise<RefreshResult[]> {
  // After the one-time duplicate repair (one shared promise): a sync that read the records first would write them back.
  await repairOnce(load)
  // One load, then one server call for every Item in the household. The server does not drop savings-only, OAuth,
  // cursor-less, login-required, or a partner's items.
  const data = await load()
  try {
    const report = await callRefresh()
    await applyReport(report, data)
    return presentRefresh(report.results)
  } catch (e) {
    return [{ itemId: '', institution: 'Accounts', outcome: 'failed', message: (e as Error).message }]
  }
}

/** Asks again for banks that were down, once their retry time has passed. */
export async function retryDueInstitutions(load: () => Promise<DaveyData>): Promise<boolean> {
  const due = dueRetries(readRetries())
  if (!due.length) return false
  const data = await load()
  for (const itemId of due) await refreshBank(itemId, data).catch(() => undefined)
  return true
}

/** A second Item for a bank the household already has: move the old connection onto it, then remove the old Item. */
export async function adoptNewItem(oldBank: HouseholdRecord, newItemId: string, data: DaveyData): Promise<{ changes: number }> {
  const found = bankRecords(data, { bankId: oldBank.id })!
  const pages = await syncPages(newItemId, undefined)
  const changes = refreshRecords({ ...found, household: [...data.records.values()], pages, categoryIdByName: categories(data), newItemId })
  await push(oldBank.household_id, changes)
  const oldItemId = text(oldBank.payload.itemID)
  // The old login is replaced; revoke it so Plaid doesn't keep (and bill) both. Its records now belong to the new Item.
  if (oldItemId) await supabase.functions.invoke('plaid-item-remove', { body: { item_id: oldItemId } }).catch(() => undefined)
  return { changes: changes.length }
}

/** Connections the web checks by itself (at most every 10 minutes each), so a fixed bank stops showing as broken. */
const CHECK_EVERY_MS = 10 * 60_000
const checkedAt = new Map<string, number>()

export function dueForCheck(itemId: string, now = Date.now()): boolean {
  return now - (checkedAt.get(itemId) ?? 0) >= CHECK_EVERY_MS
}

/**
 * Syncs each flagged connection once. Returns what's still wrong: item ID → message (a bank that synced is left out).
 * A connection whose login Plaid already accepts (fixed on another device, or a passing outage) turns OK everywhere.
 */
export async function checkConnections(itemIds: string[], load: () => Promise<DaveyData>): Promise<Map<string, string>> {
  const problems = new Map<string, string>()
  const data = itemIds.length ? await load() : null
  for (const itemId of itemIds) {
    checkedAt.set(itemId, Date.now())
    try {
      const done = await refreshBank(itemId, data!)
      if (!done) problems.set(itemId, "This connection isn't shared with your household yet.")
    } catch (e) {
      problems.set(itemId, (e as Error).message)
    }
  }
  return problems
}

/** Tests only. */
export function resetConnectionChecks() {
  checkedAt.clear()
}

/**
 * Bank accounts whose record lost its connection show "Bank" with no name or logo. Once per page load, sync the
 * household's banks (Plaid's latest balances, no billed live check) so each account is attached to its bank again.
 */
let relinked: Promise<boolean> | null = null
const RELINK_KEY = 'davey.relink.at'
const RELINK_EVERY_MS = 6 * 3_600_000
/** At most every 6 hours per browser: an account whose bank isn't shared with the household stays unlinked anyway. */
function relinkDue(now = Date.now()) {
  try { return now - Number(localStorage.getItem(RELINK_KEY) ?? 0) >= RELINK_EVERY_MS } catch { return true }
}
export function relinkOrphansOnce(orphans: number, load: () => Promise<DaveyData>): Promise<boolean> {
  // Only the first caller hears "changed" (and reloads); later ones get false, so a reload can't start another.
  if (!orphans || relinked || !relinkDue()) return Promise.resolve(false)
  try { localStorage.setItem(RELINK_KEY, String(Date.now())) } catch { /* private window: once per page load */ }
  relinked = refreshAllBanks(load, { realtime: false }).then((r) => r.some((x) => x.outcome === 'updated'), () => false)
  return relinked
}

/** Tests only. */
export function resetRelink() {
  relinked = null
}
