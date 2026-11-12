import { describe, expect, it } from 'vitest'
import { accountBucket, assumptionsFromBaseline, assumedMinimum, deriveFutureBaseline, monthlyInvestmentFlow, type BaselineAccount } from './futureBaseline'
import type { Transaction } from './schema'

const now = new Date(2026, 5, 15)

function account(over: Partial<BaselineAccount> & Pick<BaselineAccount, 'id' | 'type'>): BaselineAccount {
  return { name: over.id, balance: 0, ...over }
}

function tx(over: Partial<Transaction>): Transaction {
  return {
    id: 't',
    date: '2026-03-15',
    name: 'Payee',
    amount: 0,
    usage: 'personal',
    pending: false,
    currency: 'USD',
    raw: {},
    ...over,
  }
}

describe('account buckets', () => {
  it('sorts linked accounts the way net worth does, and skips hidden ones', () => {
    expect(accountBucket(account({ id: 'a', type: 'investment' }))).toBe('investment')
    expect(accountBucket(account({ id: 'a', type: 'depository', subtype: 'savings' }))).toBe('cash')
    expect(accountBucket(account({ id: 'a', type: 'credit' }))).toBe('debt')
    expect(accountBucket(account({ id: 'a', type: 'loan', subtype: 'mortgage' }))).toBe('debt')
    expect(accountBucket(account({ id: 'a', type: 'other', subtype: 'property' }))).toBe('other')
    expect(accountBucket(account({ id: 'a', type: 'investment', hidden: true }))).toBeNull()
  })
})

describe('deriveFutureBaseline', () => {
  const accounts = [
    account({ id: 'brokerage', type: 'investment', balance: 50_000 }),
    account({ id: 'checking', type: 'depository', subtype: 'checking', balance: 8_000 }),
    account({ id: 'home', type: 'other', subtype: 'property', balance: 100_000 }),
    account({ id: 'hidden', type: 'depository', balance: 9_999, hidden: true }),
    account({ id: 'mortgage', name: 'Home Mortgage', type: 'loan', subtype: 'mortgage', balance: 20_000, apr: 6, minimumPayment: 200, propertyValue: 100_000 }),
  ]

  it('uses balances, not a mortgage property value, and sums to assets minus debts', () => {
    const base = deriveFutureBaseline({
      accounts,
      transactions: [],
      plannedAnnualIncome: 120_000,
      investmentFlowMonthly: 0,
      budgetLimits: [],
      now,
    })
    expect(base.investments).toBe(50_000)
    expect(base.cash).toBe(8_000)
    expect(base.other).toBe(100_000)
    expect(base.debts.map((d) => d.balance)).toEqual([20_000])
    expect(base.investments + base.cash + base.other - 20_000).toBe(138_000)
    expect(base.debtPayment).toBe(200)
    expect(base.annualIncome).toBe(120_000)
    expect(base.incomeSource).toBe('plan')
  })

  it('takes the savings rate from posted transactions and caps investment flow at that surplus', () => {
    const transactions: Transaction[] = []
    for (const month of ['01', '02', '03', '04', '05', '06']) {
      transactions.push(tx({ id: `in-${month}`, date: `2026-${month}-01`, name: 'Payroll', amount: 10_000, category: 'Income' }))
      transactions.push(tx({ id: `out-${month}`, date: `2026-${month}-03`, name: 'Rent', amount: -4_000, category: 'Home' }))
      transactions.push(tx({ id: `move-${month}`, date: `2026-${month}-04`, name: 'Transfer to brokerage', amount: -1_000, category: 'Transfer' }))
      transactions.push(tx({ id: `pend-${month}`, date: `2026-${month}-05`, name: 'Pending bonus', amount: 5_000, category: 'Income', pending: true }))
    }
    const base = deriveFutureBaseline({
      accounts,
      transactions,
      plannedAnnualIncome: null,
      investmentFlowMonthly: 5_000,
      budgetLimits: [9_000],
      now,
    })
    // Income 10_000, spending 4_000, transfers and pending left out → 60% saved.
    expect(base.incomeSource).toBe('actuals')
    expect(base.annualIncome).toBeCloseTo(120_000, 6)
    expect(base.savingsRate).toBeCloseTo(0.6, 6)
    // Observed deposits are $5,000 a month, under the $6,000 surplus, so the rest stays in cash.
    expect(base.monthlyInvestment).toBeCloseTo(5_000, 6)
    expect(base.monthlyCash).toBeCloseTo(1_000, 6)
    expect(assumptionsFromBaseline(base).contributionBasis).toBe('rate')
  })

  it('uses budget limits when there are not two months of transactions', () => {
    const base = deriveFutureBaseline({
      accounts: [account({ id: 'brokerage', type: 'investment', balance: 1_000 })],
      transactions: [tx({ date: '2026-06-01', amount: 8_000, category: 'Income' })],
      plannedAnnualIncome: null,
      investmentFlowMonthly: 0,
      budgetLimits: [3_000, 1_000],
      now,
    })
    expect(base.annualIncome).toBeCloseTo(96_000, 6)
    expect(base.monthlyInvestment).toBeCloseTo(4_000, 6)
    expect(base.monthlyCash).toBe(0)
  })

  it('keeps an observed investment withdrawal and parks surplus in cash', () => {
    const base = deriveFutureBaseline({
      accounts,
      transactions: [],
      plannedAnnualIncome: 120_000,
      investmentFlowMonthly: -200,
      budgetLimits: [4_000],
      now,
    })
    expect(base.monthlyInvestment).toBeCloseTo(-200, 6)
    expect(base.monthlyCash).toBeCloseTo(6_000, 6)
  })

  it('fills a missing card minimum from 2% or $25, and a loan minimum from its term', () => {
    const card = account({ id: 'card', type: 'credit', balance: 1_000 })
    expect(assumedMinimum(card, 1_000)).toBe(25)
    const loan = account({ id: 'auto', type: 'loan', balance: 12_000 })
    const r = 0.06 / 12
    const payment = (12_000 * r) / (1 - (1 + r) ** -60)
    expect(assumedMinimum(loan, 12_000)).toBeCloseTo(payment, 6)
  })
})

describe('monthlyInvestmentFlow', () => {
  it('averages net flow for the investment accounts over the trailing year', () => {
    const flow = monthlyInvestmentFlow(
      [
        { accountId: 'p-4', date: '2026-02-01', netFlow: 1_200 },
        { accountId: 'p-4', date: '2025-01-01', netFlow: 9_000 },
        { accountId: 'checking', date: '2026-03-01', netFlow: 500 },
      ],
      new Set(['acc-4', 'p-4']),
      now,
    )
    expect(flow).toBeCloseTo(100, 6)
    expect(monthlyInvestmentFlow([], new Set(['p-4']), now)).toBe(0)
  })
})
