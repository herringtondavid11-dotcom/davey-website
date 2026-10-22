import { describe, expect, it } from 'vitest'
import { compact } from './BarChart'

describe('axis money labels', () => {
  it('have exactly one dollar sign, sign first', () => {
    expect(compact(1_000_000)).toBe('$1M')
    expect(compact(750_000)).toBe('$750k')
    expect(compact(0)).toBe('$0')
    expect(compact(-5000)).toBe('-$5k')
    expect(compact(12.4)).toBe('$12')
  })
})

import { rangeTicks } from './BarChart'

describe('trend line range', () => {
  it('fits the data instead of starting at zero', () => {
    const t = rangeTicks(782_000, 813_000)
    expect(t[0]).toBeGreaterThan(700_000)
    expect(t[0]).toBeLessThanOrEqual(782_000)
    expect(t[t.length - 1]).toBeGreaterThanOrEqual(813_000)
  })
  it('handles flat and negative data', () => {
    expect(rangeTicks(500, 500).length).toBeGreaterThan(1)
    const neg = rangeTicks(-20_000, -5_000)
    expect(neg[0]).toBeLessThanOrEqual(-20_000)
    expect(neg[neg.length - 1]).toBeGreaterThanOrEqual(-5_000)
  })
})
