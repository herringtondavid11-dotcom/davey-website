import { describe, expect, it } from 'vitest'
import { normalizeTransaction } from './schema'
import { businessTransactions, estimateTax, findDeductions, groupDeductions, pnl, quarterly, quarters } from './tax'

const t = (id: string, date: string, amount: number, category: string, biz: boolean, name = 'X') => normalizeTransaction({ id, date, amount, category, is_business: biz, merchant_name: name })
const list = [
  t('1', '2026-02-10', -12000, 'Income', true, 'Client A'),
  t('2', '2026-02-12', 1200, 'Software', true, 'Adobe'),
  t('3', '2026-07-01', -8000, 'Income', true, 'Client B'),
  t('4', '2026-07-03', 800, 'Travel', true, 'Delta'),
  t('5', '2026-07-04', 2000, 'Transfer', true, 'Owner draw'),
  t('6', '2025-12-30', -5000, 'Income', true),
  t('7', '2026-03-03', 59.99, 'Subscriptions', false, 'Canva'),
  t('8', '2026-03-04', 45, 'Dining', false, 'Chipotle'),
  t('9', '2026-03-05', 120, 'Office Supplies', false, 'Target'),
]

describe('tax', () => {
  const biz = businessTransactions(list, 2026)
  it('selects business transactions for the year, excluding transfers', () => {
    expect(biz.map((x) => x.id)).toEqual(['1', '2', '3', '4'])
  })
  it('builds a P&L', () => {
    expect(pnl(biz)).toMatchObject({ income: 20000, expenses: 2000, net: 18000 })
    expect(pnl(biz).byCategory[0]).toEqual({ category: 'Software', amount: 1200 })
  })
  it('estimates SE + income tax', () => {
    const e = estimateTax(18000, { federal: 0.22, state: 0.05 })
    expect(e.selfEmployment).toBeCloseTo(18000 * 0.9235 * 0.153, 2)
    expect(e.federal).toBeCloseTo((18000 - e.selfEmployment / 2) * 0.22, 2)
    expect(e.total).toBeCloseTo(e.selfEmployment + e.federal + e.state, 6)
    expect(estimateTax(-500, { federal: 0.22, state: 0 }).total).toBe(0)
  })
  it('uses IRS payment periods and due dates', () => {
    expect(quarters(2026).map((q) => q.due)).toEqual(['2026-04-15', '2026-06-15', '2026-09-15', '2027-01-15'])
    const q = quarterly(biz, 2026, { federal: 0.22, state: 0 })
    expect(q.map((x) => x.profit)).toEqual([10800, 0, 7200, 0])
  })
  it('finds likely deductions in personal spending', () => {
    expect(findDeductions(list, 2026).map((d) => d.t.id)).toEqual(['9', '7'])
  })
  it('groups deduction hints by merchant, ignoring entertainment subscriptions', () => {
    const more = [...list, t('10', '2026-04-03', 59.99, 'Subscriptions', false, 'Canva'), t('11', '2026-04-03', 15.49, 'Subscriptions', false, 'Netflix')]
    const g = groupDeductions(findDeductions(more, 2026))
    expect(g.map((x) => [x.name, x.items.length, x.total])).toEqual([['Target', 1, 120], ['Canva', 2, 119.98]])
  })
})
