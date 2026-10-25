// A reconnect on the web must bring the bank up to date everywhere (PenFed, 2026-10-25), and connecting the same bank
// again must update the existing accounts instead of adding a second copy.
import { describe, expect, it } from 'vitest'
import { findSameBank, refreshRecords } from './refreshBank'
import type { SyncPage } from './importBank'
import type { DaveyData, HouseholdRecord } from './serverData'

const rec = (entity: string, id: string, payload: Record<string, unknown>): HouseholdRecord => ({
  household_id: 'house-1', entity, id, payload, updated_at: '2026-10-20T10:00:00Z',
})
const bank = rec('bankConnection', 'bank-penfed', { itemID: 'item-old', institutionName: 'PenFed Credit Union', institutionID: 'ins_penfed', cursor: 'cursor-1', status: 'needsReauth', lastSyncedAt: '2026-10-10T00:00:00Z' })
const checking = rec('account', 'acc-checking', { name: 'Access America Checking', type: 'checking', mask: '1234', externalID: 'plaid-chk-old', bankConnectionID: 'bank-penfed', startingBalance: 100_000 })
const card = rec('account', 'acc-card', { name: 'Power Cash Rewards', type: 'creditCard', mask: '5678', externalID: 'plaid-card-old', bankConnectionID: 'bank-penfed', startingBalance: -20_000 })
const oldTx = rec('transaction', 'tx-1', { accountID: 'acc-checking', amount: -4_250, date: '2026-10-08T07:00:00.000Z', payee: 'Grocer', externalID: 'plaid-t1-old', categoryID: 'cat-food', note: 'weekly', isPending: false })
const pendingTx = rec('transaction', 'tx-2', { accountID: 'acc-checking', amount: -1_000, date: '2026-10-09T07:00:00.000Z', payee: 'Coffee', externalID: 'plaid-t2-old', isPending: true })
const acct = (id: string, mask: string, type: string, subtype: string, current: number) => ({ account_id: id, name: 'x', mask, type, subtype, current_balance_cents: current, available_balance_cents: current, limit_cents: null })
const tx = (id: string, account: string, amount: number, date: string, name: string, pending = false) => ({ transaction_id: id, account_id: account, amount_cents: amount, date, name, pending })
const ids = () => { let n = 0; return () => `new-${++n}` }

describe('reconnect (update mode): the same Item, from its cursor', () => {
  const page: SyncPage = {
    added: [tx('plaid-t3', 'plaid-chk-old', -2_500, '2026-10-24', 'Gas Station')],
    modified: [tx('plaid-t2-old', 'plaid-chk-old', -1_050, '2026-10-09', 'Coffee', false)],
    removed: [],
    accounts: [acct('plaid-chk-old', '1234', 'depository', 'checking', 250_000), acct('plaid-card-old', '5678', 'credit', 'credit card', 30_000)],
    next_cursor: 'cursor-2', has_more: false,
  }
  const changes = refreshRecords({ bank, accounts: [checking, card], transactions: [oldTx, pendingTx], pages: [page], categoryIdByName: new Map([['Gas', 'cat-gas']]), now: new Date('2026-10-25T04:00:00Z'), newId: ids() })
  const byId = new Map(changes.map((c) => [c.id, c]))

  it('marks the connection OK with the new cursor and the time', () => {
    expect(changes[0]).toMatchObject({ entity: 'bankConnection', id: 'bank-penfed', payload: { status: 'ok', cursor: 'cursor-2', itemID: 'item-old', lastSyncedAt: '2026-10-25T04:00:00.000Z' } })
  })

  it('adds new transactions, updates changed ones and keeps the category and note', () => {
    expect(byId.get('new-1')?.payload).toMatchObject({ amount: -2_500, payee: 'Gas Station', accountID: 'acc-checking', categoryID: null })
    expect(byId.get('tx-2')?.payload).toMatchObject({ amount: -1_050, isPending: false })
    expect(byId.has('tx-1')).toBe(false) // unchanged
  })

  it('sets balances to the bank\'s (debts negated)', () => {
    // Checking: 2,500.00 at the bank; transactions now −42.50 −10.50 −25.00.
    expect(byId.get('acc-checking')?.payload.startingBalance).toBe(250_000 - (-4_250 - 1_050 - 2_500))
    expect(byId.get('acc-card')?.payload.startingBalance).toBe(-30_000)
  })

  it('never saves an empty cursor (history not ready yet)', () => {
    const empty = refreshRecords({ bank, accounts: [checking], transactions: [], pages: [{ ...page, added: [], modified: [], next_cursor: '' as unknown as string }], categoryIdByName: new Map() })
    expect(empty[0].payload.cursor).toBe('cursor-1')
  })

  it('deletes removed transactions', () => {
    const removed = refreshRecords({ bank, accounts: [checking], transactions: [oldTx], pages: [{ ...page, added: [], modified: [], removed: ['plaid-t1-old'] }], categoryIdByName: new Map() })
    expect(removed.find((c) => c.id === 'tx-1')).toMatchObject({ deleted: true })
  })
})

