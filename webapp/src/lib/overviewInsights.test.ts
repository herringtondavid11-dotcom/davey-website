import { describe, expect, it } from 'vitest'
import { categoryComparison, netWorthSeries, rangeStart, week } from './overviewInsights'
import type { Account, Transaction } from './schema'

const tx = (id: string, date: string, amount: number, name = id, category?: string, accountId = 'chk'): Transaction =>
  ({ id, date, amount, name, category, accountId, usage: 'personal', pending: false, currency: 'USD', raw: {} }) as Transaction

// The same rules as the app's OverviewInsightsTests.swift.
describe('overview insights', () => {
  const now = new Date(2026, 9, 22, 12)

  it('this week counts seven days without transfers', () => {
    const w = week([
      tx('pay', '2026-10-20', 2000, 'Payroll'),
      tx('groc', '2026-10-21', -120, 'Grocer'),
      tx('cafe', '2026-10-16', -45, 'Cafe'),
      tx('rent', '2026-10-15', -900, 'Old rent'),
      tx('xfer', '2026-10-19', -500, 'To savings', 'Transfer'),
      tx('gas', '2026-10-22', -60, 'Gas'),
    ], now)
    expect(w.moneyIn).toBe(2000)
    expect(w.moneyOut).toBe(225)
    expect(w.biggest.map((b) => b.name)).toEqual(['Grocer', 'Gas', 'Cafe'])
  })

  it('net worth ranges start where expected', () => {
    expect(rangeStart('YTD', now)).toBe('2026-01-01')
    expect(rangeStart('3M', now)).toBe('2026-07-22')
    expect(rangeStart('ALL', now, '2026-01-05')).toBe('2026-01-05')
    expect(rangeStart('ALL', now)).toBe('2026-09-22')
  })

  it('net worth history undoes later transactions', () => {
    const accounts = [
      { id: 'chk', name: 'Checking', type: 'depository', balance: 1000, currency: 'USD', hidden: false, usage: 'personal', raw: {} },
      { id: 'card', name: 'Card', type: 'credit', balance: 200, currency: 'USD', hidden: false, usage: 'personal', raw: {} },
    ] as Account[]
    // Paid 500 on Oct 10 (in), spent 200 on the card Oct 20.
    const series = netWorthSeries(accounts, [tx('in', '2026-10-10', 500), tx('buy', '2026-10-20', -200, 'Buy', undefined, 'card')], '2026-10-01', now, 22)
    expect(series[0]).toEqual({ date: '2026-10-01', net: 500 })
    expect(series.find((p) => p.date === '2026-10-15')?.net).toBe(1000)
    expect(series[series.length - 1]).toEqual({ date: '2026-10-22', net: 800 })
  })

  it('compares categories with last month up to the same day', () => {
    const changes = categoryComparison([
      tx('a', '2026-10-05', -300, 'Grocer', 'Groceries'),
      tx('b', '2026-09-05', -200, 'Grocer', 'Groceries'),
      tx('c', '2026-09-28', -999, 'Grocer', 'Groceries'), // after Sep 22: not counted
      tx('d', '2026-10-06', -50, 'Cinema', 'Entertainment'),
      tx('e', '2026-10-07', -1000, 'Move', 'Transfer'),
    ], now)
    expect(changes).toEqual([
      { name: 'Groceries', thisMonth: 300, lastMonth: 200, change: 0.5 },
      { name: 'Entertainment', thisMonth: 50, lastMonth: 0, change: undefined },
    ])
  })
})
