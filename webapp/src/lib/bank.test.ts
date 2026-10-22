import { beforeEach, describe, expect, it, vi } from 'vitest'
import { annotations, clearAnnotations, saveBudgetNote, setAccountNote, setAnnotationUser, setTransactionNote } from './annotations'
import { rebuild, syncItemFull, toAccount, toTransaction } from './bank'
import { plaidCategory } from './categories'
import { supabase } from './supabase'

const invoke = vi.hoisted(() => vi.fn())
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

const item = { item_id: 'it-1', needs_sync: false, status: 'ok', institution_name: 'Chase', created_at: null }

describe('app-format mapping', () => {
  beforeEach(() => {
    localStorage.clear()
    setAnnotationUser('u1')
  })
  it('maps app accounts (cents, liabilities) and applies web edits', () => {
    setAccountNote('a1', { nickname: 'Bills', usage: 'business' })
    const a = toAccount({ account_id: 'a1', name: 'Checking', mask: '0000', type: 'credit', subtype: 'credit card', current_balance_cents: 12345, available_balance_cents: null, limit_cents: 500000, apr_basis_points: 2149, next_payment_amount_cents: 4000 }, item)
    expect(a).toMatchObject({ id: 'a1', nickname: 'Bills', usage: 'business', balance: 123.45, creditLimit: 5000, apr: 21.49, minimumPayment: 40, institution: 'Chase', itemId: 'it-1' })
  })
  it('maps app transactions with the app category mapper; edits win; usage follows the account', () => {
    const t = toTransaction({ transaction_id: 't1', account_id: 'a1', amount_cents: -1299, date: '2026-10-02', name: 'Netflix', pending: false, category_primary: 'ENTERTAINMENT', category_detailed: 'ENTERTAINMENT_TV_AND_MOVIES' }, new Map([['a1', 'business']]))
    expect(t).toMatchObject({ amount: -12.99, category: 'Entertainment', usage: 'business' })
    setTransactionNote('t1', { category: 'Subscriptions', usage: 'personal', notes: 'family plan' })
    expect(toTransaction(t.raw, new Map([['a1', 'business']]))).toMatchObject({ category: 'Subscriptions', usage: 'personal', notes: 'family plan' })
  })
  it('matches the app mapper', () => {
    expect(plaidCategory('INCOME', 'INCOME_WAGES')).toBe('Paycheck')
    expect(plaidCategory('LOAN_PAYMENTS', 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT')).toBe('Credit Card Payment')
    expect(plaidCategory('FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE')).toBe('Dining Out')
    expect(plaidCategory('TRAVEL', 'TRAVEL_FLIGHTS')).toBeUndefined()
  })
  it('keeps edits per user and can clear them', () => {
    saveBudgetNote('Groceries', 600)
    saveBudgetNote('groceries', 650)
    expect(annotations().budgets).toEqual([expect.objectContaining({ category: 'Groceries', amount: 650 })])
    setAnnotationUser('u2')
    expect(annotations().budgets).toEqual([])
    setAnnotationUser('u1')
    expect(annotations().budgets).toHaveLength(1)
    clearAnnotations()
    expect(annotations().budgets).toEqual([])
  })
  it('rebuilds models from raw sync results', () => {
    const { accounts, transactions } = rebuild([{ item, result: { accounts: [{ account_id: 'a1', name: 'X', type: 'depository', current_balance_cents: 100 }], transactions: [{ transaction_id: 't', account_id: 'a1', amount_cents: -5, date: '2026-10-01', name: 'Y' }] } }])
    expect(accounts[0].balance).toBe(1)
    expect(transactions[0].amount).toBe(-0.05)
  })
})

describe('plaid-sync paging', () => {
  it('pages from a null cursor, applies removals and drops replaced pendings', async () => {
    const pages = [
      { added: [{ transaction_id: 'p1', pending: true }, { transaction_id: 'x' }], modified: [], removed: [], accounts: [{ account_id: 'a' }], next_cursor: 'c1', has_more: true },
      { added: [{ transaction_id: 'posted', pending_transaction_id: 'p1' }], modified: [], removed: ['x'], accounts: [], next_cursor: 'c2', has_more: false },
    ]
    const bodies: unknown[] = []
    invoke.mockImplementation(async (_n: string, opts: { body: unknown }) => {
      bodies.push(opts?.body)
      return { data: pages.shift(), error: null }
    })
    void supabase
    const r = await syncItemFull('it-1')
    expect(r.transactions.map((t) => t.transaction_id)).toEqual(['posted'])
    expect(r.accounts).toEqual([{ account_id: 'a' }])
    expect(bodies).toEqual([{ item_id: 'it-1', cursor: null, platform: 'web' }, { item_id: 'it-1', cursor: 'c1', platform: 'web' }])
  })
})
