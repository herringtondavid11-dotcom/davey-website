import { describe, expect, it } from 'vitest'
import { addMonths, averages, budgetRows, cashFlow, isTransfer, monthLabel, summarize } from './budget'
import { normalizeTransaction } from './schema'
import { normalizeBudget } from './tables'

const t = (id: string, date: string, amount: number, category: string, extra = {}) => normalizeTransaction({ id, date, amount, category, ...extra })
const list = [
  t('1', '2026-10-02', -5000, 'Income'),
  t('2', '2026-10-03', 120, 'Groceries'),
  t('3', '2026-10-10', 80, 'Groceries'),
  t('4', '2026-10-11', 400, 'Dining'),
  t('5', '2026-10-12', 1000, 'Transfer'),
  t('6', '2026-10-15', 60, 'Software', { is_business: true }),
  t('7', '2026-09-15', 300, 'Groceries'),
  t('8', '2026-09-01', -4800, 'Income'),
]

describe('budget math', () => {
  it('treats transfers and card payments as neither income nor spending', () => {
    expect(isTransfer({ category: 'Transfer', name: '' })).toBe(true)
    expect(isTransfer({ category: undefined, name: 'CHASE CREDIT CRD AUTOPAY' })).toBe(true)
    expect(isTransfer({ category: 'Groceries', name: 'Transfer Market' })).toBe(false)
  })
  it('summarizes a month, optionally by usage', () => {
    const s = summarize(list, '2026-10')
    expect([s.income, s.spending, s.net]).toEqual([5000, 660, 4340])
    expect(s.byCategory.get('Groceries')).toBe(200)
    expect(summarize(list, '2026-10', 'business').spending).toBe(60)
  })
  it('compares budgets with actual spending, over-budget first', () => {
    const { rows, unbudgeted } = budgetRows(
      [normalizeBudget({ id: 'a', category: 'groceries', amount: 500 }), normalizeBudget({ id: 'b', category: 'Dining', amount: 300 })],
      summarize(list, '2026-10').byCategory,
    )
    expect(rows.map((r) => [r.category, r.spent, r.remaining, r.over])).toEqual([
      ['Dining', 400, -100, true],
      ['groceries', 200, 300, false],
    ])
    expect(unbudgeted).toEqual([{ category: 'Software', spent: 60 }])
  })
  it('builds a cash-flow series and averages over months with data', () => {
    const cf = cashFlow(list, '2026-10', 3)
    expect(cf.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(cf[1]).toMatchObject({ income: 4800, spending: 300, net: 4500 })
    const avg = averages(cf)
    expect(avg.income).toBe(4900)
    expect(avg.savingsRate).toBeCloseTo((9800 - 960) / 9800)
  })
  it('steps months across years and labels them', () => {
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(monthLabel('2026-10')).toBe('October 2026')
    expect(monthLabel('2026-10', 'short')).toBe('Oct')
  })
})
