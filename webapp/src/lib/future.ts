// Long-term net worth projection for the Future page.
//
// Timing (same convention as forecast.ts / the iOS investment forecaster):
//   Monthly rate = annual rate / 12. This is nominal APR divided by twelve,
//   not the effective monthly rate (1+annual)^(1/12)-1.
//   Inside each month, in order:
//     1. Balances grow on the amount at the start of the month.
//        Investments use the investment return, cash uses the cash yield,
//        other assets grow at the inflation rate (so their real value stays flat
//        when the result is shown in today's dollars). Each debt accrues its own APR.
//     2. The debt payment is applied (interest already accrued in step 1).
//        Minimums are paid first, highest APR first when the payment can't cover
//        every minimum. Anything left goes to the highest APR (avalanche).
//        A payment larger than the balance pays the debt off and stops.
//        It is not added to cash: it is treated as paid from income, separate
//        from the investment and cash contributions. Once every debt is zero,
//        further payments do nothing.
//     3. Contributions land at the end of the month, after growth.
//        In "rate" mode they scale with income: the stored monthly amounts are
//        today's dollars, and month m of year index t (t = 0 during the first
//        year) contributes those amounts times (1 + incomeGrowth)^t.
//        In "fixed" mode the dollar amounts never change.
//        A negative contribution withdraws from that bucket, then from the
//        other liquid bucket (cash ↔ investments). Buckets never go below zero.
//     4. On a year boundary (month 12, 24, …) one-off events apply after
//        contributions. A positive amount is a windfall added to cash.
//        A negative amount is spent from cash, then investments, then other
//        assets, and is dropped once those are zero (it does not create debt).
//
// Income is not itself added to a balance. Annual income during year Y
// (Y = 1 at the first year mark) is today's annual income times
// (1 + incomeGrowth)^(Y-1): the raise applies at each anniversary, so the
// first year is earned at today's rate. Cumulative income is the sum of the
// monthly amounts through that year. Year 0 reports today's annual run rate
// and a cumulative of zero.
//
// Today's dollars divide every stock figure at a year mark by
// (1 + inflation/12)^(12·Y), and divide each month's income by that month's
// factor before adding it to the cumulative. Nominal results skip the division.

export const HORIZON_YEARS = 40
export const YEAR_MARKS = [5, 10, 15, 20, 25, 30, 35, 40] as const

/** Planning defaults when an account has no observed rate. Percents. */
export const FUTURE_DEFAULTS = {
  investmentReturnPercent: 7,
  cashYieldPercent: 4,
  inflationPercent: 3,
  incomeGrowthPercent: 3,
} as const

export interface DebtInput {
  balance: number
  /** Annual percentage rate, e.g. 6.5 for 6.5%. */
  apr: number
  /** Monthly minimum, applied before extra payment. */
  minimum: number
}

export interface FutureEvent {
  id: string
  /** 1..40. Applied at the end of that year. */
  year: number
  /** Positive adds to cash. Negative is spent from cash, then investments, then other assets. */
  amount: number
}

export type ContributionBasis = 'fixed' | 'rate'

export interface FutureAssumptions {
  investmentReturnPercent: number
  cashYieldPercent: number
  inflationPercent: number
  /** When true, every reported figure is in today's dollars. */
  realDollars: boolean
  incomeGrowthPercent: number
  /** Dollars per month at today's income. Scaled forward only in rate mode. */
  monthlyInvestment: number
  monthlyCash: number
  contributionBasis: ContributionBasis
  /** Total dollars per month toward debts. */
  debtPayment: number
  events: FutureEvent[]
}

export interface ProjectionInput {
  investments: number
  cash: number
  other: number
  debts: DebtInput[]
  /** Today's annual run rate. */
  annualIncome: number
  assumptions: FutureAssumptions
  /** Defaults to 40. Clamped to 0..40. */
  years?: number
}

export interface ProjectionPoint {
  year: number
  investments: number
  cash: number
  other: number
  /** Amount still owed. */
  debts: number
  netWorth: number
  /** Year 0: today's run rate. Year Y > 0: income earned during that year. */
  annualIncome: number
  cumulativeIncome: number
}

export interface Balances {
  investments: number
  cash: number
  other: number
  debts: DebtInput[]
}

export interface MonthStep {
  investmentMonthlyRate: number
  cashMonthlyRate: number
  otherMonthlyRate: number
  investmentContribution: number
  cashContribution: number
  debtPayment: number
  /** Applied at the end of the month. Zero when this month is not an event. */
  event: number
}

const finite = (n: number) => (Number.isFinite(n) ? n : 0)

