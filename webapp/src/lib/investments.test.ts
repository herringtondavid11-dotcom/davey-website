import { describe, expect, it } from 'vitest'
import { compactName, historyIsEstimated, periods, pointsSince, portfolioSeries, rangeStart, timeWeightedReturn, type Snapshot } from './investments'
import { forecastPresets, projectForecast } from './forecast'

const snap = (accountId: string, date: string, value: number, netFlow = 0, estimated = true): Snapshot => ({ accountId, date, value, netFlow, estimated })

describe('portfolio history (same rules as InvestmentAnalytics.swift)', () => {
  it('sums accounts per day, carrying each account forward', () => {
    const s = portfolioSeries([snap('a', '2026-10-01', 100), snap('b', '2026-10-01', 50), snap('a', '2026-10-02', 110), snap('c', '2026-10-02', 999)], new Set(['a', 'b']))
    expect(s).toEqual([{ date: '2026-10-01', value: 150, netFlow: 0 }, { date: '2026-10-02', value: 160, netFlow: 0 }])
  })

  it('time-weighted return leaves deposits out (same case as TimeWeightedReturnTests)', () => {
    const r = timeWeightedReturn([
      { date: '1', value: 1000, netFlow: 0 }, { date: '2', value: 1100, netFlow: 0 },
      { date: '3', value: 2100, netFlow: 1000 }, { date: '4', value: 2310, netFlow: 0 },
    ])
    expect(r).toBeCloseTo(0.21, 9)
    expect(timeWeightedReturn([{ date: '1', value: 0, netFlow: 0 }, { date: '2', value: 100, netFlow: 100 }])).toBeUndefined()
  })

  it('ranges, windows and monthly growth', () => {
    expect(rangeStart('3M', '2026-10-22')).toBe('2026-07-22')
    expect(rangeStart('YTD', '2026-10-22')).toBe('2026-01-01')
    const pts = [{ date: '2026-08-31', value: 1000, netFlow: 0 }, { date: '2026-09-15', value: 1600, netFlow: 500 }, { date: '2026-09-30', value: 1650, netFlow: 0 }, { date: '2026-10-22', value: 1700, netFlow: 0 }]
    expect(pointsSince(pts, '2026-09-01')[0]).toEqual({ date: '2026-08-31', value: 1000, netFlow: 0 })
    const p = periods(pts, 'monthly', 2, '2026-10-22')
    expect(p.map((x) => x.label)).toEqual(['Sep 26', 'Oct 26'])
    expect(p[0]).toMatchObject({ startValue: 1000, endValue: 1650, contributions: 500, growth: 150 })
    expect(p[0].returnFraction).toBeCloseTo((1100 / 1000) * (1650 / 1600) - 1, 9)
  })

  it('estimated until 30 real days', () => {
    const ids = new Set(['a'])
    expect(historyIsEstimated([snap('a', '2026-10-01', 1), snap('a', '2026-10-22', 1, 0, false)], ids)).toBe(true)
    const real = Array.from({ length: 30 }, (_, i) => snap('a', `2026-11-${String(i + 1).padStart(2, '0')}`, 1, 0, false))
    expect(historyIsEstimated([snap('a', '2026-10-01', 1), ...real], ids)).toBe(false)
  })

  it('compact names match AccountNaming.compactName', () => {
    expect(compactName({ name: 'RAYMOND JAMES ROTH IRA ACCOUNT', institution: 'Raymond James Client Access', mask: '45N004' })).toBe('Raymond James – Roth IRA ••N004')
    expect(compactName({ nickname: "Kids' 529", name: 'x', institution: 'Raymond James Client Access' })).toBe("Kids' 529")
    expect(compactName({ name: 'Checking', mask: '1234' })).toBe('Checking ••1234')
  })
})

describe('forecast (same values as InvestmentForecastTests.swift)', () => {
  it('compounds monthly with month-end contributions', () => {
    expect(projectForecast(10_000, 0, 0.06, 10).value).toBeCloseTo(18_193.97, 2)
    const m = projectForecast(10_000, 100, 0.06, 10)
    expect(m.value).toBeCloseTo(34_581.9, 2)
    expect(m.totalContributions).toBe(12_000)
    expect(projectForecast(1_000, 50, 0, 2).value).toBe(2_200)
    expect(projectForecast(10_000, 0, 0.06, 10, true).value).toBeCloseTo(18_193.97 / Math.pow(1.0025, 120), 2)
    expect(forecastPresets(305_526.65).map((p) => p.years)).toEqual([5, 10, 15])
  })
})
