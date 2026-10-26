import { describe, expect, it } from 'vitest'
import { moneyProblem, parseMoney } from './parseMoney'

describe('parseMoney', () => {
  it('reads what people type', () => {
    expect(parseMoney('$1,250.50')).toBe(1250.5)
    expect(parseMoney('1250')).toBe(1250)
    expect(parseMoney(' 40 ')).toBe(40)
    expect(parseMoney('-40.5')).toBe(-40.5)
    expect(parseMoney('.5')).toBe(0.5)
    expect(parseMoney('12,000,000')).toBe(12_000_000)
  })
  it('rejects what would be a mistake', () => {
    for (const bad of ['abc', '1e9', '10,000.555', '1,00', '', '$', '12.3.4', '--5', '1,2345']) expect(parseMoney(bad), bad).toBeNull()
  })
  it('says what to fix', () => {
    expect(moneyProblem('abc')).toBe('Enter an amount like 1,250.50')
    expect(moneyProblem('0', { positive: true })).toBe('Enter an amount above $0')
    expect(moneyProblem('-5', { min: 0 })).toBe('Enter $0 or more')
    expect(moneyProblem('')).toBe('')
    expect(moneyProblem('1,250.50')).toBe('')
  })
})