describe('the same bank connected again as a new Item', () => {
  const data: DaveyData = { accounts: [], transactions: [], budgets: [], connections: [], accountCategories: [], records: new Map([bank, checking, card, oldTx].map((r) => [`${r.entity}:${r.id}`, r])) }

  it('is found by institution and a shared account mask', () => {
    expect(findSameBank(data, 'ins_penfed', 'item-new', ['1234'])?.id).toBe('bank-penfed')
    expect(findSameBank(data, 'ins_penfed', 'item-new', ['9999'])).toBeNull()
    expect(findSameBank(data, 'ins_other', 'item-new', ['1234'])).toBeNull()
    expect(findSameBank(data, 'ins_penfed', 'item-old', ['1234'])).toBeNull()
  })

  it('moves the existing connection and accounts onto the new Item without duplicating transactions', () => {
    const page: SyncPage = {
      // The new Item reports the old grocery charge again under a new ID, plus one new charge.
      added: [tx('plaid-t1-new', 'plaid-chk-new', -4_250, '2026-10-08', 'GROCER #12'), tx('plaid-t9', 'plaid-chk-new', -999, '2026-10-24', 'Pharmacy')],
      modified: [], removed: [],
      accounts: [acct('plaid-chk-new', '1234', 'depository', 'checking', 200_000)],
      next_cursor: 'cursor-new', has_more: false,
    }
    const changes = refreshRecords({ bank, accounts: [checking, card], transactions: [oldTx], pages: [page], categoryIdByName: new Map(), newItemId: 'item-new', newId: ids() })
    expect(changes[0].payload).toMatchObject({ itemID: 'item-new', status: 'ok', cursor: 'cursor-new' })
    const accounts = changes.filter((c) => c.entity === 'account')
    expect(accounts.map((a) => a.id)).toEqual(['acc-checking']) // same Davey account, no new one
    expect(accounts[0].payload.externalID).toBe('plaid-chk-new')
    const transactions = changes.filter((c) => c.entity === 'transaction')
    expect(transactions.find((t) => t.id === 'tx-1')?.payload).toMatchObject({ externalID: 'plaid-t1-new', categoryID: 'cat-food', note: 'weekly' })
    expect(transactions.filter((t) => t.id.startsWith('new-'))).toHaveLength(1) // only the pharmacy charge is new
  })
})

describe('checking flagged connections (SoFi / PenFed badges, 2026-10-25)', () => {
  it('checks each connection at most every 10 minutes', async () => {
    const { dueForCheck, checkConnections, resetConnectionChecks } = await import('./refreshBank')
    resetConnectionChecks()
    expect(dueForCheck('item-x')).toBe(true)
    // No bank record for the Item: nothing is synced, and it says why.
    const data = { records: new Map() } as unknown as DaveyData
    const problems = await checkConnections(['item-x'], async () => data)
    expect(problems.get('item-x')).toMatch(/isn't shared/)
    expect(dueForCheck('item-x')).toBe(false)
    expect(dueForCheck('item-x', Date.now() + 10 * 60_000)).toBe(true)
  })
})

describe('Refresh all wording (same as the app: BankSyncService.balanceNote)', () => {
  it('says which balances came back', async () => {
    const { balanceNote } = await import('./refreshBank')
    expect(balanceNote(true, 'live')).toBe('Live balance from the bank')
    expect(balanceNote(false, 'recent')).toBe('Checked live in the last 5 minutes; showing that balance')
    expect(balanceNote(false, 'unavailable')).toBe("The bank didn't answer a live check; showing Plaid's latest balance")
    expect(balanceNote(false, 'off')).toBe("Plaid's latest balance (live checks are off)")
    expect(balanceNote(false)).toBe("Plaid's latest balance (live checks are off)")
  })
})