export function defaultAssumptions(over: Partial<FutureAssumptions> = {}): FutureAssumptions {
  return {
    investmentReturnPercent: FUTURE_DEFAULTS.investmentReturnPercent,
    cashYieldPercent: FUTURE_DEFAULTS.cashYieldPercent,
    inflationPercent: FUTURE_DEFAULTS.inflationPercent,
    realDollars: false,
    incomeGrowthPercent: FUTURE_DEFAULTS.incomeGrowthPercent,
    monthlyInvestment: 0,
    monthlyCash: 0,
    contributionBasis: 'fixed',
    debtPayment: 0,
    events: [],
    ...over,
  }
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min
  return Math.min(max, Math.max(min, n))
}

/** A stored or typed assumptions object, or null when it isn't usable. */
export function assumptionsFromUnknown(value: unknown): FutureAssumptions | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const row = value as Record<string, unknown>
  const num = (key: string) => {
    const raw = row[key]
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) ? n : null
  }
  const investment = num('investmentReturnPercent')
  const cashYield = num('cashYieldPercent')
  const inflation = num('inflationPercent')
  const growth = num('incomeGrowthPercent')
  const monthlyInvestment = num('monthlyInvestment')
  const monthlyCash = num('monthlyCash')
  const debtPayment = num('debtPayment')
  if (investment === null || cashYield === null || inflation === null || growth === null) return null
  if (monthlyInvestment === null || monthlyCash === null || debtPayment === null) return null
  const basis: ContributionBasis = row.contributionBasis === 'rate' ? 'rate' : 'fixed'
  const events: FutureEvent[] = []
  if (Array.isArray(row.events)) {
    for (const item of row.events) {
      if (!item || typeof item !== 'object') continue
      const e = item as Record<string, unknown>
      const year = Math.round(Number(e.year))
      const amount = Number(e.amount)
      if (!Number.isInteger(year) || year < 1 || year > HORIZON_YEARS || !Number.isFinite(amount)) continue
      const id = typeof e.id === 'string' && e.id ? e.id : `event-${events.length + 1}`
      events.push({ id, year, amount: clamp(amount, -1_000_000_000, 1_000_000_000) })
      if (events.length >= 12) break
    }
  }
  return {
    investmentReturnPercent: clamp(investment, -20, 40),
    cashYieldPercent: clamp(cashYield, -5, 20),
    inflationPercent: clamp(inflation, -5, 20),
    realDollars: row.realDollars === true,
    incomeGrowthPercent: clamp(growth, -20, 40),
    monthlyInvestment: clamp(monthlyInvestment, -100_000_000, 100_000_000),
    monthlyCash: clamp(monthlyCash, -100_000_000, 100_000_000),
    contributionBasis: basis,
    debtPayment: clamp(debtPayment, 0, 100_000_000),
    events,
  }
}

/** Savings as a percent of today's annual income. Zero when there is no income. */
export function savingsRatePercent(assumptions: FutureAssumptions, annualIncome: number): number {
  if (!(annualIncome > 0)) return 0
  const monthly = assumptions.monthlyInvestment + assumptions.monthlyCash
  return clamp((monthly * 12 / annualIncome) * 100, 0, 100)
}

/**
 * Set today's monthly contributions from a savings rate, keeping the current
 * split between investments and cash. All of it goes to investments when both
 * are zero. Switches the basis to rate so later raises scale the dollars.
 */
export function withSavingsRate(assumptions: FutureAssumptions, annualIncome: number, ratePercent: number): FutureAssumptions {
  const rate = clamp(ratePercent, 0, 100)
  const total = annualIncome > 0 ? (annualIncome / 12) * (rate / 100) : 0
  const prev = assumptions.monthlyInvestment + assumptions.monthlyCash
  const investmentShare = prev > 0 ? assumptions.monthlyInvestment / prev : 1
  const monthlyInvestment = total * clamp(investmentShare, 0, 1)
  return {
    ...assumptions,
    contributionBasis: 'rate',
    monthlyInvestment,
    monthlyCash: total - monthlyInvestment,
  }
}

function payDebts(debts: DebtInput[], payment: number) {
  let left = Math.max(0, finite(payment))
  const byApr = () => debts.filter((d) => d.balance > 0.005).sort((a, b) => b.apr - a.apr || b.balance - a.balance)
  const ordered = byApr()
  const minimums = ordered.reduce((sum, d) => sum + Math.min(d.balance, d.minimum), 0)
  if (left + 1e-8 >= minimums) {
    for (const d of ordered) {
      const paid = Math.min(d.balance, d.minimum)
      d.balance -= paid
      left -= paid
    }
    for (const d of byApr()) {
      if (left <= 0) break
      const paid = Math.min(d.balance, left)
      d.balance -= paid
      left -= paid
    }
  } else {
    for (const d of ordered) {
      if (left <= 0) break
      const paid = Math.min(d.balance, d.minimum, left)
      d.balance -= paid
      left -= paid
    }
  }
  for (const d of debts) if (d.balance < 0.005) d.balance = 0
}

function take(investments: number, cash: number, other: number, amount: number, order: ('investments' | 'cash' | 'other')[]) {
  let left = amount
  const box = { investments, cash, other }
  for (const key of order) {
    if (left <= 0) break
    const paid = Math.min(box[key], left)
    box[key] -= paid
    left -= paid
  }
  return box
}

