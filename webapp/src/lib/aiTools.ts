// Davey AI tools, run in the browser on the data the web already holds (the server never sees raw data: the app
// does the same on-device). Mirrors the tool list in davey-ios supabase/functions/_shared/ai_tools.json.
import { annotations } from './annotations'
import { addMonths, currentMonth, isTransfer, monthKey } from './budget'
import { avalanche as _avalanche, equity, monthlyPayment, monthsBetween, payoff, refinance, utilization, yearlySchedule } from './debt'
import { isLiability } from './finance'
import { displayName } from './format'
import { detectRecurring } from './recurring'
import type { Account, Transaction } from './schema'
import { businessTransactions, estimateTax, findDeductions, groupDeductions, pnl, quarterly } from './tax'

void _avalanche
type Input = Record<string, unknown>
const r2 = (n: number) => Math.round(n * 100) / 100
const today = () => new Date().toISOString().slice(0, 10)
const INCOME = new Set(['Paycheck', 'Other Income'])
const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined)
const num = (v: unknown) => {
  if (v === undefined || v === null || v === '') return undefined
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(/[$,]/g, ''))
  return Number.isFinite(n) ? n : undefined
}

export interface ToolData {
  accounts: Account[]
  transactions: Transaction[]
  /** Accounts in scope (the screen's View). */
  scope: string[]
}

export class ToolError extends Error {}

function scoped(d: ToolData, input: Input) {
  const ids = Array.isArray(input.account_ids) && input.account_ids.length ? new Set(input.account_ids as string[]) : new Set(d.scope)
  return {
    accounts: d.accounts.filter((a) => ids.has(a.id)),
    transactions: d.transactions.filter((t) => t.accountId && ids.has(t.accountId) && !t.pending),
  }
}

function range(input: Input, defaultDays = 30) {
  const end = str(input.end) ?? today()
  const start = str(input.start) ?? new Date(Date.now() - defaultDays * 86400000).toISOString().slice(0, 10)
  return { start, end }
}

const isIncome = (t: Transaction) => t.amount > 0 && (INCOME.has(t.category ?? '') || !t.category)
/** Spending counts outflows; refunds (inflows in a spending category) reduce it. */
const spendOf = (t: Transaction) => (isTransfer(t) || INCOME.has(t.category ?? '') || (t.amount > 0 && !t.category) ? 0 : -t.amount)

function bucket(date: string, by: string) {
  if (by === 'month') return monthKey(date)
  if (by === 'week') {
    const d = new Date(date + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() - d.getUTCDay())
    return d.toISOString().slice(0, 10)
  }
  return 'total'
}

function loans(accounts: Account[]) {
  return accounts.filter((a) => a.type === 'loan').map((a) => {
    const balance = Math.abs(a.balance)
    const rate = a.apr ?? 6.5
    const left = a.termMonths && a.originationDate ? Math.max(1, a.termMonths - monthsBetween(a.originationDate)) : 300
    const payment = a.minimumPayment ?? monthlyPayment(balance, rate, left)
    return { a, balance, rate, payment }
  })
}

function pickLoan(accounts: Account[], id?: string) {
  const all = loans(accounts)
  const l = id ? all.find((x) => x.a.id === id) : all[0]
  if (!l) throw new ToolError('No loan in scope.')
  return l
}

function taxRates() {
  try {
    const r = JSON.parse(localStorage.getItem('davey.tax.rates') ?? 'null')
    if (r) return { federal: r.federal / 100, state: r.state / 100 }
  } catch {
    /* ignore */
  }
  return { federal: 0.22, state: 0.05 }
}

