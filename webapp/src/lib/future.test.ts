import { describe, expect, it } from 'vitest'
import {
  assumptionsFromUnknown,
  defaultAssumptions,
  marksOf,
  projectFuture,
  savingsRatePercent,
  stepMonth,
  withSavingsRate,
  type MonthStep,
  type ProjectionInput,
} from './future'

const idle: MonthStep = {
  investmentMonthlyRate: 0,
  cashMonthlyRate: 0,
  otherMonthlyRate: 0,
  investmentContribution: 0,
  cashContribution: 0,
  debtPayment: 0,
  event: 0,
}

function project(over: Omit<Partial<ProjectionInput>, 'assumptions'> & { assumptions?: Partial<ProjectionInput['assumptions']> } = {}) {
  const { assumptions, ...rest } = over
  return projectFuture({
    investments: 0,
    cash: 0,
    other: 0,
    debts: [],
    annualIncome: 0,
    ...rest,
    assumptions: defaultAssumptions(assumptions),
  })
}

describe('stepMonth', () => {
  it('compounds first and deposits the contribution at the end of the month', () => {
    // 12% annual → 1% monthly. 1000 grows to 1010, then the 100 deposit lands.
    const once = stepMonth(
      { investments: 1000, cash: 0, other: 0, debts: [] },
      { ...idle, investmentMonthlyRate: 0.01, investmentContribution: 100 },
    )
    expect(once.investments).toBeCloseTo(1110, 8)
    const twice = stepMonth(once, { ...idle, investmentMonthlyRate: 0.01, investmentContribution: 100 })
    expect(twice.investments).toBeCloseTo(1221.1, 8)
  })

  it('earns cash yield on cash only, and inflation on other assets only', () => {
    const next = stepMonth(
      { investments: 0, cash: 1000, other: 2000, debts: [] },
      { ...idle, cashMonthlyRate: 0.01, otherMonthlyRate: 0.005 },
    )
    expect(next.cash).toBeCloseTo(1010, 8)
    expect(next.other).toBeCloseTo(2010, 8)
    expect(next.investments).toBe(0)
  })

  it('accrues debt interest before the payment, and does not pay past zero', () => {
    // 1000 * 1.01 - 100 = 910. A second month: 910 * 1.01 - 100 = 819.1.
    const month = { ...idle, debtPayment: 100 }
    const once = stepMonth({ investments: 0, cash: 0, other: 0, debts: [{ balance: 1000, apr: 12, minimum: 100 }] }, month)
    expect(once.debts[0].balance).toBeCloseTo(910, 8)
    const twice = stepMonth(once, month)
    expect(twice.debts[0].balance).toBeCloseTo(819.1, 8)

    const paid = stepMonth({ investments: 0, cash: 500, other: 0, debts: [{ balance: 50, apr: 0, minimum: 50 }] }, { ...idle, debtPayment: 100 })
    expect(paid.debts[0].balance).toBe(0)
    expect(paid.cash).toBe(500)
  })

  it('puts extra debt payment on the higher APR after minimums', () => {
    // A accrues 2%: 200 → 204. B stays 200. Minimums 10 + 10, then the extra 30 goes to A.
    const next = stepMonth(
      { investments: 0, cash: 0, other: 0, debts: [
        { balance: 200, apr: 24, minimum: 10 },
        { balance: 200, apr: 0, minimum: 10 },
      ] },
      { ...idle, debtPayment: 50 },
    )
    expect(next.debts[0].balance).toBeCloseTo(164, 8)
    expect(next.debts[1].balance).toBeCloseTo(190, 8)
  })

  it('grows a debt when the payment does not cover interest', () => {
    const next = stepMonth(
      { investments: 0, cash: 0, other: 0, debts: [{ balance: 1000, apr: 12, minimum: 1 }] },
      { ...idle, debtPayment: 1 },
    )
    expect(next.debts[0].balance).toBeCloseTo(1009, 8)
  })

  it('withdraws a negative contribution from that bucket, then the other liquid bucket', () => {
    const next = stepMonth(
      { investments: 50, cash: 80, other: 40, debts: [] },
      { ...idle, investmentContribution: -100 },
    )
    expect(next.investments).toBe(0)
    expect(next.cash).toBe(30)
    expect(next.other).toBe(40)
  })

  it('adds a windfall to cash and spends an expense from cash, then investments, then other assets', () => {
    const windfall = stepMonth({ investments: 0, cash: 0, other: 0, debts: [] }, { ...idle, event: 500 })
    expect(windfall.cash).toBe(500)
    const expense = stepMonth({ investments: 80, cash: 100, other: 40, debts: [] }, { ...idle, event: -150 })
    expect(expense.cash).toBe(0)
    expect(expense.investments).toBe(30)
    expect(expense.other).toBe(40)
    const short = stepMonth({ investments: 10, cash: 10, other: 10, debts: [] }, { ...idle, event: -100 })
    expect(short.investments).toBe(0)
    expect(short.cash).toBe(0)
    expect(short.other).toBe(0)
    expect(short.debts).toEqual([])
  })
})

