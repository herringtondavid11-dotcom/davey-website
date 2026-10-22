import { describe, expect, it } from 'vitest'
import { normalizeAccount, normalizeTransaction, usageToRaw, writeColumn } from './schema'

describe('normalizeAccount', () => {
  it('reads Plaid-style columns', () => {
    const a = normalizeAccount({ id: 'a1', name: 'Plaid Checking', nickname: 'Bills', mask: '0000', type: 'depository', current_balance: '110.5', available_balance: 100, plaid_account_id: 'p1' })
    expect(a).toMatchObject({ id: 'a1', name: 'Plaid Checking', nickname: 'Bills', mask: '0000', type: 'depository', balance: 110.5, available: 100, plaidAccountId: 'p1', currency: 'USD' })
  })
  it('falls back to alternate column names', () => {
    const a = normalizeAccount({ id: 2, official_name: 'Card', display_name: 'Travel card', last4: '1234', account_type: 'Credit', balance: 50 })
    expect(a).toMatchObject({ id: '2', name: 'Card', nickname: 'Travel card', mask: '1234', type: 'credit', balance: 50 })
  })
})

describe('normalizeTransaction', () => {
  it('flips Plaid sign so spending is negative', () => {
    expect(normalizeTransaction({ id: 't', amount: 12.5, date: '2026-10-01' }).amount).toBe(-12.5)
    expect(normalizeTransaction({ id: 't', amount: -1000, date: '2026-10-01' }).amount).toBe(1000)
  })
  it('prefers merchant name and reads category shapes', () => {
    const t = normalizeTransaction({ id: 't', name: 'SQ *BLUE BOTTLE', merchant_name: 'Blue Bottle', category: ['Food and Drink', 'Coffee'], date: '2026-10-01T00:00:00Z' })
    expect(t).toMatchObject({ name: 'Blue Bottle', originalName: 'SQ *BLUE BOTTLE', category: 'Coffee', date: '2026-10-01' })
    expect(normalizeTransaction({ id: 't', personal_finance_category: { primary: 'FOOD_AND_DRINK' } }).category).toBe('Food And Drink')
  })
  it('reads business flags of either type', () => {
    expect(normalizeTransaction({ id: 't', is_business: true }).usage).toBe('business')
    expect(normalizeTransaction({ id: 't', classification: 'Business' }).usage).toBe('business')
    expect(normalizeTransaction({ id: 't' }).usage).toBe('personal')
  })
})

describe('writeColumn / usageToRaw', () => {
  it('writes to the column the row already has', () => {
    expect(writeColumn({ note: null }, ['notes', 'note'])).toBe('note')
    expect(writeColumn({}, ['notes', 'note'])).toBe('notes')
    expect(writeColumn(undefined, ['notes'])).toBe('notes')
  })
  it('matches the existing value type', () => {
    expect(usageToRaw('business', 'is_business', { is_business: false })).toBe(true)
    expect(usageToRaw('business', 'usage')).toBe('business')
    expect(usageToRaw('personal', 'tag', { tag: 'business' })).toBe('personal')
  })
})