/** One month. Pure: does not mutate `state`. */
export function stepMonth(state: Balances, step: MonthStep): Balances {
  let investments = Math.max(0, finite(state.investments) * (1 + finite(step.investmentMonthlyRate)))
  let cash = Math.max(0, finite(state.cash) * (1 + finite(step.cashMonthlyRate)))
  let other = Math.max(0, finite(state.other) * (1 + finite(step.otherMonthlyRate)))
  const debts = state.debts.map((d) => ({
    balance: Math.max(0, finite(d.balance) * (1 + finite(d.apr) / 100 / 12)),
    apr: finite(d.apr),
    minimum: Math.max(0, finite(d.minimum)),
  }))
  payDebts(debts, step.debtPayment)

  const investIn = finite(step.investmentContribution)
  const cashIn = finite(step.cashContribution)
  if (investIn >= 0) investments += investIn
  else ({ investments, cash } = take(investments, cash, other, -investIn, ['investments', 'cash']))
  if (cashIn >= 0) cash += cashIn
  else ({ investments, cash } = take(investments, cash, other, -cashIn, ['cash', 'investments']))

  const event = finite(step.event)
  if (event > 0) cash += event
  else if (event < 0) ({ investments, cash, other } = take(investments, cash, other, -event, ['cash', 'investments', 'other']))

  return { investments, cash, other, debts }
}

function debtTotal(debts: DebtInput[]): number {
  return debts.reduce((sum, d) => sum + Math.max(0, d.balance), 0)
}

function deflator(inflationAnnual: number, month: number, real: boolean): number {
  if (!real || month <= 0) return 1
  const monthly = inflationAnnual / 12
  if (monthly === 0) return 1
  return (1 + monthly) ** month
}

/** Year-end balances for year 0 through `years`, plus income earned along the way. */
export function projectFuture(input: ProjectionInput): ProjectionPoint[] {
  const years = clamp(Math.round(input.years ?? HORIZON_YEARS), 0, HORIZON_YEARS)
  const a = input.assumptions
  const annualIncome = Math.max(0, finite(input.annualIncome))
  const growth = finite(a.incomeGrowthPercent) / 100
  const inflation = finite(a.inflationPercent) / 100
  const real = a.realDollars === true
  const events = new Map<number, number>()
  for (const event of a.events) {
    const year = Math.round(event.year)
    if (year < 1 || year > years) continue
    events.set(year, (events.get(year) ?? 0) + finite(event.amount))
  }

  let state: Balances = {
    investments: Math.max(0, finite(input.investments)),
    cash: Math.max(0, finite(input.cash)),
    other: Math.max(0, finite(input.other)),
    debts: input.debts.map((d) => ({ balance: Math.max(0, finite(d.balance)), apr: finite(d.apr), minimum: Math.max(0, finite(d.minimum)) })),
  }

  const point = (year: number, month: number, annual: number, cumulative: number): ProjectionPoint => {
    const scale = deflator(inflation, month, real)
    const owed = debtTotal(state.debts) / scale
    const investments = state.investments / scale
    const cash = state.cash / scale
    const other = state.other / scale
    return {
      year,
      investments,
      cash,
      other,
      debts: owed,
      netWorth: investments + cash + other - owed,
      annualIncome: annual,
      cumulativeIncome: cumulative,
    }
  }

  const points: ProjectionPoint[] = [point(0, 0, annualIncome, 0)]
  let cumulative = 0
  for (let month = 1; month <= years * 12; month++) {
    const yearIndex = Math.floor((month - 1) / 12)
    const scale = a.contributionBasis === 'rate' && annualIncome > 0 ? (1 + growth) ** yearIndex : 1
    const year = month / 12
    state = stepMonth(state, {
      investmentMonthlyRate: finite(a.investmentReturnPercent) / 100 / 12,
      cashMonthlyRate: finite(a.cashYieldPercent) / 100 / 12,
      otherMonthlyRate: inflation / 12,
      investmentContribution: finite(a.monthlyInvestment) * scale,
      cashContribution: finite(a.monthlyCash) * scale,
      debtPayment: finite(a.debtPayment),
      event: Number.isInteger(year) ? events.get(year) ?? 0 : 0,
    })
    const monthIncome = (annualIncome * (1 + growth) ** yearIndex) / 12
    cumulative += monthIncome / deflator(inflation, month, real)
    if (month % 12 === 0) {
      const earned = annualIncome * (1 + growth) ** (year - 1)
      points.push(point(year, month, earned / deflator(inflation, month, real), cumulative))
    }
  }
  return points
}

export function marksOf(points: ProjectionPoint[]): ProjectionPoint[] {
  const byYear = new Map(points.map((p) => [p.year, p]))
  return YEAR_MARKS.map((year) => byYear.get(year)).filter((p): p is ProjectionPoint => p !== undefined)
}
