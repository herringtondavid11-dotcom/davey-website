import { describe, expect, it } from 'vitest'
import { detectRecurring, merchantKey, mergeStored, occurrencesInMonth, step } from './recurring'
import { normalizeTransaction } from './schema'

const tx = (id: string, date: string, name: string, amount: number, category?: string) => normalizeTransaction({ id, date, merchant_name: name, amount, category })

const list = [
  ...['2026-05-09', '2026-06-09', '2026-07-09', '2026-08-09', '2026-09-09', '2026-10-09'].map((d, i) => tx(`n${i}`, d, 'Netflix', 15.49, 'Subscriptions')),
  ...['2026-07-03', '2026-08-03', '2026-09-03', '2026-10-03'].map((d, i) => tx(`r${i}`, d, 'Greystar Rent #123', 2400, 'Home')),
  ...['2026-08-01', '2026-08-15', '2026-08-29', '2026-09-12', '2026-09-26', '2026-10-10'].map((d, i) => tx(`p${i}`, d, 'Payroll', -2100, 'Income')),
  ...['2026-08-20', '2026-09-20', '2026-10-20'].map((d, i) => tx(`e${i}`, d, 'Springfield Electric', [120, 160, 142.88][i], 'Bills & Utilities')),
  tx('x1', '2026-10-01', 'Blue Bottle', 6.5), tx('x2', '2026-10-02', 'Blue Bottle', 6.5), tx('x3', '2026-10-03', 'Blue Bottle', 6.5),
  ...['2026-02-01', '2026-03-01', '2026-04-01'].map((d, i) => tx(`old${i}`, d, 'Old Gym', 30)),
]

describe('recurring detection', () => {
  const found = detectRecurring(list, '2026-10-22')
  const by = (n: string) => found.find((r) => r.name.startsWith(n))
  it('finds monthly subscriptions, bills, biweekly income', () => {
    expect(by('Netflix')).toMatchObject({ kind: 'subscription', frequency: 'monthly', amount: 15.49, nextDate: '2026-11-09', variable: false })
    expect(by('Greystar')).toMatchObject({ kind: 'bill', frequency: 'monthly', nextDate: '2026-11-03' })
    expect(by('Payroll')).toMatchObject({ kind: 'income', frequency: 'biweekly', nextDate: '2026-10-24' })
    expect(by('Payroll')!.monthly).toBeCloseTo(2100 * 26 / 12)
  })
  it('flags variable bills', () => {
    expect(by('Springfield Electric')).toMatchObject({ kind: 'bill', variable: true })
  })
  it('ignores daily habits and stale streams', () => {
    expect(by('Blue Bottle')).toBeUndefined()
    expect(by('Old Gym')).toBeUndefined()
  })
  it('normalizes merchant names', () => {
    expect(merchantKey('GREYSTAR RENT #123')).toBe('greystar rent')
    expect(merchantKey('SQ *BLUE BOTTLE 0042')).toBe('blue bottle')
    expect(merchantKey('Amazon.com 12345 Purchase')).toBe('amazon')
  })
  it('steps months keeping the day, clamped to month end', () => {
    expect(step('2026-01-31', 'monthly')).toBe('2026-02-28')
    expect(step('2026-10-09', 'monthly', -1)).toBe('2026-09-09')
    expect(step('2026-10-10', 'biweekly')).toBe('2026-10-24')
    expect(step('2026-10-10', 'yearly')).toBe('2027-10-10')
  })
  it('lays out occurrences on a calendar month', () => {
    const nov = occurrencesInMonth(found, '2026-11')
    expect(nov.filter((o) => o.item.name === 'Payroll').map((o) => o.date)).toEqual(['2026-11-07', '2026-11-21'])
    expect(nov.find((o) => o.item.name === 'Netflix')?.date).toBe('2026-11-09')
  })
  it('shows real past charges, projections after the last one', () => {
    const oct = occurrencesInMonth(found, '2026-10')
    expect(oct.filter((o) => o.item.name === 'Payroll').map((o) => o.date)).toEqual(['2026-10-10', '2026-10-24'])
    expect(oct.find((o) => o.item.name === 'Netflix')?.date).toBe('2026-10-09')
  })
  it('stored streams override detection', () => {
    const merged = mergeStored(found, [{ id: 's1', name: 'Netflix', amount: 22.99, frequency: 'monthly', nextDate: '2026-11-12' }], '2026-10-22')
    expect(merged.filter((r) => r.name === 'Netflix')).toHaveLength(1)
    expect(merged.find((r) => r.name === 'Netflix')).toMatchObject({ amount: 22.99, nextDate: '2026-11-12', kind: 'subscription' })
  })
})
