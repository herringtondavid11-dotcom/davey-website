import { describe, expect, it } from 'vitest'
import { band, fraction, groupOf, needed, progress, sortAccounts, summary, type GoalRow } from './accountGoals'
import type { Account } from './schema'

// The same values as the app's AccountGoalsTests.swift.
describe('account goals', () => {
  it('savings goal is balance over goal and can pass 100%', () => {
    expect(fraction({ amount: 500_000, goal: 1_000_000, isDebt: false })).toBe(0.5)
    expect(band(0.5)).toBe('mid')
    expect(fraction({ amount: 1_200_000, goal: 1_000_000, isDebt: false })).toBe(1.2)
    expect(band(1.2)).toBe('done')
    expect(band(0.49)).toBe('low')
  })

  it('debt goal is paid down over the starting balance', () => {
    const card: GoalRow = { amount: 600_000, goal: 0, start: 800_000, isDebt: true }
    expect(progress(card)).toBe(200_000)
    expect(needed(card)).toBe(800_000)
    expect(fraction(card)).toBe(0.25)
    expect(fraction({ amount: 1_500_000, goal: 1_000_000, start: 2_000_000, isDebt: true })).toBe(0.5)
    expect(fraction({ amount: 0, goal: 0, start: 300_000, isDebt: true })).toBe(1)
    expect(fraction({ amount: 900_000, goal: 0, start: 800_000, isDebt: true })).toBe(0)
  })

  it('cumulative leaves out accounts without goals', () => {
    const rows: GoalRow[] = [
      { amount: 500_000, goal: 1_000_000, isDebt: false },
      { amount: 600_000, goal: 0, start: 800_000, isDebt: true },
      { amount: 5_000_000, isDebt: false },
    ]
    const s = summary(rows, 4_900_000)
    expect(s.totalGoals).toBe(1_800_000)
    expect(s.goalCount).toBe(2)
    expect(s.fraction).toBe(7_000 / 18_000)
    expect(s.totalBalance).toBe(4_900_000)
    expect(summary([rows[2]], 1).fraction).toBeUndefined()
  })

  it('groups and sorts like the app', () => {
    const acct = (id: string, subtype: string, type: string, balance: number, goalTarget?: number): Account =>
      ({ id, name: id, type, subtype, balance, currency: 'USD', hidden: false, usage: 'personal', goalTarget, raw: {} }) as Account
    expect(groupOf(acct('a', 'savings', 'depository', 1))).toBe('savings')
    expect(groupOf(acct('b', 'creditCard', 'credit', 1))).toBe('credit')
    expect(groupOf(acct('c', 'property', 'other', 1))).toBe('other')
    const list = [acct('Big', 'checking', 'depository', 9000), acct('Half', 'savings', 'depository', 500, 1000), acct('Full', 'savings', 'depository', 1000, 1000)]
    expect(sortAccounts(list, 'funded', (a) => a.name).map((a) => a.id)).toEqual(['Full', 'Half', 'Big'])
    expect(sortAccounts(list, 'name', (a) => a.name).map((a) => a.id)).toEqual(['Big', 'Full', 'Half'])
  })
})
