import { describe, expect, it } from 'vitest'
import {
  actualIncomeCents,
  amountToCents,
  applyRaise,
  blankSource,
  forecastYear,
  monthCents,
  personChoices,
  sortByMonthly,
  withAnnual,
  withDuration,
  withMonthly,
  withOccurrence,
  withOverride,
  withRange,
  yearTotalCents,
  type IncomeSource,
} from './income'

function source(partial: Partial<IncomeSource> = {}): IncomeSource {
  return { ...blankSource(null, new Date('2026-01-01T00:00:00Z')), id: 'job', name: 'Job', ...partial }
}

describe('income amounts', () => {
  it('parses a typed amount and keeps cents', () => {
    expect(amountToCents('8000')).toBe(800_000)
    expect(amountToCents('$1,250.50')).toBe(125_050)
    expect(amountToCents('8.')).toBe(800)
    expect(amountToCents('')).toBe(0)
    expect(amountToCents('-5')).toBeNull()
    expect(amountToCents('12.345')).toBeNull()
  })

  it('fills the year from the monthly amount, and the month from the year', () => {
    const monthly = withMonthly(source(), 800_000)
    expect(yearTotalCents(monthly, 2026)).toBe(9_600_000)
    const annual = withAnnual(monthly, 2026, 12_000_000)
    expect(annual.monthlyCents).toBe(1_000_000)
    expect(annual.amountBasis).toBe('annual')
    expect(yearTotalCents(annual, 2026)).toBe(12_000_000)
  })

  it('puts a one-cent remainder on the last open month so the year matches exactly', () => {
    const annual = withAnnual(source(), 2026, 10_000)
    expect(annual.monthlyCents).toBe(833)
    expect(yearTotalCents(annual, 2026)).toBe(10_000)
    expect(monthCents(annual, '2026-12')).toBe(837)
    expect(monthCents(annual, '2026-01')).toBe(833)
  })

  it('treats a single month as a one-off: monthly and annual are the same number', () => {
    const job = withRange(withMonthly(source(), 500_000), 2026, '2026-06', '2026-06')
    expect(yearTotalCents(job, 2026)).toBe(500_000)
    expect(monthCents(job, '2026-06')).toBe(500_000)
    expect(monthCents(job, '2026-07')).toBe(0)
    const fromYear = withAnnual(withRange(source(), 2026, '2026-03', '2026-03'), 2026, 500_000)
    expect(fromYear.monthlyCents).toBe(500_000)
    expect(monthCents(fromYear, '2026-03')).toBe(500_000)
  })

  it('keeps an entered year total when the source starts mid-year', () => {
    const salary = withAnnual(source(), 2026, 12_000_000)
    const started = withRange(salary, 2026, '2026-03', null)
    expect(started.amountBasis).toBe('annual')
    expect(yearTotalCents(started, 2026)).toBe(12_000_000)
    expect(monthCents(started, '2026-01')).toBe(0)
    expect(monthCents(started, '2026-02')).toBe(0)
    expect(monthCents(started, '2026-03')).toBe(1_200_000)
    expect(monthCents(started, '2026-12')).toBe(1_200_000)
  })

  it('keeps the monthly rate when the window changes after a monthly edit', () => {
    const salary = withRange(withMonthly(source(), 800_000), 2026, '2026-03', null)
    expect(salary.monthlyCents).toBe(800_000)
    expect(yearTotalCents(salary, 2026)).toBe(8_000_000)
    expect(forecastYear([salary], 2026)[0].totalCents).toBe(0)
    expect(forecastYear([salary], 2026)[10].totalCents).toBe(800_000)
  })

  it('lets one month differ without changing the others', () => {
    const salary = withOverride(withMonthly(source(), 800_000), '2026-12', 1_500_000)
    expect(monthCents(salary, '2026-11')).toBe(800_000)
    expect(monthCents(salary, '2026-12')).toBe(1_500_000)
    expect(yearTotalCents(salary, 2026)).toBe(11 * 800_000 + 1_500_000)
  })

  it('keeps a customized month when the year total still covers it', () => {
    const bonus = withOverride(withMonthly(source(), 100_000), '2026-12', 500_000)
    const raised = withAnnual(bonus, 2026, 1_600_000)
    expect(monthCents(raised, '2026-12')).toBe(500_000)
    expect(raised.monthlyCents).toBe(100_000)
    expect(yearTotalCents(raised, 2026)).toBe(1_600_000)
  })

  it('scales every month, including a bonus month, when the new year total cannot cover the overrides', () => {
    const bonus = withOverride(withMonthly(source(), 100_000), '2026-12', 500_000)
    const cut = withAnnual(bonus, 2026, 400_000)
    expect(yearTotalCents(cut, 2026)).toBe(400_000)
    expect(monthCents(cut, '2026-12')).toBe(125_000)
    expect(cut.monthlyCents).toBe(25_000)
  })

  it('counts a month typed outside the start and end window', () => {
    const seasonal = withRange(withMonthly(source(), 200_000), 2026, '2026-06', '2026-08')
    const withMarch = withOverride(seasonal, '2026-03', 50_000)
    expect(yearTotalCents(withMarch, 2026)).toBe(3 * 200_000 + 50_000)
    expect(monthCents(withMarch, '2026-03')).toBe(50_000)
    expect(monthCents(withMarch, '2026-05')).toBe(0)
  })

  it('sums recorded income and skips transfers and pending charges', () => {
    const cents = actualIncomeCents([
      { date: '2026-11-01', amount: 4200, pending: false, category: 'Income', name: 'Payroll' },
      { date: '2026-11-02', amount: 500, pending: false, category: 'Transfer', name: 'Transfer from savings' },
      { date: '2026-11-03', amount: 80, pending: true, category: 'Income', name: 'Interest' },
      { date: '2026-11-04', amount: -40, pending: false, category: 'Groceries', name: 'Market' },
      { date: '2025-12-01', amount: 1000, pending: false, category: 'Income', name: 'Old' },
    ], 2026)
    expect(cents).toEqual({ '2026-11': 420_000 })
  })

  it('pays biweekly 26 times a year and weekly 52 times', () => {
    const biweekly = withOccurrence({ ...source(), cadence: 'biweekly' }, 200_000, 2026)
    expect(yearTotalCents(biweekly, 2026)).toBe(26 * 200_000)
    const weekly = withOccurrence({ ...source(), cadence: 'weekly' }, 100_000, 2026)
    expect(yearTotalCents(weekly, 2026)).toBe(52 * 100_000)
  })

  it('pays four times a month', () => {
    const four = withOccurrence({ ...source(), cadence: 'four' }, 50_000, 2026)
    expect(monthCents(four, '2026-03')).toBe(200_000)
    expect(yearTotalCents(four, 2026)).toBe(12 * 200_000)
  })

  it('counts a one-time payment only in its month', () => {
    const once = withDuration(withRange(withOccurrence(source(), 500_000, 2026), 2026, '2026-06', null), 'once', 2026)
    expect(monthCents(once, '2026-06')).toBe(500_000)
    expect(monthCents(once, '2026-07')).toBe(0)
    expect(yearTotalCents(once, 2026)).toBe(500_000)
  })

  it('places a couple of payments on the cadence and stops', () => {
    const few = withDuration({ ...withOccurrence(source(), 100_000, 2026), occurrenceCount: 3, startsOn: '2026-04' }, 'repeat', 2026)
    expect(monthCents(few, '2026-04')).toBe(100_000)
    expect(monthCents(few, '2026-05')).toBe(100_000)
    expect(monthCents(few, '2026-06')).toBe(100_000)
    expect(monthCents(few, '2026-07')).toBe(0)
    expect(yearTotalCents(few, 2026)).toBe(300_000)
  })

  it('stops a short-term source at its end month', () => {
    const range = withRange(withOccurrence(source(), 80_000, 2026), 2026, '2026-06', '2026-08')
    const ended = { ...range, duration: 'range' as const }
    expect(monthCents(ended, '2026-05')).toBe(0)
    expect(monthCents(ended, '2026-08')).toBe(80_000)
    expect(monthCents(ended, '2026-09')).toBe(0)
  })

  it('models a raise from an effective month without editing the source', () => {
    const job = withMonthly(source(), 800_000)
    const raised = applyRaise(job, {
      id: 's', name: '10% raise', kind: 'raise', sourceId: job.id, raisePercent: 10, raiseCents: null,
      effectiveMonth: '2026-07', enabled: true, hypothetical: null, createdAt: '',
    }, 2026)
    expect(monthCents(job, '2026-07')).toBe(800_000)
    expect(monthCents(raised, '2026-06')).toBe(800_000)
    expect(monthCents(raised, '2026-07')).toBe(880_000)
  })

  it('lists the signed-in person first and falls back to David and Allie', () => {
    expect(personChoices([{ userId: 'u1', name: 'Alex' }, { userId: 'u2', name: 'Jordan' }], 'u1').map((choice) => choice.label)).toEqual(['Alex', 'Jordan', 'Other'])
    expect(personChoices([], 'u1').map((choice) => [choice.label, choice.userId, choice.other])).toEqual([
      ['David', 'u1', null],
      ['Allie', null, 'Allie'],
      ['Other', null, ''],
    ])
  })

  it('sorts incomes by monthly amount, highest first', () => {
    const small = withMonthly({ ...source(), id: 'small', name: 'Small' }, 100_000)
    const big = withMonthly({ ...source(), id: 'big', name: 'Big' }, 800_000)
    expect(sortByMonthly([small, big], 2026).map((item) => item.name)).toEqual(['Big', 'Small'])
  })
})
