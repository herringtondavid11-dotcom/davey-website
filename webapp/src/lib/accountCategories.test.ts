// Account categories, round 2. The parity cases come from account-categories.fixture.json, which the app's
// AccountCategoriesTests.swift reads too, so web, iPhone and Mac roll accounts up the same way.
import { describe, expect, it } from 'vitest'
import fixture from './__fixtures__/account-categories.fixture.json'
import {
  addCategory, BUILT_IN, categoryFor, categoryTotals, effectiveCategories, filterRows, moveCategory, ownedSlices,
  removeCategory, renameCategory, rowsFor, sections, sortRows, suggestion,
} from './accountCategories'
import type { Account } from './schema'

type FxAccount = (typeof fixture.accounts)[number] & { accountCategoryID?: string; rollupCategory?: string; loanKind?: string; goal?: number }

const LIABILITY = new Set(['creditCard', 'loan'])
function account(f: FxAccount): Account {
  // Web balances for cards and loans are what's owed (positive); the fixture is signed like the app.
  const owed = LIABILITY.has(f.type)
  return {
    id: f.id, name: f.name, type: f.type === 'checking' || f.type === 'savings' ? 'depository' : f.type === 'creditCard' ? 'credit' : f.type,
    subtype: f.type, balance: (owed ? -f.balance : f.balance) / 100, currency: 'USD', hidden: false, usage: 'personal', raw: {},
    institution: f.bank === 'Manual' ? undefined : f.bank, accountCategoryID: f.accountCategoryID, rollupCategory: f.rollupCategory,
    loanKind: f.loanKind, goalTarget: f.goal !== undefined ? f.goal / 100 : undefined,
  }
}

const categories = effectiveCategories(fixture.records)
const accounts = (fixture.accounts as FxAccount[]).map(account)
const rows = rowsFor(accounts, categories)

