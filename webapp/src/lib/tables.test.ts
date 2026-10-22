import { describe, expect, it } from 'vitest'
import { normalizeAccount } from './schema'
import { isMissingTable, normalizeBudget, normalizeHoldings, normalizeItem, normalizeMember, normalizeRecurring } from './tables'

describe('optional tables', () => {
  it('recognizes a missing table', () => {
    expect(isMissingTable({ code: 'PGRST205' })).toBe(true)
    expect(isMissingTable({ code: '42P01' })).toBe(true)
    expect(isMissingTable({ message: "Could not find the table 'public.x' in the schema cache" })).toBe(true)
    expect(isMissingTable({ code: '42501', message: 'permission denied' })).toBe(false)
    expect(isMissingTable(null)).toBe(false)
  })
  it('derives connection health', () => {
    expect(normalizeItem({ id: 1, institution_name: 'Chase', status: 'good' }).health).toBe('ok')
    expect(normalizeItem({ id: 1, error_code: 'ITEM_LOGIN_REQUIRED' }).health).toBe('needs_reauth')
    expect(normalizeItem({ id: 1, status: 'pending_expiration' }).health).toBe('pending_expiration')
    expect(normalizeItem({ id: 1, error_code: 'INSTITUTION_DOWN' }).health).toBe('error')
    expect(normalizeItem({ id: 1, plaid_item_id: 'it', last_sync_at: '2026-10-01' })).toMatchObject({ itemId: 'it', lastSynced: '2026-10-01', institution: 'Bank' })
  })
  it('reads budgets, members, recurring', () => {
    expect(normalizeBudget({ id: 1, category_name: 'Dining', monthly_amount: '-300' })).toMatchObject({ category: 'Dining', amount: 300 })
    expect(normalizeMember({ id: 'm', role: 'admin', email: 'a@b.c' })).toMatchObject({ role: 'owner', name: 'a@b.c' })
    expect(normalizeMember({ id: 'm', role: 'read_only', display_name: 'Sam' })).toMatchObject({ role: 'viewer', name: 'Sam' })
    expect(normalizeRecurring({ id: 'r', merchant_name: 'Netflix', average_amount: 15.49, frequency: 'MONTHLY', predicted_next_date: '2026-11-03T00:00:00Z' })).toMatchObject({ name: 'Netflix', amount: 15.49, frequency: 'monthly', nextDate: '2026-11-03' })
  })
  it('joins holdings to securities and derives value', () => {
    const h = normalizeHoldings(
      [{ id: 'h1', security_id: 's1', quantity: 10, institution_price: 100 }, { id: 'h2', security_id: 's2', quantity: 2 }],
      [{ security_id: 's1', name: 'Vanguard Total', ticker_symbol: 'VTI' }, { security_id: 's2', name: 'Apple', ticker_symbol: 'AAPL', close_price: 200 }],
    )
    expect(h.map((x) => [x.ticker, x.value])).toEqual([['VTI', 1000], ['AAPL', 400]])
  })
  it('reads extended account fields', () => {
    const a = normalizeAccount({ id: 'l', type: 'loan', interest_rate: 0.0625, original_principal: '450000', origination_date: '2021-06-01T00:00:00Z', is_business: true, credit_limit: null })
    expect(a).toMatchObject({ apr: 6.25, originalPrincipal: 450000, originationDate: '2021-06-01', usage: 'business' })
    expect(a.creditLimit).toBeUndefined()
  })
})
