// Same cases as the app's AccountCategoriesTests.swift.
import { describe, expect, it } from 'vitest'
import { categoryChoices, categoryGroups, categoryOf, cleanCategory, pieSlices } from './accountCategories'
import type { Account } from './schema'

const acct = (id: string, balance: number, extra: Partial<Account> = {}): Account => ({
  id, name: id, type: 'depository', subtype: 'checking', balance, currency: 'USD', hidden: false, usage: 'personal', raw: {}, ...extra,
})

describe('account categories', () => {
  it('uses the account\'s own category, else its type group', () => {
    expect(categoryOf(acct('a', 1, { rollupCategory: '  Ops   Cash ' }))).toBe('Ops Cash')
    expect(categoryOf(acct('b', 1))).toBe('Cash')
    expect(categoryOf(acct('c', 1, { type: 'investment', subtype: 'investment' }))).toBe('Investments')
    expect(cleanCategory('x'.repeat(40))).toHaveLength(30)
    expect(cleanCategory('   ')).toBeUndefined()
  })

  it('totals each category (debts negative), merges case, and lists the largest first', () => {
    const groups = categoryGroups([
      acct('chk', 12_000, { rollupCategory: 'Ops Cash', goalTarget: 20_000 }),
      acct('sav', 10_000, { rollupCategory: 'ops cash', goalTarget: 20_000 }),
      acct('ira', 27_111, { rollupCategory: 'Retirement', type: 'investment', subtype: 'investment' }),
      acct('card', 500, { rollupCategory: 'Debt Payoff', type: 'credit', subtype: 'creditCard' }),
    ])
    expect(groups.map((g) => [g.name, g.total])).toEqual([['Retirement', 2_711_100], ['Ops Cash', 2_200_000], ['Debt Payoff', -50_000]])
    const ops = groups[1]
    expect(ops.accounts.map((a) => a.id)).toEqual(['chk', 'sav'])
    expect(ops.goals.totalGoals).toBe(4_000_000)
    expect(ops.goals.fraction).toBeCloseTo(0.55)
  })

  it('pies what is owned: six slots, then Other; debts are not slices', () => {
    const accounts = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c, i) => acct(c, (8 - i) * 100, { rollupCategory: c }))
    accounts.push(acct('owe', 5_000, { rollupCategory: 'Debt', type: 'credit', subtype: 'creditCard' }))
    const slices = pieSlices(categoryGroups(accounts))
    expect(slices.map((s) => s.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'Other'])
    expect(slices.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 'other'])
    expect(slices.at(-1)!.cents).toBe(30_000) // G $200 + H $100
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
  })

  it('offers categories in use first, then suggestions not yet used', () => {
    const choices = categoryChoices([acct('a', 1, { rollupCategory: 'Ops Cash' }), acct('b', 1, { rollupCategory: 'retirement' })])
    expect(choices.slice(0, 2)).toEqual(['Ops Cash', 'retirement'])
    expect(choices).not.toContain('Retirement')
    expect(choices).toContain('Emergency')
  })
})
