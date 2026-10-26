// The one-time repair hides only what a web sync added by mistake, and never what the household made or edited.
import { describe, expect, it } from 'vitest'
import { strayAccounts } from './repairAccounts'
import type { HouseholdRecord } from './serverData'

const rec = (entity: string, id: string, payload: Record<string, unknown>): HouseholdRecord => ({ household_id: 'h', entity, id, payload, updated_at: '2026-10-26T00:00:00Z' })
const bank = rec('bankConnection', 'bank-rj', { itemID: 'item-rj', institutionName: 'Raymond James', createdAt: '2026-09-01T00:00:00Z' })
const newBank = rec('bankConnection', 'bank-new', { itemID: 'item-new', institutionName: 'Summit Bank', createdAt: '2026-10-26T01:00:00Z' })
const plaid = (id: string, extra: Record<string, unknown>) => rec('account', id, { source: 'plaid', type: 'investment', bankConnectionID: 'bank-rj', ...extra })

describe('strayAccounts', () => {
  const manual = rec('account', 'manual-ira', { source: 'manual', name: 'Roth IRA', createdAt: '2026-09-02T00:00:00Z' })
  const linked = plaid('linked', { externalID: 'p-1', createdAt: '2026-09-01T00:05:00Z' })
  const added = plaid('added', { externalID: 'p-2', createdAt: '2026-10-25T22:00:00Z', name: 'Roth IRA' })
  const copy = plaid('copy', { externalID: 'p-1', bankConnectionID: null, createdAt: '2026-10-25T23:00:00Z' })
  const fresh = plaid('fresh', { externalID: 'p-9', bankConnectionID: 'bank-new', createdAt: '2026-10-26T01:02:00Z' })
  const named = plaid('named', { externalID: 'p-3', createdAt: '2026-10-25T22:00:00Z', nickname: 'Kids' })
  const before = plaid('before', { externalID: 'p-4', createdAt: '2026-10-20T00:00:00Z' })
  const hidden = plaid('hidden', { externalID: 'p-5', createdAt: '2026-10-25T22:00:00Z', isArchived: true })
  const all = [bank, newBank, manual, linked, added, copy, fresh, named, before, hidden]

  it('finds accounts a sync added after the bank was connected, and later copies of a Plaid account', () => {
    expect(strayAccounts(all).map((a) => a.id).sort()).toEqual(['added', 'copy'])
  })

  it('leaves manual, edited, older, already hidden and newly connected accounts alone', () => {
    const ids = strayAccounts(all).map((a) => a.id)
    for (const id of ['manual-ira', 'linked', 'fresh', 'named', 'before', 'hidden']) expect(ids).not.toContain(id)
  })

  it('never hides one the household chose to keep', () => {
    expect(strayAccounts(all, new Set(['added'])).map((a) => a.id)).toEqual(['copy'])
    expect(strayAccounts([bank, plaid('kept', { externalID: 'p-7', createdAt: '2026-10-25T22:00:00Z', repairKept: true })])).toEqual([])
  })
})
