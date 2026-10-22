import { describe, expect, it } from 'vitest'
import { avalanche, equity, monthlyPayment, payoff, refinance, utilization, yearlySchedule } from './debt'

describe('loan math', () => {
  it('computes standard mortgage payments', () => {
    expect(monthlyPayment(400000, 6, 360)).toBeCloseTo(2398.2, 1)
    expect(monthlyPayment(12000, 0, 12)).toBe(1000)
  })
  it('pays off a loan and totals interest', () => {
    const p = payoff(400000, 6, monthlyPayment(400000, 6, 360))
    expect(p.months).toBe(360)
    expect(p.totalInterest).toBeCloseTo(463352, -2)
    const extra = payoff(400000, 6, monthlyPayment(400000, 6, 360) + 500)
    expect(extra.months).toBeLessThan(260)
  })
  it('detects payments that never pay off', () => {
    expect(payoff(10000, 24, 150)).toMatchObject({ paysOff: false, months: Infinity })
  })
  it('builds a yearly schedule ending at zero', () => {
    const rows = yearlySchedule(12000, 0, 1000)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ principal: 12000, endBalance: 0 })
  })
  it('compares a refinance', () => {
    const current = monthlyPayment(400000, 7, 360)
    const r = refinance(400000, 7, current, 6, 360, 6000)
    expect(r.newPayment).toBeCloseTo(2398.2, 1)
    expect(r.monthlySavings).toBeCloseTo(current - 2398.2, 0)
    expect(r.breakEvenMonths).toBe(Math.ceil(6000 / r.monthlySavings))
    expect(r.lifetimeSavings).toBeGreaterThan(0)
    expect(refinance(400000, 6, monthlyPayment(400000, 6, 360), 7, 360, 0).breakEvenMonths).toBe(Infinity)
  })
  it('computes equity and LTV', () => {
    expect(equity(690000, 412300)).toMatchObject({ equity: 277700, pmiLikely: false })
    expect(equity(690000, 412300).ltv).toBeCloseTo(59.75, 1)
    expect(equity(500000, 450000).pmiLikely).toBe(true)
  })
})

describe('credit cards', () => {
  it('bands utilization', () => {
    expect(utilization(500, 10000)).toEqual({ pct: 5, band: 'excellent' })
    expect(utilization(2900, 10000)?.band).toBe('good')
    expect(utilization(4000, 10000)?.band).toBe('fair')
    expect(utilization(6000, 10000)?.band).toBe('high')
    expect(utilization(100, undefined)).toBeNull()
  })
  it('avalanche pays the highest APR first', () => {
    const plan = avalanche(
      [
        { id: 'low', balance: 3000, apr: 12, minimum: 50 },
        { id: 'high', balance: 3000, apr: 25, minimum: 50 },
      ],
      600,
    )
    expect(plan.feasible).toBe(true)
    expect(plan.order[0]).toBe('high')
    expect(plan.months).toBeGreaterThan(9)
    expect(avalanche([{ id: 'a', balance: 1000, apr: 20, minimum: 100 }], 50).feasible).toBe(false)
  })
})
