// Starting balances and default contributions for the Future page, from the
// household's accounts, income, transactions, budgets, and investment flows.
//
// Buckets follow net worth (finance.ts): hidden accounts are skipped, debts are
// what is owed, and a mortgage's property_value is not added again. Davey keeps
// the home as its own account, and Overview does not add property_value either.
//
// Contributions, when something has been observed:
//   Surplus = average monthly income minus spending over the last six months
//   (transfers excluded, same rules as Cash flow). With fewer than two months
//   of transactions, surplus falls back to planned income minus this month's
//   budget limits.
//   Investment contribution is the average monthly net flow into investment
//   accounts over the last twelve snapshot months, capped at the surplus when
//   there is one (a single deposit is not treated as a permanent raise above
//   what was actually saved). The rest of the surplus goes to cash.
//   With no snapshot flows, the whole surplus goes to cash. If there is no
//   cash account to receive it, it goes to investments instead.
//   A negative snapshot flow is a withdrawal from investments and is kept even
//   when the surplus is positive.

import { averages, cashFlow, currentMonth } from './budget'
import { monthlyPayment, monthsBetween } from './debt'
import { isLiability } from './finance'
import type { FutureAssumptions } from './future'
import { defaultAssumptions } from './future'
import type { Transaction } from './schema'

export interface BaselineAccount {
  id: string
  name: string
  type: string
  subtype?: string
  balance: number
  hidden?: boolean
  /** Percent, e.g. 6.5. */
  apr?: number
  minimumPayment?: number
  termMonths?: number
  originationDate?: string
  propertyValue?: number
}

export interface FutureDebt {
  id: string
  name: string
  balance: number
  apr: number
  minimum: number
}

export interface FutureBaseline {
  investments: number
  cash: number
  other: number
  debts: FutureDebt[]
  /** Annual run rate used as year-0 income. */
  annualIncome: number
  incomeSource: 'plan' | 'actuals' | 'budgets' | 'none'
  monthlyInvestment: number
  monthlyCash: number
  debtPayment: number
  /** 0..1. */
  savingsRate: number
}

export interface BaselineInput {
  accounts: BaselineAccount[]
  transactions: Pick<Transaction, 'date' | 'amount' | 'pending' | 'category' | 'name' | 'usage'>[]
  /** Sum of income sources for the current year, when that total is above zero. */
  plannedAnnualIncome: number | null
  /** Average dollars per month added to (or withdrawn from) investment accounts. */
  investmentFlowMonthly: number
  /** This month's budget limits, used when transactions don't cover two months. */
  budgetLimits: number[]
  now?: Date
}

export type BalanceBucket = 'investment' | 'cash' | 'debt' | 'other'

export function accountBucket(a: Pick<BaselineAccount, 'type' | 'subtype' | 'hidden'>): BalanceBucket | null {
  if (a.hidden) return null
  const type = (a.type || '').toLowerCase()
  const sub = (a.subtype || '').toLowerCase()
  if (type === 'investment' || type === 'brokerage' || sub === 'investment' || sub === 'crypto') return 'investment'
  if (type === 'depository' || sub === 'checking' || sub === 'savings' || sub === 'cash') return 'cash'
  if (isLiability({ type }) || type === 'loan' || type === 'credit' || sub === 'creditcard' || sub === 'loan' || sub === 'otherliability') return 'debt'
  return 'other'
}

function termMonths(a: BaselineAccount): number {
  if (a.termMonths && a.termMonths > 0) {
    if (a.originationDate) return Math.max(1, a.termMonths - monthsBetween(a.originationDate))
    return a.termMonths
  }
  if (a.type === 'credit' || a.subtype === 'creditCard') return 0
  if (a.subtype === 'mortgage' || /\b(mortgage|heloc|home loan)\b/i.test(a.name)) return 300
  return 60
}

/** APR to project when the account doesn't have one: 18% revolving, 6% installment. */
export function assumedApr(a: BaselineAccount): number {
  if (a.apr !== undefined && Number.isFinite(a.apr) && a.apr >= 0) return a.apr
  if (a.type === 'credit' || a.subtype === 'creditCard') return 18
  return 6
}

/** Monthly amount that keeps a debt on a normal payoff path when the bank didn't send one. */
export function assumedMinimum(a: BaselineAccount, balance: number): number {
  if (!(balance > 0)) return 0
  if (a.minimumPayment !== undefined && a.minimumPayment > 0) return Math.min(balance, a.minimumPayment)
  const months = termMonths(a)
  if (months <= 0) return Math.min(balance, Math.max(25, balance * 0.02))
  return monthlyPayment(balance, assumedApr(a), months)
}