describe('projectFuture', () => {
  it('matches a year of monthly compounding with no contributions', () => {
    // (1.01)^12 = 1.1268250301319695, so 10000 grows to 11268.250301319695.
    const [today, year] = project({ investments: 10_000, years: 1, assumptions: { investmentReturnPercent: 12 } })
    expect(today.investments).toBe(10_000)
    expect(today.netWorth).toBe(10_000)
    expect(year.investments).toBeCloseTo(11_268.250301319695, 6)
    expect(year.investments).toBeCloseTo(10_000 * (1.01 ** 12), 8)
  })

  it('keeps zero-rate balances equal to the starting value plus end-of-month deposits', () => {
    const points = project({
      investments: 1000,
      cash: 500,
      other: 2000,
      years: 5,
      assumptions: { investmentReturnPercent: 0, cashYieldPercent: 0, inflationPercent: 0, monthlyInvestment: 100, monthlyCash: 50, contributionBasis: 'fixed' },
    })
    const year = points[5]
    expect(year.investments).toBeCloseTo(1000 + 100 * 60, 6)
    expect(year.cash).toBeCloseTo(500 + 50 * 60, 6)
    expect(year.other).toBeCloseTo(2000, 6)
    expect(year.debts).toBe(0)
    expect(year.netWorth).toBeCloseTo(year.investments + year.cash + year.other - year.debts, 6)
  })

  it('earns the first year at today\'s income and raises it at each anniversary', () => {
    const points = project({ annualIncome: 100_000, years: 3, assumptions: { incomeGrowthPercent: 10 } })
    expect(points[0].annualIncome).toBe(100_000)
    expect(points[0].cumulativeIncome).toBe(0)
    expect(points[1].annualIncome).toBeCloseTo(100_000, 6)
    expect(points[1].cumulativeIncome).toBeCloseTo(100_000, 6)
    expect(points[2].annualIncome).toBeCloseTo(110_000, 6)
    expect(points[2].cumulativeIncome).toBeCloseTo(210_000, 6)
    expect(points[3].annualIncome).toBeCloseTo(121_000, 6)
    expect(points[3].cumulativeIncome).toBeCloseTo(331_000, 6)
  })

  it('scales rate-based contributions with income and leaves fixed contributions alone', () => {
    const rate = project({
      annualIncome: 12_000,
      years: 2,
      assumptions: { investmentReturnPercent: 0, cashYieldPercent: 0, inflationPercent: 0, incomeGrowthPercent: 100, monthlyInvestment: 100, contributionBasis: 'rate' },
    })
    // Year 1: 100 * 12. Year 2 income doubles, so the deposit doubles: 200 * 12.
    expect(rate[2].investments).toBeCloseTo(3600, 6)
    const fixed = project({
      annualIncome: 12_000,
      years: 2,
      assumptions: { investmentReturnPercent: 0, cashYieldPercent: 0, inflationPercent: 0, incomeGrowthPercent: 100, monthlyInvestment: 100, contributionBasis: 'fixed' },
    })
    expect(fixed[2].investments).toBeCloseTo(2400, 6)
  })

  it('reports today\'s dollars by deflating each balance and each month of income', () => {
    const points = project({
      investments: 1000,
      other: 1000,
      annualIncome: 12_000,
      years: 1,
      assumptions: { investmentReturnPercent: 0, cashYieldPercent: 0, inflationPercent: 12, realDollars: true },
    })
    const factor = 1.01 ** 12
    expect(points[1].investments).toBeCloseTo(1000 / factor, 6)
    // Other assets grow at inflation, so a year of today's dollars leaves them flat.
    expect(points[1].other).toBeCloseTo(1000, 6)
    expect(points[1].annualIncome).toBeCloseTo(12_000 / factor, 6)
    let cumulative = 0
    for (let month = 1; month <= 12; month++) cumulative += 1000 / (1.01 ** month)
    expect(points[1].cumulativeIncome).toBeCloseTo(cumulative, 6)
  })

  it('applies a one-off event at the year mark, after that month\'s contribution', () => {
    const points = project({
      years: 2,
      assumptions: { investmentReturnPercent: 0, cashYieldPercent: 0, inflationPercent: 0, monthlyCash: 10, events: [{ id: 'windfall', year: 1, amount: 500 }] },
    })
    expect(points[1].cash).toBeCloseTo(10 * 12 + 500, 6)
    expect(points[2].cash).toBeCloseTo(10 * 24 + 500, 6)
  })

  it('keeps net worth equal to investments + cash + other − debts at every year', () => {
    const points = project({
      investments: 20_000,
      cash: 4_000,
      other: 50_000,
      debts: [{ balance: 10_000, apr: 6, minimum: 200 }],
      annualIncome: 80_000,
      years: 10,
      assumptions: {
        investmentReturnPercent: 7,
        cashYieldPercent: 4,
        inflationPercent: 3,
        incomeGrowthPercent: 3,
        monthlyInvestment: 500,
        monthlyCash: 100,
        contributionBasis: 'rate',
        debtPayment: 250,
        realDollars: true,
        events: [{ id: 'roof', year: 5, amount: -8000 }],
      },
    })
    expect(points).toHaveLength(11)
    for (const point of points) {
      expect(point.netWorth).toBeCloseTo(point.investments + point.cash + point.other - point.debts, 6)
      expect(point.investments).toBeGreaterThanOrEqual(0)
      expect(point.cash).toBeGreaterThanOrEqual(0)
      expect(point.other).toBeGreaterThanOrEqual(0)
      expect(point.debts).toBeGreaterThanOrEqual(0)
    }
    expect(marksOf(points).map((p) => p.year)).toEqual([5, 10])
  })

  it('returns a point at each year mark through 40 years', () => {
    const points = project({ investments: 1, years: 40 })
    expect(marksOf(points).map((p) => p.year)).toEqual([5, 10, 15, 20, 25, 30, 35, 40])
    expect(points[40].year).toBe(40)
  })
})

