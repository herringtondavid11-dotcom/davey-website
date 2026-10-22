import { describe, expect, it } from 'vitest'
import { daveyAccountType, defaultCategoryName, importRecords, plaidDay, type SyncPage } from './importBank'
import { toRows, type HouseholdRecord } from './serverData'
import { normalizeAccount, normalizeTransaction } from './schema'

const page = (over: Partial<SyncPage>): SyncPage => ({ added: [], modified: [], removed: [], accounts: [], next_cursor: null, has_more: false, ...over })

describe('web bank import (mirrors PlaidImporter.swift)', () => {
  let n = 0
  const records = importRecords({
    itemId: 'item-9',
    institutionName: 'First Platypus Bank',
    institutionId: 'ins_109508',
    categoryIdByName: new Map([['Groceries', 'cat-groc'], ['Paycheck', 'cat-pay']]),
    now: new Date('2026-10-22T08:00:00Z'),
    newId: () => `id-${++n}`,
    pages: [
      page({
        accounts: [
          { account_id: 'p-check', name: 'Plaid Checking', mask: '0000', type: 'depository', subtype: 'checking', current_balance_cents: 11_000, available_balance_cents: 10_000 },
          { account_id: 'p-card', name: 'Plaid Credit Card', mask: '3333', type: 'credit', subtype: 'credit card', current_balance_cents: 41_000, available_balance_cents: null, limit_cents: 200_000 },
        ],
        added: [
          { transaction_id: 'tx-a', account_id: 'p-check', amount_cents: -5_000, date: '2026-10-20', name: 'Grocer', pending: false, category_primary: 'FOOD_AND_DRINK', category_detailed: 'FOOD_AND_DRINK_GROCERIES' },
          { transaction_id: 'tx-b', account_id: 'p-check', amount_cents: 100_000, date: '2026-10-15', name: 'Payroll', pending: false, category_detailed: 'INCOME_WAGES' },
          { transaction_id: 'tx-c', account_id: 'p-card', amount_cents: -2_000, date: '2026-10-19', name: 'Cafe', pending: true, category_primary: 'TRAVEL' },
          { transaction_id: 'tx-gone', account_id: 'p-card', amount_cents: -1, date: '2026-10-18', name: 'Pending', pending: true },
        ],
        next_cursor: 'cursor-1',
        has_more: true,
      }),
      page({ removed: ['tx-gone'], next_cursor: 'cursor-2' }),
    ],
  })

  it('creates one bank connection with the last cursor', () => {
    const bank = records.filter((r) => r.entity === 'bankConnection')
    expect(bank).toHaveLength(1)
    expect(bank[0].payload).toMatchObject({ itemID: 'item-9', institutionName: 'First Platypus Bank', cursor: 'cursor-2', status: 'ok' })
  })

  it('sets starting balances so starting balance + transactions = the bank balance (liabilities negative)', () => {
    const accounts = records.filter((r) => r.entity === 'account')
    const check = accounts.find((a) => a.payload.externalID === 'p-check')!.payload
    const card = accounts.find((a) => a.payload.externalID === 'p-card')!.payload
    expect(check.type).toBe('checking')
    expect(check.startingBalance).toBe(11_000 - (100_000 - 5_000))
    expect(card.type).toBe('creditCard')
    expect(card.startingBalance).toBe(-41_000 - -2_000)
    expect(card.creditLimit).toBe(200_000)
    expect(check.bankConnectionID).toBe('id-1')
  })

  it('imports transactions with the app sign, default categories, and drops removed ones', () => {
    const tx = records.filter((r) => r.entity === 'transaction').map((r) => r.payload)
    expect(tx.map((t) => t.externalID).sort()).toEqual(['tx-a', 'tx-b', 'tx-c'])
    expect(tx.find((t) => t.externalID === 'tx-a')).toMatchObject({ amount: -5_000, categoryID: 'cat-groc', source: 'plaid' })
    expect(tx.find((t) => t.externalID === 'tx-b')?.categoryID).toBe('cat-pay')
    expect(tx.find((t) => t.externalID === 'tx-c')).toMatchObject({ categoryID: null, isPending: true })
  })

  it('round-trips through the household adapter to the bank balances', () => {
    const asRecords: HouseholdRecord[] = records.map((r) => ({ ...r, household_id: 'h', updated_at: 'x' }))
    const rows = toRows({
      accounts: asRecords.filter((r) => r.entity === 'account'),
      transactions: asRecords.filter((r) => r.entity === 'transaction'),
      categories: [], connections: asRecords.filter((r) => r.entity === 'bankConnection'), budgets: [],
    })
    const accounts = rows.accounts.map(normalizeAccount)
    expect(accounts.find((a) => a.plaidAccountId === 'p-check')?.balance).toBe(110)
    expect(accounts.find((a) => a.plaidAccountId === 'p-card')?.balance).toBe(410)
    const tx = rows.transactions.map(normalizeTransaction)
    expect(tx.find((t) => t.name === 'Grocer')?.accountId).toBe('p-check')
    expect(tx.find((t) => t.name === 'Grocer')?.amount).toBe(-50)
  })

  it('type and category mapping, local-midnight days', () => {
    expect(daveyAccountType('depository', 'money market')).toBe('savings')
    expect(daveyAccountType('brokerage', null)).toBe('investment')
    expect(daveyAccountType('loan', 'mortgage')).toBe('loan')
    expect(defaultCategoryName('FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE')).toBe('Dining Out')
    expect(defaultCategoryName('TRAVEL', null)).toBeUndefined()
    const d = new Date(plaidDay('2026-10-20'))
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 20, 0])
  })
})
