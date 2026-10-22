import { describe, expect, it } from 'vitest'
import { localDay, toRows, webAccountType, type HouseholdRecord } from './serverData'
import { netWorth } from './finance'
import { normalizeAccount, normalizeTransaction } from './schema'

const H = 'house-1'
const rec = (entity: string, id: string, payload: Record<string, unknown>): HouseholdRecord => ({
  household_id: H, entity, id, payload, updated_at: '2026-10-20T10:00:00Z',
})

// Payloads in the app's HouseholdSyncCodec format (minor units, negative = money out).
const input = {
  accounts: [
    rec('account', 'a-check', { name: 'Everyday Checking', type: 'checking', startingBalance: 100_000, mask: '1234',
      bankConnectionID: 'c-1', isBusiness: false, isArchived: false, nickname: 'Bills' }),
    rec('account', 'a-card', { name: 'Northstar Card', type: 'creditCard', startingBalance: -20_000, creditLimit: 500_000,
      aprBasisPoints: 2399, isBusiness: true }),
    rec('account', 'a-old', { name: 'Old Savings', type: 'savings', startingBalance: 5_000, isArchived: true }),
  ],
  transactions: [
    rec('transaction', 't-1', { accountID: 'a-check', amount: -4_250, payee: 'Grocer', date: '2026-10-19T07:00:00Z',
      categoryID: 'cat-food', note: 'weekly', isPending: false }),
    rec('transaction', 't-2', { accountID: 'a-check', amount: 250_000, payee: 'Payroll', date: '2026-10-15T07:00:00Z' }),
    rec('transaction', 't-3', { accountID: 'a-card', amount: -10_000, payee: 'Office Supply', date: '2026-10-18T07:00:00Z' }),
  ],
  categories: [rec('category', 'cat-food', { name: 'Groceries', kind: 'expense' })],
  connections: [rec('bankConnection', 'c-1', { institutionName: 'Summit Bank', itemID: 'item-1', status: 'needsReauth',
    lastSyncedAt: '2026-10-20T09:00:00Z' })],
  budgets: [rec('budget', 'b-1', { categoryID: 'cat-food', limit: 60_000, monthKey: 202610 })],
}

describe('household records → web rows', () => {
  const data = toRows(input)
  const accounts = data.accounts.map(normalizeAccount)
  const tx = data.transactions.map(normalizeTransaction)

  it('computes balances like the app: starting balance plus transactions, in dollars', () => {
    const check = accounts.find((a) => a.id === 'a-check')!
    expect(check.balance).toBe(1000 - 42.5 + 2500)
    expect(check.nickname).toBe('Bills')
    expect(check.institution).toBe('Summit Bank')
    expect(check.itemId).toBe('item-1')
    expect(check.type).toBe('depository')
  })

  it('maps cards as liabilities with limit and APR, and archived accounts as hidden', () => {
    const card = accounts.find((a) => a.id === 'a-card')!
    expect(card.type).toBe('credit')
    expect(card.balance).toBe(300)
    expect(card.creditLimit).toBe(5000)
    expect(card.apr).toBe(23.99)
    expect(card.usage).toBe('business')
    expect(accounts.find((a) => a.id === 'a-old')!.hidden).toBe(true)
    expect(netWorth(accounts)).toEqual({ assets: 3457.5, liabilities: 300, net: 3157.5 })
  })

  it('keeps the money-out sign, names categories, inherits Business from the account, newest first', () => {
    expect(tx.map((t) => t.id)).toEqual(['t-1', 't-3', 't-2'])
    const grocer = tx[0]
    expect(grocer.amount).toBe(-42.5)
    expect(grocer.category).toBe('Groceries')
    expect(grocer.notes).toBe('weekly')
    expect(tx.find((t) => t.id === 't-2')!.amount).toBe(2500)
    expect(tx.find((t) => t.id === 't-3')!.usage).toBe('business')
  })

  it('budgets and bank connections', () => {
    expect(data.budgets).toEqual([{ id: 'b-1', category: 'Groceries', amount: 600, month_key: 202610, household_id: H }])
    expect(data.connections[0]).toMatchObject({ institution_name: 'Summit Bank', status: 'login_required' })
    expect(data.records.get('transaction:t-1')?.payload.payee).toBe('Grocer')
  })

  it('account types and local days', () => {
    expect(['checking', 'savings', 'cash', 'creditCard', 'loan', 'otherLiability', 'investment', 'crypto', 'property']
      .map(webAccountType)).toEqual(['depository', 'depository', 'depository', 'credit', 'loan', 'loan', 'investment', 'investment', 'other'])
    expect(localDay('2026-10-19T07:00:00Z')).toMatch(/^2026-10-(18|19)$/)
    expect(localDay(undefined)).toBeUndefined()
  })
})