describe('assumptions', () => {
  it('rejects junk and clamps a usable object', () => {
    expect(assumptionsFromUnknown(null)).toBeNull()
    expect(assumptionsFromUnknown({ investmentReturnPercent: 7 })).toBeNull()
    const parsed = assumptionsFromUnknown({
      investmentReturnPercent: 99,
      cashYieldPercent: 4,
      inflationPercent: 3,
      incomeGrowthPercent: 2,
      monthlyInvestment: 100,
      monthlyCash: 50,
      debtPayment: -5,
      realDollars: true,
      contributionBasis: 'rate',
      events: [{ id: 'a', year: 10, amount: 2500 }, { year: 0, amount: 5 }, { year: 3, amount: 'nope' }],
    })
    expect(parsed).toMatchObject({
      investmentReturnPercent: 40,
      cashYieldPercent: 4,
      realDollars: true,
      contributionBasis: 'rate',
      debtPayment: 0,
    })
    expect(parsed?.events).toEqual([{ id: 'a', year: 10, amount: 2500 }])
  })

  it('turns a savings rate into monthly deposits that preserve the split', () => {
    const even = defaultAssumptions({ monthlyInvestment: 500, monthlyCash: 500, contributionBasis: 'fixed' })
    const next = withSavingsRate(even, 120_000, 10)
    expect(next.contributionBasis).toBe('rate')
    expect(next.monthlyInvestment).toBeCloseTo(500, 6)
    expect(next.monthlyCash).toBeCloseTo(500, 6)
    expect(savingsRatePercent(next, 120_000)).toBeCloseTo(10, 6)
    const allInvested = withSavingsRate(defaultAssumptions(), 120_000, 20)
    expect(allInvested.monthlyInvestment).toBeCloseTo(2000, 6)
    expect(allInvested.monthlyCash).toBeCloseTo(0, 6)
    expect(savingsRatePercent(defaultAssumptions({ monthlyInvestment: 100 }), 0)).toBe(0)
  })
})