const TOOLS: Record<string, (d: ToolData, input: Input) => unknown> = {
  data_coverage: (d) => {
    const { accounts, transactions } = scoped(d, {})
    return {
      accounts: accounts.map((a) => {
        const ts = transactions.filter((t) => t.accountId === a.id).map((t) => t.date).sort()
        const months = new Set(ts.map(monthKey))
        const gaps: string[] = []
        if (ts.length) for (let m = monthKey(ts[0]); m <= currentMonth(); m = addMonths(m, 1)) if (!months.has(m)) gaps.push(m)
        return { account: displayName(a), account_id: a.id, earliest: ts[0] ?? null, latest: ts.at(-1) ?? null, count: ts.length, days: ts.length ? Math.round((Date.parse(ts.at(-1)!) - Date.parse(ts[0])) / 86400000) : 0, gap_months: gaps }
      }),
    }
  },
  account_balances: (d, input) => {
    const { accounts } = scoped(d, input)
    let assets = 0
    let debts = 0
    const rows = accounts.map((a) => {
      const owed = isLiability(a)
      if (owed) debts += Math.abs(a.balance)
      else assets += a.balance
      return { account: displayName(a), account_id: a.id, type: a.subtype ?? a.type, balance: r2(owed ? -Math.abs(a.balance) : a.balance) }
    })
    return { as_of: today(), note: str(input.as_of) && str(input.as_of)! < today() ? 'Davey on the web has current balances only.' : undefined, accounts: rows, total_assets: r2(assets), total_debts: r2(debts), net_worth: r2(assets - debts) }
  },
  spending_by_category: (d, input) => {
    const { start, end } = range(input)
    const cats = Array.isArray(input.category_ids) ? new Set(input.category_ids as string[]) : null
    const by = str(input.group_by) ?? 'none'
    const out = new Map<string, Map<string, number>>()
    for (const t of scoped(d, input).transactions) {
      if (t.date < start || t.date > end) continue
      const c = t.category ?? 'Uncategorized'
      if (cats && !cats.has(c)) continue
      const s = spendOf(t)
      if (!s) continue
      const b = bucket(t.date, by)
      const m = out.get(b) ?? new Map()
      m.set(c, (m.get(c) ?? 0) + s)
      out.set(b, m)
    }
    return { start, end, group_by: by, periods: [...out].sort().map(([period, m]) => ({ period, total: r2([...m.values()].reduce((a, b) => a + b, 0)), categories: [...m].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, category_id: category, amount: r2(amount) })) })) }
  },
  income_summary: (d, input) => {
    const { start, end } = range(input)
    const by = str(input.group_by) ?? 'month'
    const out = new Map<string, Map<string, number>>()
    for (const t of scoped(d, input).transactions) {
      if (t.date < start || t.date > end || !isIncome(t) || isTransfer(t)) continue
      const b = bucket(t.date, by)
      const m = out.get(b) ?? new Map()
      m.set(t.name, (m.get(t.name) ?? 0) + t.amount)
      out.set(b, m)
    }
    return { start, end, periods: [...out].sort().map(([period, m]) => ({ period, total: r2([...m.values()].reduce((a, b) => a + b, 0)), sources: [...m].sort((a, b) => b[1] - a[1]).map(([source, amount]) => ({ source, amount: r2(amount) })) })) }
  },
  monthly_trend: (d, input) => {
    const metric = str(input.metric) ?? 'spend'
    const months = Math.min(36, Math.max(1, num(input.months) ?? 6))
    const cat = str(input.category_id)
    if (metric === 'category' && !cat) throw new ToolError('category_id is required for metric category.')
    const txns = scoped(d, input).transactions
    const cur = currentMonth()
    const rows = Array.from({ length: months }, (_, i) => addMonths(cur, i - months + 1)).map((m) => {
      const inM = txns.filter((t) => monthKey(t.date) === m)
      const spend = inM.reduce((s, t) => s + (metric === 'category' ? ((t.category ?? 'Uncategorized') === cat ? spendOf(t) : 0) : spendOf(t)), 0)
      const income = inM.filter((t) => isIncome(t) && !isTransfer(t)).reduce((s, t) => s + t.amount, 0)
      const value = metric === 'income' ? income : metric === 'net' ? income - spend : spend
      return { month: m, value: r2(value), partial: m === cur }
    })
    const full = rows.filter((r) => !r.partial)
    return { metric, category_id: cat, months: rows, average_full_months: full.length ? r2(full.reduce((s, r) => s + r.value, 0) / full.length) : null }
  },
  compare_periods: (d, input) => {
    const metric = str(input.metric) ?? 'spend'
    const A = (input.period_a ?? {}) as Input
    const B = (input.period_b ?? {}) as Input
    const txns = scoped(d, input).transactions
    const calc = (p: Input) => {
      const inP = txns.filter((t) => t.date >= String(p.start) && t.date <= String(p.end))
      const spend = inP.reduce((s, t) => s + spendOf(t), 0)
      const income = inP.filter((t) => isIncome(t) && !isTransfer(t)).reduce((s, t) => s + t.amount, 0)
      const cats = new Map<string, number>()
      for (const t of inP) {
        const s = spendOf(t)
        if (s) cats.set(t.category ?? 'Uncategorized', (cats.get(t.category ?? 'Uncategorized') ?? 0) + s)
      }
      return { value: metric === 'income' ? income : metric === 'net' ? income - spend : spend, cats }
    }
    const a = calc(A)
    const b = calc(B)
    const drivers = [...new Set([...a.cats.keys(), ...b.cats.keys()])].map((c) => ({ category: c, change: r2((b.cats.get(c) ?? 0) - (a.cats.get(c) ?? 0)) })).sort((x, y) => Math.abs(y.change) - Math.abs(x.change)).slice(0, 5)
    return { metric, period_a: { ...A, value: r2(a.value) }, period_b: { ...B, value: r2(b.value) }, change: r2(b.value - a.value), percent_change: a.value ? r2(((b.value - a.value) / Math.abs(a.value)) * 100) : null, drivers }
  },
  top_merchants: (d, input) => {
    const { start, end } = range(input)
    const cat = str(input.category_id)
    const m = new Map<string, { amount: number; count: number }>()
    for (const t of scoped(d, input).transactions) {
      if (t.date < start || t.date > end || (cat && (t.category ?? 'Uncategorized') !== cat)) continue
      const s = spendOf(t)
      if (s <= 0) continue
      const e = m.get(t.name) ?? { amount: 0, count: 0 }
      e.amount += s
      e.count++
      m.set(t.name, e)
    }
    return { start, end, merchants: [...m].sort((a, b) => b[1].amount - a[1].amount).slice(0, Math.min(50, num(input.limit) ?? 10)).map(([merchant, e]) => ({ merchant, amount: r2(e.amount), count: e.count })) }
  },
  search_transactions: (d, input) => {
    const { start, end } = range(input, 3650)
    const q = (str(input.query) ?? '').toLowerCase()
    const min = num(input.min)
    const max = num(input.max)
    const cat = str(input.category_id)
    const merchant = str(input.merchant)?.toLowerCase()
    const found = scoped(d, input).transactions.filter((t) =>
      t.date >= start && t.date <= end &&
      (!q || `${t.name} ${t.category ?? ''} ${t.notes ?? ''}`.toLowerCase().includes(q)) &&
      (min === undefined || Math.abs(t.amount) >= min) && (max === undefined || Math.abs(t.amount) <= max) &&
      (!cat || (t.category ?? 'Uncategorized') === cat) && (!merchant || t.name.toLowerCase().includes(merchant)))
    return { count: found.length, total: r2(found.reduce((s, t) => s + t.amount, 0)), ids: found.slice(0, Math.min(200, num(input.limit) ?? 50)).map((t) => t.id), rows: found.slice(0, 30).map((t) => ({ id: t.id, date: t.date, merchant: t.name, category: t.category ?? 'Uncategorized', amount: r2(t.amount) })) }
  },
  budget_vs_actual: (d, input) => {
    const month = str(input.month) ?? currentMonth()
    const txns = scoped(d, input).transactions.filter((t) => monthKey(t.date) === month)
    const [y, m] = month.split('-').map(Number)
    const days = new Date(y, m, 0).getDate()
    const elapsed = month === currentMonth() ? new Date().getDate() : days
    return {
      month,
      note: 'Budgets set on the web (the app keeps its own on the device).',
      budgets: annotations().budgets.map((b) => {
        const spent = txns.filter((t) => (t.category ?? '').toLowerCase() === b.category.toLowerCase()).reduce((s, t) => s + spendOf(t), 0)
        const projected = (spent / Math.max(1, elapsed)) * days
        return { category: b.category, category_id: b.category, limit: b.amount, spent: r2(spent), remaining: r2(b.amount - spent), projected_month_end: r2(projected), on_track: projected <= b.amount }
      }),
    }
  },
  recurring_charges: (d) => ({
    series: detectRecurring(scoped(d, {}).transactions).map((r) => ({ merchant: r.name, kind: r.kind, cadence: r.frequency, amount: r2(r.amount), variable: r.variable, last_date: r.lastDate, next_date: r.nextDate, monthly: r2(r.monthly) })),
  }),
  cash_flow_forecast: (d, input) => {
    const days = num(input.days) ?? 30
    const { accounts, transactions } = scoped(d, {})
    const startCash = accounts.filter((a) => a.type === 'depository').reduce((s, a) => s + a.balance, 0)
    let cash = startCash
    const rec = detectRecurring(transactions)
    const recKeys = new Set(rec.map((r) => r.name))
    const last90 = transactions.filter((t) => t.date >= new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10) && !recKeys.has(t.name))
    const daily = last90.reduce((s, t) => s + spendOf(t), 0) / 90
    let low = { date: today(), balance: cash }
    const points: { date: string; balance: number }[] = []
    for (let i = 1; i <= days; i++) {
      const date = new Date(Date.now() + i * 86400000).toISOString().slice(0, 10)
      cash -= daily
      for (const r of rec) if (r.nextDate === date) cash += r.kind === 'income' ? r.amount : -r.amount
      if (cash < low.balance) low = { date, balance: cash }
      if (i % 7 === 0 || i === days) points.push({ date, balance: r2(cash) })
    }
    return { days, starting_cash: r2(startCash), average_daily_other_spend: r2(daily), points, low_point: { date: low.date, balance: r2(low.balance) }, note: 'Projection from detected recurring items (next occurrence) and average other spending.' }
  },
  net_worth_history: (d, input) => {
    const months = Math.min(36, num(input.months) ?? 6)
    const { accounts, transactions } = scoped(d, {})
    const nowNet = accounts.reduce((s, a) => s + (isLiability(a) ? -Math.abs(a.balance) : a.balance), 0)
    const cur = currentMonth()
    const rows = Array.from({ length: months }, (_, i) => addMonths(cur, -i)).map((m) => {
      const after = transactions.filter((t) => monthKey(t.date) > m && !isTransfer(t)).reduce((s, t) => s + t.amount, 0)
      return { month_end: m, net_worth: r2(nowNet - after) }
    }).reverse()
    return { months: rows, change: r2(rows.at(-1)!.net_worth - rows[0].net_worth), note: 'Estimated from current balances and cash flow since each month end (investment gains not included).' }
  },
  credit_card_summary: (d) => {
    const cards = scoped(d, {}).accounts.filter((a) => a.type === 'credit')
    return { cards: cards.map((c) => { const u = utilization(c.balance, c.creditLimit); return { card: displayName(c), owed: r2(c.balance), limit: c.creditLimit ?? null, available: c.creditLimit ? r2(c.creditLimit - c.balance) : null, utilization_percent: u ? r2(u.pct) : null, apr: c.apr ?? null } }) }
  },
  anomalies: (d, input) => {
    const { start, end } = range(input)
    const txns = scoped(d, input).transactions
    const byMerchant = new Map<string, number[]>()
    for (const t of txns) if (t.amount < 0) byMerchant.set(t.name, [...(byMerchant.get(t.name) ?? []), -t.amount])
    const out: Input[] = []
    const inRange = txns.filter((t) => t.date >= start && t.date <= end && t.amount < 0)
    for (const t of inRange) {
      const amounts = byMerchant.get(t.name) ?? []
      const sorted = [...amounts].sort((a, b) => a - b)
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0
      if (amounts.length >= 3 && -t.amount > median * 2.5) out.push({ id: t.id, kind: 'unusually_high', merchant: t.name, amount: r2(-t.amount), usual: r2(median), date: t.date })
      if (amounts.length === 1) out.push({ id: t.id, kind: 'first_time_merchant', merchant: t.name, amount: r2(-t.amount), date: t.date })
      if (/\bfee\b|overdraft|late charge|interest charge/i.test(t.name)) out.push({ id: t.id, kind: 'fee', merchant: t.name, amount: r2(-t.amount), date: t.date })
      const dup = inRange.find((o) => o !== t && o.name === t.name && o.amount === t.amount && Math.abs(Date.parse(o.date) - Date.parse(t.date)) <= 3 * 86400000 && o.id < t.id)
      if (dup) out.push({ id: t.id, kind: 'possible_duplicate', merchant: t.name, amount: r2(-t.amount), date: t.date })
    }
    return { start, end, items: out.slice(0, 40) }
  },
  business_pnl: (d, input) => {
    const { start, end } = range(input, 365)
    const biz = scoped(d, input).transactions.filter((t) => t.usage === 'business' && t.date >= start && t.date <= end && !isTransfer(t))
    const p = pnl(biz)
    return { start, end, income: r2(p.income), expenses: r2(p.expenses), net_profit: r2(p.net), margin_percent: p.income ? r2((p.net / p.income) * 100) : null, by_category: p.byCategory.map((c) => ({ category: c.category, amount: r2(c.amount) })) }
  },
  goal_progress: () => ({ goals: [], note: 'Savings goals live in the Davey app on your iPhone and Mac; the web can’t see them yet.' }),
  business_tax_estimate: (d, input) => {
    const period = str(input.period) ?? 'ytd'
    const y = new Date().getFullYear()
    const year = period === 'last_year' ? y - 1 : y
    const biz = businessTransactions(scoped(d, {}).transactions, year)
    let p = pnl(biz)
    if (period === 'projection' && year === y) {
      const factor = 365 / Math.max(1, (Date.now() - Date.UTC(y, 0, 1)) / 86400000)
      p = { ...p, income: p.income * factor, expenses: p.expenses * factor, net: p.net * factor }
    }
    const rates = taxRates()
    const e = estimateTax(p.net, rates)
    return { period, year, profit: r2(p.net), self_employment_tax: r2(e.selfEmployment), federal: r2(e.federal), state: r2(e.state), total: r2(e.total), effective_rate_percent: p.net > 0 ? r2((e.total / p.net) * 100) : 0, marginal_rate_percent: r2((rates.federal + rates.state) * 100), note: 'Estimate only (Davey on the web tax engine).' }
  },
  quarterly_estimates: (d) => {
    const y = new Date().getFullYear()
    return { year: y, quarters: quarterly(businessTransactions(scoped(d, {}).transactions, y), y, taxRates()).map((q) => ({ quarter: q.label, period: `${q.from} to ${q.to}`, due: q.due, profit: r2(q.profit), estimated_payment: r2(q.estimate), paid: null, status: q.due < today() ? 'past_due_date' : 'upcoming' })), note: 'Payments made are tracked in the app.' }
  },
  deduction_finder: (d) => ({ items: groupDeductions(findDeductions(scoped(d, {}).transactions, new Date().getFullYear())).slice(0, 20).map((g) => ({ merchant: g.name, reason: g.reason, total: r2(g.total), count: g.items.length, ids: g.items.map((t) => t.id) })) }),
  what_if: (d, input) => {
    const y = new Date().getFullYear()
    const base = pnl(businessTransactions(scoped(d, {}).transactions, y))
    const rates = taxRates()
    const now = estimateTax(base.net, rates)
    const profit = base.net * (1 + (num(input.revenue_change_percent) ?? 0) / 100) - (num(input.equipment_purchase) ?? 0) - (num(input.contractor_cost) ?? 0) - (num(input.retirement_contribution) ?? 0)
    const next = estimateTax(profit, rates)
    return { current: { profit: r2(base.net), tax: r2(now.total), after_tax: r2(base.net - now.total) }, scenario: { profit: r2(profit), tax: r2(next.total), after_tax: r2(profit - next.total) }, tax_change: r2(next.total - now.total) }
  },
  loan_summary: (d) => ({
    loans: loans(scoped(d, {}).accounts).map(({ a, balance, rate, payment }) => {
      const p = payoff(balance, rate, payment)
      return { account_id: a.id, loan: displayName(a), balance: r2(balance), rate_percent: rate, monthly_payment: r2(payment), payments_left: p.paysOff ? p.months : null, remaining_interest: p.paysOff ? r2(p.totalInterest) : null, next_payment_due: a.nextPaymentDue ?? null, home_equity: a.propertyValue ? equity(a.propertyValue, balance) : null }
    }),
  }),
  amortization: (d, input) => {
    const { a, balance, rate, payment } = pickLoan(scoped(d, {}).accounts, str(input.account_id))
    const r = rate / 100 / 12
    let b = balance
    const next12 = Array.from({ length: 12 }, (_, i) => { const interest = b * r; const principal = Math.min(b, payment - interest); b -= principal; return { payment: i + 1, principal: r2(principal), interest: r2(interest), balance: r2(b) } })
    const p = payoff(balance, rate, payment)
    return { loan: displayName(a), next_12: next12, by_year: yearlySchedule(balance, rate, payment).map((y) => ({ year: y.year, principal: r2(y.principal), interest: r2(y.interest), end_balance: r2(y.endBalance) })), payments_left: p.months, total_remaining_interest: r2(p.totalInterest) }
  },
  payoff_simulation: (d, input) => {
    const { a, balance, rate, payment } = pickLoan(scoped(d, {}).accounts, str(input.account_id))
    const extra = num(input.extra) ?? 0
    const lump = num(input.lump) ?? 0
    const base = payoff(balance, rate, payment)
    const sim = payoff(Math.max(0, balance - lump), rate, payment + extra)
    return { loan: displayName(a), months_now: base.months, months_with_extra: sim.months, months_saved: base.months - sim.months, interest_saved: r2(base.totalInterest - sim.totalInterest) }
  },
  refinance_compare: (d, input) => {
    const { a, balance, rate, payment } = pickLoan(scoped(d, {}).accounts, str(input.account_id))
    const newRate = num(input.rate)
    if (newRate === undefined) throw new ToolError('rate is required.')
    const r = refinance(balance, rate, payment, newRate, (num(input.term) ?? 30) * 12, num(input.costs) ?? 0)
    return { loan: displayName(a), new_payment: r2(r.newPayment), monthly_savings: r2(r.monthlySavings), break_even_months: Number.isFinite(r.breakEvenMonths) ? r.breakEvenMonths : null, lifetime_interest_difference: r2(r.lifetimeSavings) }
  },
}

export function runTool(name: string, input: Input, data: ToolData): unknown {
  const fn = TOOLS[name]
  if (!fn) throw new ToolError(`Unknown tool ${name}.`)
  return fn(data, input ?? {})
}

export const TOOL_NAMES = Object.keys(TOOLS)
