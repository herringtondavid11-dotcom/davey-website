import { isTransfer } from './budget'
import { merchantKey } from './recurring'
import type { Transaction } from './schema'

export interface Pnl {
  income: number
  expenses: number
  net: number
  byCategory: { category: string; amount: number }[]
  count: number
}

export function businessTransactions(list: Transaction[], year: number): Transaction[] {
  return list.filter((t) => t.usage === 'business' && t.date.startsWith(String(year)) && !isTransfer(t) && !t.pending)
}

export function pnl(list: Transaction[]): Pnl {
  let income = 0
  let expenses = 0
  const cats = new Map<string, number>()
  for (const t of list) {
    if (t.amount > 0) income += t.amount
    else {
      expenses += -t.amount
      const c = t.category ?? 'Uncategorized'
      cats.set(c, (cats.get(c) ?? 0) + -t.amount)
    }
  }
  return {
    income,
    expenses,
    net: income - expenses,
    byCategory: [...cats].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    count: list.length,
  }
}

/** IRS estimated-tax periods (they are not calendar quarters). */
export function quarters(year: number) {
  return [
    { q: 1, label: 'Q1', from: `${year}-01-01`, to: `${year}-03-31`, due: `${year}-04-15` },
    { q: 2, label: 'Q2', from: `${year}-04-01`, to: `${year}-05-31`, due: `${year}-06-15` },
    { q: 3, label: 'Q3', from: `${year}-06-01`, to: `${year}-08-31`, due: `${year}-09-15` },
    { q: 4, label: 'Q4', from: `${year}-09-01`, to: `${year}-12-31`, due: `${year + 1}-01-15` },
  ]
}

export interface TaxRates {
  /** Marginal federal income-tax rate, 0..1. */
  federal: number
  /** State income-tax rate, 0..1. */
  state: number
}

export interface Estimate {
  selfEmployment: number
  federal: number
  state: number
  total: number
}

/** Self-employment tax (15.3% on 92.35% of profit) + income tax on profit less half of SE tax. Ignores the SS wage cap. */
export function estimateTax(netProfit: number, rates: TaxRates): Estimate {
  const profit = Math.max(0, netProfit)
  const selfEmployment = profit * 0.9235 * 0.153
  const taxable = Math.max(0, profit - selfEmployment / 2)
  const federal = taxable * rates.federal
  const state = taxable * rates.state
  return { selfEmployment, federal, state, total: selfEmployment + federal + state }
}

export function quarterly(list: Transaction[], year: number, rates: TaxRates) {
  return quarters(year).map((q) => {
    const inQ = list.filter((t) => t.date >= q.from && t.date <= q.to)
    const p = pnl(inQ)
    return { ...q, profit: p.net, estimate: estimateTax(p.net, rates).total }
  })
}

const DEDUCTIBLE = /software|office|advertis|marketing|business|professional|legal|accounting|shipping|postage|supplies|education|conference|cowork|hosting|domain/i
const DEDUCTIBLE_MERCHANT = /adobe|canva|figma|notion|slack|zoom|google (workspace|ads|cloud)|microsoft 365|aws|amazon web|digitalocean|github|dropbox|squarespace|shopify|godaddy|namecheap|mailchimp|quickbooks|intuit|upwork|fiverr|staples|office depot|fedex|ups|usps|wework|linkedin|calendly|docusign/i

export interface DeductionHint {
  t: Transaction
  reason: string
}

/** Personal-tagged spending that looks like a business expense. */
export function findDeductions(list: Transaction[], year: number): DeductionHint[] {
  const out: DeductionHint[] = []
  for (const t of list) {
    if (t.usage === 'business' || t.amount >= 0 || !t.date.startsWith(String(year)) || isTransfer(t)) continue
    if (DEDUCTIBLE_MERCHANT.test(t.name)) out.push({ t, reason: 'Common business tool or service' })
    else if (t.category && DEDUCTIBLE.test(t.category)) out.push({ t, reason: `${t.category} is often deductible` })
  }
  return out.sort((a, b) => a.t.amount - b.t.amount)
}

export interface DeductionGroup {
  key: string
  name: string
  reason: string
  total: number
  items: Transaction[]
}

/** One row per merchant, biggest first. */
export function groupDeductions(hints: DeductionHint[]): DeductionGroup[] {
  const groups = new Map<string, DeductionGroup>()
  for (const h of hints) {
    const key = merchantKey(h.t.name) || h.t.name
    const g = groups.get(key) ?? { key, name: h.t.name, reason: h.reason, total: 0, items: [] }
    g.total += -h.t.amount
    g.items.push(h.t)
    groups.set(key, g)
  }
  return [...groups.values()].sort((a, b) => b.total - a.total)
}
