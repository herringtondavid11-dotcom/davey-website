import { describe, expect, it } from 'vitest'
import { recurringRows } from './serverData'

const rec = (id: string, payload: Record<string, unknown>) => ({ household_id: 'h', entity: 'recurring', id, payload, updated_at: '' })

describe('recurring rules from household records', () => {
  it('maps the app payload and finds the next occurrence on or after today', () => {
    const rows = recurringRows([rec('r1', { payee: 'Rent', amount: -250000, frequency: 'monthly', startDate: '2026-01-31T12:00:00Z' })], '2026-02-15')
    expect(rows).toEqual([{ id: 'r1', name: 'Rent', amount: 2500, frequency: 'monthly', next_date: '2026-02-28', category_id: undefined }])
  })
  it('handles weekly, biweekly and yearly schedules', () => {
    const start = '2026-10-01T12:00:00Z'
    const next = (frequency: string) => recurringRows([rec('r', { payee: 'X', amount: -100, frequency, startDate: start })], '2026-10-09')[0].next_date
    expect(next('weekly')).toBe('2026-10-15')
    expect(next('biweekly')).toBe('2026-10-15')
    expect(next('yearly')).toBe('2027-10-01')
  })
  it('leaves out paused and ended rules', () => {
    const rows = recurringRows([
      rec('p', { payee: 'Paused', amount: -100, frequency: 'monthly', startDate: '2026-01-01T12:00:00Z', isPaused: true }),
      rec('e', { payee: 'Ended', amount: -100, frequency: 'monthly', startDate: '2026-01-01T12:00:00Z', endDate: '2026-03-01T12:00:00Z' }),
    ], '2026-10-01')
    expect(rows).toEqual([])
  })
})
