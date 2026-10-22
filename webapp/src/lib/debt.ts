// Loan and credit-card math. Rates are annual percentages (6.5 = 6.5%). Payments are monthly.

export function monthlyPayment(principal: number, ratePct: number, months: number): number {
  if (months <= 0) return principal
  const r = ratePct / 100 / 12
  if (r === 0) return principal / months
  return (principal * r) / (1 - (1 + r) ** -months)
}

export interface Payoff {
  months: number
  totalInterest: number
  totalPaid: number
  /** False when the payment doesn't cover the interest. */
  paysOff: boolean
}

export function payoff(balance: number, ratePct: number, payment: number, maxMonths = 1200): Payoff {
  const r = ratePct / 100 / 12
  let b = balance
  let interest = 0
  let months = 0
  if (balance <= 0) return { months: 0, totalInterest: 0, totalPaid: 0, paysOff: true }
  if (payment <= b * r) return { months: Infinity, totalInterest: Infinity, totalPaid: Infinity, paysOff: false }
  while (b > 0.005 && months < maxMonths) {
    const i = b * r
    interest += i
    b = b + i - payment
    months++
  }
  const totalPaid = balance + interest
  return { months, totalInterest: interest, totalPaid, paysOff: b <= 0.005 }
}

export interface ScheduleRow {
  year: number
  interest: number
  principal: number
  endBalance: number
}

/** Yearly summary of an amortizing loan from today's balance. */
export function yearlySchedule(balance: number, ratePct: number, payment: number, maxYears = 40): ScheduleRow[] {
  const r = ratePct / 100 / 12
  const rows: ScheduleRow[] = []
  let b = balance
  for (let year = 1; year <= maxYears && b > 0.005; year++) {
    let interest = 0
    let principal = 0
    for (let m = 0; m < 12 && b > 0.005; m++) {
      const i = b * r
      const p = Math.min(b, payment - i)
      if (p <= 0) return rows
      interest += i
      principal += p
      b -= p
    }
    rows.push({ year, interest, principal, endBalance: Math.max(0, b) })
  }
  return rows
}

export function addMonthsToDate(from: Date, months: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth() + months, 1)
  return d
}

export function monthsBetween(fromIso: string, to = new Date()): number {
  const [y, m] = fromIso.split('-').map(Number)
  return (to.getFullYear() - y) * 12 + (to.getMonth() + 1 - m)
}

export interface Refinance {
  newPayment: number
  monthlySavings: number
  /** Months until savings repay closing costs; Infinity if never. */
  breakEvenMonths: number
  currentInterestLeft: number
  newInterest: number
  lifetimeSavings: number
}

export function refinance(balance: number, currentRatePct: number, currentPayment: number, newRatePct: number, newTermMonths: number, closingCosts: number): Refinance {
  const newPayment = monthlyPayment(balance + 0, newRatePct, newTermMonths)
  const current = payoff(balance, currentRatePct, currentPayment)
  const next = payoff(balance, newRatePct, newPayment)
  const monthlySavings = currentPayment - newPayment
  return {
    newPayment,
    monthlySavings,
    breakEvenMonths: monthlySavings > 0 ? Math.ceil(closingCosts / monthlySavings) : Infinity,
    currentInterestLeft: current.totalInterest,
    newInterest: next.totalInterest,
    lifetimeSavings: current.totalInterest - next.totalInterest - closingCosts,
  }
}

export function equity(propertyValue: number, balance: number) {
  const eq = propertyValue - balance
  const ltv = propertyValue > 0 ? (balance / propertyValue) * 100 : 0
  return { equity: eq, ltv, pmiLikely: ltv > 80 }
}

export type UtilizationBand = 'excellent' | 'good' | 'fair' | 'high'
export function utilization(balance: number, limit?: number): { pct: number; band: UtilizationBand } | null {
  if (!limit || limit <= 0) return null
  const pct = (Math.max(0, balance) / limit) * 100
  const band: UtilizationBand = pct < 10 ? 'excellent' : pct < 30 ? 'good' : pct < 50 ? 'fair' : 'high'
  return { pct, band }
}

export const BAND_LABEL: Record<UtilizationBand, string> = {
  excellent: 'Excellent (under 10%)',
  good: 'Good (under 30%)',
  fair: 'Fair (30–50%)',
  high: 'High (over 50%)',
}

/** Avalanche: pay minimums everywhere and put the rest on the highest APR first. */
export function avalanche(cards: { id: string; balance: number; apr: number; minimum: number }[], monthlyBudget: number, maxMonths = 600) {
  const state = cards.map((c) => ({ ...c, b: Math.max(0, c.balance), paidOffMonth: 0 }))
  let month = 0
  let interest = 0
  const minTotal = state.reduce((s, c) => s + Math.min(c.minimum, c.b), 0)
  if (monthlyBudget < minTotal) return { months: Infinity, totalInterest: Infinity, order: [] as string[], feasible: false }
  while (state.some((c) => c.b > 0.005) && month < maxMonths) {
    month++
    for (const c of state) {
      const i = c.b * (c.apr / 100 / 12)
      c.b += i
      interest += i
    }
    let left = monthlyBudget
    for (const c of state) {
      const p = Math.min(c.b, c.minimum)
      c.b -= p
      left -= p
    }
    for (const c of [...state].sort((a, b) => b.apr - a.apr)) {
      if (left <= 0) break
      const p = Math.min(c.b, left)
      c.b -= p
      left -= p
    }
    for (const c of state) if (c.b <= 0.005 && !c.paidOffMonth) c.paidOffMonth = month
  }
  const feasible = state.every((c) => c.b <= 0.005)
  return {
    months: feasible ? month : Infinity,
    totalInterest: feasible ? interest : Infinity,
    order: [...state].sort((a, b) => a.paidOffMonth - b.paidOffMonth).map((c) => c.id),
    feasible,
  }
}
