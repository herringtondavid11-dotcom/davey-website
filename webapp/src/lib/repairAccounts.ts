// One-time repair for accounts a web sync added by mistake (2026-10-25 to 10-26). refreshRecords used to add every
// account Plaid reported for a bank, so Refresh all brought in accounts the household had never imported: a
// brokerage's accounts showed up a second time beside the ones David had added by hand, doubling Investments. The sync
// no longer adds accounts (refreshBank.ts); this hides the copies it made. Hidden, never deleted: Undo (or Accounts ›
// Show hidden › Unhide) brings any of them back on every device.
import { pushRecords, type HouseholdRecord } from './serverData'

type Row = Record<string, unknown>

/** The first web sync that could add accounts (c0488e9). Accounts created before it aren't touched. */
export const WEB_SYNC_SHIPPED = '2026-10-25T04:00:00.000Z'
/** An account created this long after its connection was added later, by a sync, not when the bank was connected. */
const LATER_MS = 15 * 60_000
const KEPT_KEY = 'davey.repair.kept'

const text = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined)
const time = (v: unknown) => { const t = Date.parse(text(v) ?? ''); return Number.isFinite(t) ? t : NaN }

/** Any sign the household chose to keep or use this account: then it isn't ours to hide. */
function edited(p: Row): boolean {
  return Boolean(text(p.nickname) || text(p.accountCategoryID) || text(p.rollupCategory) || text(p.notes) ||
    p.goalTarget != null || p.isBusiness === true || p.repairKept === true)
}

/**
 * Accounts a web sync added after the bank was connected: a bank connection, created since WEB_SYNC_SHIPPED and more
 * than 15 minutes after that connection, not hidden, and not edited since. Also any later copy of a Plaid account the
 * household already has (same Plaid account ID).
 */
export function strayAccounts(records: Iterable<HouseholdRecord>, kept: ReadonlySet<string> = new Set()): HouseholdRecord[] {
  const all = [...records]
  const banks = new Map(all.filter((r) => r.entity === 'bankConnection').map((r) => [r.id, r]))
  const accounts = all.filter((r) => r.entity === 'account')
  const shipped = Date.parse(WEB_SYNC_SHIPPED)
  const firstByPlaidId = new Map<string, HouseholdRecord>()
  for (const a of [...accounts].sort((x, y) => (time(x.payload.createdAt) || 0) - (time(y.payload.createdAt) || 0))) {
    const id = text(a.payload.externalID)
    if (id && a.payload.isArchived !== true && !firstByPlaidId.has(id)) firstByPlaidId.set(id, a)
  }
  return accounts.filter((a) => {
    const p = a.payload
    if (p.isArchived === true || p.source !== 'plaid' || kept.has(a.id) || edited(p)) return false
    const created = time(p.createdAt)
    if (!(created >= shipped)) return false
    const plaidId = text(p.externalID)
    if (plaidId && firstByPlaidId.get(plaidId) !== a && firstByPlaidId.has(plaidId)) return true
    const bank = banks.get(text(p.bankConnectionID) ?? '')
    const connected = time(bank?.payload.createdAt)
    return Number.isFinite(connected) && created - connected > LATER_MS
  })
}

function keptIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(KEPT_KEY) ?? '[]') as string[]) } catch { return new Set() }
}

/** Accounts the household chose to show again: the repair never hides them. */
export function rememberKept(ids: string[]) {
  try { localStorage.setItem(KEPT_KEY, JSON.stringify([...new Set([...keptIds(), ...ids])])) } catch { /* private window */ }
}

/** Hides the stray accounts (isArchived, shared with every device). Returns what it hid. */
export async function hideStrayAccounts(records: Iterable<HouseholdRecord>): Promise<HouseholdRecord[]> {
  const stray = strayAccounts(records, keptIds())
  await pushRecords('account', stray.map((a) => ({ id: a.id, payload: { ...a.payload, isArchived: true } })))
  return stray
}

/** Undo: shows them again and never hides them again. */
export async function keepAccounts(list: HouseholdRecord[]): Promise<void> {
  rememberKept(list.map((a) => a.id))
  await pushRecords('account', list.map((a) => ({ id: a.id, payload: { ...a.payload, isArchived: false, repairKept: true } })))
}

/** What the repair hid this session, for the notice on Accounts and Investments (null: nothing to say). */
let lastHidden: HouseholdRecord[] | null = null
let ran: Promise<boolean> | null = null
const listeners = new Set<() => void>()

export function hiddenByRepair() {
  return lastHidden
}

export function onRepairChange(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function setHiddenByRepair(list: HouseholdRecord[] | null) {
  lastHidden = list?.length ? list : null
  for (const l of listeners) l()
}

/** Runs the repair once per page load. True when it hid something (the caller reloads). */
export function repairOnce(load: () => Promise<{ records: Map<string, HouseholdRecord> }>): Promise<boolean> {
  ran ??= (async () => {
    try {
      const hidden = await hideStrayAccounts((await load()).records.values())
      setHiddenByRepair(hidden)
      return hidden.length > 0
    } catch {
      ran = null // a read-only household or a network blip: try again on the next load
      return false
    }
  })()
  return ran
}

/** Tests only. */
export function resetRepair() {
  ran = null
  lastHidden = null
}
