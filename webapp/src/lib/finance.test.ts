import { describe, expect, it } from 'vitest'
import { transactionPatch } from './data'
import { EMPTY_FILTER, categoryOptions, filterTransactions, groupAccounts, netWorth } from './finance'
import { displayName, maskLabel, money, shortDate } from './format'
import { newAccountsFromLink } from './linkFlow'
import { normalizeAccount, normalizeTransaction } from './schema'

const accounts = [
  normalizeAccount({ id: 'c', name: 'Checking', type: 'depository', current_balance: 5000, plaid_account_id: 'pc', mask: '1111', created_at: '2026-01-01T00:00:00Z' }),
  normalizeAccount({ id: 'cc', name: 'Visa', type: 'credit', current_balance: 1200, plaid_account_id: 'pcc', mask: '2222', created_at: '2026-10-20T10:00:00Z' }),
  normalizeAccount({ id: 'l', name: 'Mortgage', type: 'loan', current_balance: 300000, created_at: '2026-01-01T00:00:00Z' }),
  normalizeAccount({ id: 'i', name: 'Brokerage', type: 'investment', current_balance: 400000, created_at: '2026-01-01T00:00:00Z' }),
  normalizeAccount({ id: 'h', name: 'Old', type: 'depository', current_balance: 99, is_hidden: true }),
]

const txns = [
  normalizeTransaction({ id: '1', account_id: 'c', date: '2026-10-20', merchant_name: 'Whole Foods', amount: 84.2, category: 'Groceries', notes: 'weekly shop' }),
  normalizeTransaction({ id: '2', account_id: 'cc', date: '2026-10-18', merchant_name: 'Adobe', amount: 59.99, category: 'Subscriptions', is_business: true }),
  normalizeTransaction({ id: '3', account_id: 'c', date: '2026-10-15', name: 'Payroll', amount: -4200, category: 'Income' }),
]

describe('net worth', () => {
  it('subtracts credit and loans, skips hidden', () => {
    expect(netWorth(accounts)).toEqual({ assets: 405000, liabilities: 301200, net: 103800 })
  })
  it('groups accounts in app order', () => {
    expect(groupAccounts(accounts).map(([t]) => t)).toEqual(['depository', 'credit', 'investment', 'loan'])
  })
})

describe('filterTransactions', () => {
  const names = new Map([['c', 'Joint checking']])
  it('searches merchant, notes, account name and amount', () => {
    expect(filterTransactions(txns, { ...EMPTY_FILTER, search: 'whole' }).map((t) => t.id)).toEqual(['1'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, search: 'weekly' }).map((t) => t.id)).toEqual(['1'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, search: 'joint' }, names).map((t) => t.id)).toEqual(['1', '3'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, search: '59.99' }).map((t) => t.id)).toEqual(['2'])
  })
  it('filters by usage, account, category, direction and dates', () => {
    expect(filterTransactions(txns, { ...EMPTY_FILTER, usage: 'business' }).map((t) => t.id)).toEqual(['2'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, usage: 'personal' }).map((t) => t.id)).toEqual(['1', '3'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, accountId: 'cc' }).map((t) => t.id)).toEqual(['2'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, category: 'Income' }).map((t) => t.id)).toEqual(['3'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, direction: 'in' }).map((t) => t.id)).toEqual(['3'])
    expect(filterTransactions(txns, { ...EMPTY_FILTER, from: '2026-10-16', to: '2026-10-19' }).map((t) => t.id)).toEqual(['2'])
  })
  it('offers default and seen categories', () => {
    const opts = categoryOptions([...txns, normalizeTransaction({ id: '9', category: 'Boat' })])
    expect(opts).toContain('Boat')
    expect(opts).toContain('Groceries')
    expect(new Set(opts).size).toBe(opts.length)
  })
})

describe('transactionPatch', () => {
  it('only patches changed fields to existing columns', () => {
    const t = normalizeTransaction({ id: '1', amount: 1, user_category: null, note: 'x', is_business: false })
    expect(transactionPatch(t, { category: 'Dining', notes: '  ', usage: 'business' })).toEqual({ user_category: 'Dining', note: null, is_business: true })
    expect(transactionPatch(t, { notes: 'hi' })).toEqual({ note: 'hi' })
  })
})

describe('format', () => {
  it('formats money, names, masks and dates', () => {
    expect(money(-1234.5)).toBe('-$1,234.50')
    expect(money(20, 'USD', { sign: true })).toBe('+$20.00')
    expect(displayName({ nickname: '  ', name: 'Checking' })).toBe('Checking')
    expect(displayName({ nickname: 'Bills', name: 'Checking' })).toBe('Bills')
    expect(maskLabel('123456')).toBe('•••• 3456')
    expect(maskLabel()).toBe('')
    expect(shortDate('2026-10-21', new Date(2026, 5, 1))).toBe('Oct 21')
    expect(shortDate('2025-01-02', new Date(2026, 5, 1))).toBe('Jan 2, 2025')
  })
})

describe('newAccountsFromLink', () => {
  it('matches Plaid account ids first', () => {
    expect(newAccountsFromLink(accounts, { accounts: [{ id: 'pcc' }] }).map((a) => a.id)).toEqual(['cc'])
  })
  it('falls back to accounts created since Link started', () => {
    expect(newAccountsFromLink(accounts, { accounts: [{ id: 'unknown' }] }, '2026-10-20T10:00:30Z').map((a) => a.id)).toEqual(['cc'])
  })
  it('falls back to masks', () => {
    expect(newAccountsFromLink(accounts, { accounts: [{ id: 'x', mask: '1111' }] }).map((a) => a.id)).toEqual(['c'])
  })
})