function isoMonthStart(now: Date, monthsBack: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * Average monthly investment net flow over the trailing `months` months.
 * `accountIds` should include both the account id and the Plaid account id,
 * because snapshots are keyed by whichever the server stored.
 */
export function monthlyInvestmentFlow(
  snapshots: { accountId: string; date: string; netFlow: number }[],
  accountIds: Set<string>,
  now = new Date(),
  months = 12,
): number {
  const start = isoMonthStart(now, months - 1)
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  let total = 0
  let seen = false
  for (const row of snapshots) {
    if (!accountIds.has(row.accountId) || row.date < start || row.date > today) continue
    if (!Number.isFinite(row.netFlow)) continue
    total += row.netFlow
    seen = true
  }
  if (!seen) return 0
  return total / months
}

export function deriveFutureBaseline(input: BaselineInput): FutureBaseline {
  let investments = 0
  let cash = 0
  let other = 0
  let hasCashAccount = false
  const debts: FutureDebt[] = []
  for (const account of input.accounts) {
    const bucket = accountBucket(account)
    if (!bucket) continue
    const balance = Number.isFinite(account.balance) ? account.balance : 0
    if (bucket === 'investment') investments += Math.max(0, balance)
    else if (bucket === 'cash') {
      hasCashAccount = true
      cash += Math.max(0, balance)
    } else if (bucket === 'other') other += Math.max(0, balance)
    else {
      const owed = Math.abs(balance)
      if (owed <= 0) continue
      debts.push({
        id: account.id,
        name: account.name,
        balance: owed,
        apr: assumedApr(account),
        minimum: assumedMinimum(account, owed),
      })
    }
  }

  const now = input.now ?? new Date()
  const posted = input.transactions.filter((t) => !t.pending)
  const months = cashFlow(posted as Transaction[], currentMonth(now), 6)
  const withData = months.filter((m) => m.income || m.spending)
  const avg = averages(months)
  const planned = input.plannedAnnualIncome && input.plannedAnnualIncome > 0 ? input.plannedAnnualIncome : null
  // A recorded month is a run rate only when nothing was entered on the Income page.
  let annualIncome = planned ?? (withData.length > 0 ? Math.max(0, avg.income) * 12 : 0)
  let incomeSource: FutureBaseline['incomeSource'] = planned ? 'plan' : annualIncome > 0 ? 'actuals' : 'none'

  const budgetSpending = input.budgetLimits.reduce((sum, n) => sum + Math.max(0, Number(n) || 0), 0)
  let saved = 0
  if (withData.length >= 2 && avg.income > 0 && annualIncome > 0) {
    saved = (annualIncome / 12) * Math.max(0, Math.min(1, avg.savingsRate))
  } else if (annualIncome > 0 && budgetSpending > 0) {
    saved = Math.max(0, annualIncome / 12 - budgetSpending)
    if (!planned) incomeSource = withData.length > 0 ? 'actuals' : 'budgets'
  }

  const flow = Number.isFinite(input.investmentFlowMonthly) ? input.investmentFlowMonthly : 0
  let monthlyInvestment = 0
  let monthlyCash = 0
  if (flow >= 0) {
    monthlyInvestment = saved > 0 ? Math.min(flow, saved) : flow
    monthlyCash = Math.max(0, saved - monthlyInvestment)
  } else {
    monthlyInvestment = flow
    monthlyCash = Math.max(0, saved)
  }
  if (!hasCashAccount && monthlyCash > 0) {
    monthlyInvestment += monthlyCash
    monthlyCash = 0
  }

  const debtPayment = debts.reduce((sum, d) => sum + d.minimum, 0)
  const monthlyIncome = annualIncome / 12
  return {
    investments,
    cash,
    other,
    debts,
    annualIncome,
    incomeSource,
    monthlyInvestment,
    monthlyCash,
    debtPayment,
    savingsRate: monthlyIncome > 0 ? Math.max(0, (monthlyInvestment + monthlyCash) / monthlyIncome) : 0,
  }
}

export function assumptionsFromBaseline(baseline: FutureBaseline): FutureAssumptions {
  return defaultAssumptions({
    monthlyInvestment: baseline.monthlyInvestment,
    monthlyCash: baseline.monthlyCash,
    debtPayment: baseline.debtPayment,
    contributionBasis: baseline.annualIncome > 0 ? 'rate' : 'fixed',
    events: [],
  })
}