describe('parity fixture (same expectations as the app)', () => {
  it('merges built-ins with the household records: renamed, removed, added, reordered', () => {
    expect(categories.map((c) => c.name)).toEqual(fixture.expected.categoryNames)
    expect(categories.find((c) => c.name === 'Kids 529')).toMatchObject({ color: 'gold', builtIn: false })
  })

  it('assigns each account: picked ID, round-1 text, else automatic from its type', () => {
    const got = Object.fromEntries(rows.map((r) => [r.account.id, [r.category?.name, r.picked]]))
    expect(got).toEqual(fixture.expected.accountCategory)
  })

  it('totals each category in category order, with counts and goals', () => {
    const totals = categoryTotals(rows, categories)
    expect(totals.map((t) => [t.name, t.total, t.count])).toEqual(fixture.expected.totals)
    expect(totals.find((t) => t.name === 'Savings')!.funded).toBeCloseTo(fixture.expected.savingsFunded)
    const net = fixture.expected.totals.reduce((s, t) => s + (t[1] as number), 0)
    expect(totals.find((t) => t.name === 'Savings')!.shareOfNetWorth).toBeCloseTo(2_500_000 / net)
    const slices = ownedSlices(totals)
    expect(slices.every((s) => s.total > 0)).toBe(true)
    expect(slices.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
  })
})

describe('suggestions from Plaid type/subtype', () => {
  it('maps types, retirement plans and mortgages', () => {
    expect(suggestion({ daveyType: 'checking' })).toBe('checking')
    expect(suggestion({ daveyType: 'investment', name: 'SEP IRA' })).toBe('retirement')
    expect(suggestion({ daveyType: 'investment', officialName: '401(k) Plan' })).toBe('investments') // "401(k)" isn't "401k"
    expect(suggestion({ daveyType: 'investment', officialName: 'Company 401k' })).toBe('retirement')
    expect(suggestion({ daveyType: 'loan', name: 'Auto Loan' })).toBe('loans')
    expect(suggestion({ daveyType: 'loan', name: 'HELOC' })).toBe('mortgage')
    expect(suggestion({ daveyType: 'vehicle' })).toBe('other')
  })

  it('falls back to Other, then none, when the suggested category was removed', () => {
    const noChecking = effectiveCategories([{ id: BUILT_IN[0].id, payload: { removed: true } }])
    expect(categoryFor({ daveyType: 'checking' }, noChecking).category?.name).toBe('Other')
    const none = effectiveCategories(BUILT_IN.map((b) => ({ id: b.id, payload: { removed: true } })))
    expect(categoryFor({ daveyType: 'checking' }, none).category).toBeUndefined()
  })
})

describe('managing categories', () => {
  it('adds, refusing blanks and duplicates (any case)', () => {
    const added = addCategory('  Kids   Fund ', 'sand', categories, () => 'new-id')
    expect(added).toMatchObject({ id: 'new-id', payload: { name: 'Kids Fund', colorName: 'sand', removed: false } })
    expect(added.payload.sortOrder).toBe(160)
    expect(() => addCategory('kids 529', 'blue', categories)).toThrow(/already/)
    expect(() => addCategory('  ', 'blue', categories)).toThrow(/name/)
  })

  it('renames a built-in by writing its fixed ID; the rename reaches every account in it', () => {
    const savings = categories.find((c) => c.name === 'Savings')!
    const change = renameCategory(savings, 'Reserve', categories, fixture.records)
    expect(change).toMatchObject({ id: BUILT_IN[1].id, payload: { name: 'Reserve' } })
    const after = effectiveCategories([...fixture.records, change])
    expect(rowsFor(accounts, after).find((r) => r.account.id === 'a2')!.category?.name).toBe('Reserve')
    expect(() => renameCategory(savings, 'checking', categories, fixture.records)).toThrow(/already/)
  })

  it('removes with reassign (or back to automatic), including round-1 text matches', () => {
    const giving = categories.find((c) => c.name === 'Giving')!
    const ops = categories.find((c) => c.name === 'Operating Cash')!
    const out = removeCategory(giving, ops.id, accounts, fixture.records)
    expect(out.category.payload.removed).toBe(true)
    expect(out.accounts).toEqual([{ id: 'a7', accountCategoryID: ops.id }])
    const auto = removeCategory(ops, undefined, accounts, fixture.records)
    expect(auto.accounts).toEqual([{ id: 'a1', accountCategoryID: null }])
    const after = effectiveCategories([...fixture.records, auto.category])
    expect(rowsFor(accounts.filter((a) => a.id === 'a1').map((a) => ({ ...a, accountCategoryID: undefined })), after)[0].category?.name).toBe('Checking')
  })

  it('reorders by rewriting positions', () => {
    const savings = categories.find((c) => c.name === 'Savings')!
    const changes = moveCategory(savings, -1, categories, fixture.records)
    const after = effectiveCategories([...fixture.records.filter((r) => !changes.some((c) => c.id === r.id)), ...changes])
    expect(after.slice(0, 3).map((c) => c.name)).toEqual(['Checking', 'Savings', 'Operating Cash'])
    expect(moveCategory(categories[0], -1, categories, fixture.records)).toEqual([])
  })
})

describe('the Accounts list', () => {
  it('groups by category (own order, empty ones hidden), bank, or none', () => {
    expect(sections(rows, 'category', categories).map((s) => s.title)).toEqual(fixture.expected.totals.map((t) => t[0]))
    expect(sections(rows, 'bank', categories).map((s) => [s.title, s.rows.length])).toEqual([['Harbor Credit Union', 2], ['Manual', 2], ['Northstar', 1], ['Summit Bank', 5]])
    expect(sections(rows, 'none', categories)).toHaveLength(1)
  })

  it('sorts by balance, name, bank, % funded and recently updated', () => {
    expect(sortRows(rows, 'balance').slice(0, 2).map((r) => r.account.id)).toEqual(['a10', 'a5'])
    expect(sortRows(rows, 'name')[0].account.name).toBe('Brokerage')
    expect(sortRows(rows, 'bank')[0].bank).toBe('Harbor Credit Union')
    expect(sortRows(rows, 'funded')[0].account.id).toBe('a2')
    const dated = rows.map((r, i) => ({ ...r, account: { ...r.account, lastSynced: new Date(2026, 9, i + 1).toISOString() } }))
    expect(sortRows(dated, 'updated')[0].account.id).toBe('a10')
    expect(sortRows(rows, 'name', -1)[0].account.name).toBe('Roth IRA')
  })

  it('filters by category chips, bank chips and search (bank, name, last-4, category)', () => {
    const retirement = categories.find((c) => c.name === 'Retirement')!.id
    expect(filterRows(rows, { categories: [retirement] }).map((r) => r.account.id)).toEqual(['a3'])
    expect(filterRows(rows, { banks: ['Northstar', 'Manual'] }).map((r) => r.account.id)).toEqual(['a6', 'a7', 'a10'])
    expect(filterRows(rows, { query: 'harbor' }).map((r) => r.account.id)).toEqual(['a2', 'a5'])
    expect(filterRows(rows, { query: 'kids' }).map((r) => r.account.id)).toEqual(['a9'])
    const masked = rows.map((r) => r.account.id === 'a6' ? { ...r, account: { ...r.account, mask: '1234' } } : r)
    expect(filterRows(masked, { query: '1234' }).map((r) => r.account.id)).toEqual(['a6'])
  })
})
