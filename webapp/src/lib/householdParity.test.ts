// Household parity (2026-10-24): the owner and a household member read the same rows (RLS: household members), so
// the web must turn them into the same balances and history the iPhone/Mac show. Investment accounts with holdings are
// worth their holdings (linked: the server's investment_holdings; manual: the shared "holding" records), and manual
// accounts' daily values come from the shared "investmentSnapshot" records.
import { describe, expect, it } from 'vitest'
import { holdingRows, holdingValues, snapshotRows, toRows, type HouseholdRecord } from './serverData'
import { normalizeAccount } from './schema'
import { normalizeHoldings } from './tables'
import { normalizeSnapshots, portfolioSeries } from './investments'

const rec = (entity: string, id: string, payload: Record<string, unknown>): HouseholdRecord => ({
  household_id: 'house-1', entity, id, payload, updated_at: '2026-10-24T10:00:00Z',
})

const accounts = [
  rec('account', 'a-brokerage', { name: 'Joint Brokerage', type: 'investment', startingBalance: 0, externalID: 'acc-joint', bankConnectionID: 'c-1' }),
  rec('account', 'a-coins', { name: 'Gold & Coins', type: 'investment', startingBalance: 0 }),
  rec('account', 'a-check', { name: 'Checking', type: 'checking', startingBalance: 50_000 }),
]
const connections = [rec('bankConnection', 'c-1', { itemID: 'item-schwab', institutionName: 'Charles Schwab' })]
const serverHoldings = [
  { account_id: 'acc-joint', quantity: 100, institution_price: 300, institution_value: 30_000 },
  { account_id: 'acc-joint', quantity: 1_250, institution_price: 1, institution_value: 1_250 },
]
const holdingRecords = [rec('holding', 'h-1', { accountID: 'a-coins', ticker: 'GOLD', name: 'Coins', quantity: 2.5, value: 600_000, costBasis: 500_000, assetClass: 'other' })]
const snapshotRecords = [
  rec('investmentSnapshot', 's-1', { accountID: 'a-coins', date: '2026-10-01T07:00:00Z', value: 580_000, netFlow: 0, isEstimated: false }),
  rec('investmentSnapshot', 's-2', { accountID: 'a-coins', date: '2026-10-20T07:00:00Z', value: 600_000, netFlow: 0, isEstimated: false }),
]

function render() {
  const data = toRows({ accounts, transactions: [], categories: [], connections, budgets: [], holdingValues: holdingValues(serverHoldings, holdingRecords) })
  return data.accounts.map(normalizeAccount)
}

describe('household parity on the web', () => {
  it('values investment accounts by their holdings, like the app', () => {
    const rows = render()
    expect(rows.find((a) => a.id === 'a-brokerage')!.balance).toBe(31_250)
    expect(rows.find((a) => a.id === 'a-coins')!.balance).toBe(6_000)
    expect(rows.find((a) => a.id === 'a-check')!.balance).toBe(500)
  })

  it('owner and member get identical totals from the same household rows', () => {
    const owner = render(), member = render()
    expect(member.map((a) => [a.id, a.balance])).toEqual(owner.map((a) => [a.id, a.balance]))
  })

  it('shared manual holdings and daily values become the rows the Investments screen reads', () => {
    const holdings = normalizeHoldings(holdingRows(holdingRecords), [])
    expect(holdings).toHaveLength(1)
    expect(holdings[0]).toMatchObject({ accountId: 'a-coins', ticker: 'GOLD', quantity: 2.5, value: 6_000, costBasis: 5_000, type: 'other' })
    const series = portfolioSeries(normalizeSnapshots(snapshotRows(snapshotRecords)), new Set(['a-coins']))
    expect(series.map((p) => p.value)).toEqual([5_800, 6_000])
  })

  it('an investment account without holdings keeps starting balance plus transactions', () => {
    const data = toRows({ accounts: [rec('account', 'a-new', { name: 'New IRA', type: 'investment', startingBalance: 12_345 })], transactions: [], categories: [], connections: [], budgets: [], holdingValues: new Map() })
    expect(normalizeAccount(data.accounts[0]).balance).toBe(123.45)
  })
})
