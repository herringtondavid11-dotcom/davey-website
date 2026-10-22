import { isTransfer } from './budget'
import { toCsv } from './csv'
import { isLiability, netWorth } from './finance'
import { displayName } from './format'
import { Pdf } from './pdf'
import type { Account, Transaction } from './schema'
import type { Estimate, Pnl, TaxRates } from './tax'
import { zip } from './zip'

const usd = (v: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)

export function accountNameMap(accounts: Account[]) {
  const m = new Map<string, string>()
  for (const a of accounts) {
    m.set(a.id, displayName(a))
    if (a.plaidAccountId) m.set(a.plaidAccountId, displayName(a))
  }
  return m
}

export function transactionsCsv(list: Transaction[], names: Map<string, string>): string {
  return toCsv(
    ['Date', 'Description', 'Bank description', 'Category', 'Amount', 'Account', 'Business/Personal', 'Notes', 'Pending'],
    list.map((t) => [t.date, t.name, t.originalName ?? '', t.category ?? 'Uncategorized', t.amount.toFixed(2), t.accountId ? names.get(t.accountId) ?? '' : '', t.usage === 'business' ? 'Business' : 'Personal', t.notes ?? '', t.pending ? 'Yes' : 'No']),
  )
}

export function accountsCsv(accounts: Account[]): string {
  return toCsv(
    ['Account', 'Bank name', 'Institution', 'Last 4', 'Type', 'Balance', 'Available', 'Business/Personal'],
    accounts.map((a) => [displayName(a), a.name, a.institution ?? '', a.mask ?? '', a.subtype ?? a.type, (isLiability(a) ? -Math.abs(a.balance) : a.balance).toFixed(2), a.available?.toFixed(2) ?? '', a.usage === 'business' ? 'Business' : 'Personal']),
  )
}

export interface ReportInput {
  title: string
  period: string
  from: string
  to: string
  list: Transaction[]
  accounts: Account[]
  names: Map<string, string>
}

export function summaryPdf(r: ReportInput): Uint8Array {
  const pdf = new Pdf(`Davey - ${r.title}`)
  pdf.writeLine('Davey', 22, { bold: true, gap: 8 })
  pdf.writeLine(r.title, 14, { bold: true })
  pdf.writeLine(`${r.period} (${r.from} to ${r.to}) - generated ${new Date().toLocaleDateString('en-US')}`, 9, { gray: true, gap: 16 })

  let income = 0
  let spending = 0
  const cats = new Map<string, number>()
  for (const t of r.list) {
    if (isTransfer(t)) continue
    if (t.amount > 0) income += t.amount
    else {
      spending -= t.amount
      cats.set(t.category ?? 'Uncategorized', (cats.get(t.category ?? 'Uncategorized') ?? 0) - t.amount)
    }
  }
  const right = pdf.width - pdf.margin
  pdf.writeLine('Summary', 12, { bold: true, gap: 8 })
  pdf.table([{ label: '', x: pdf.margin }, { label: 'Amount', x: right, align: 'right' }], [['Income', usd(income)], ['Spending', usd(spending)], ['Net', usd(income - spending)]], 10)

  const w = netWorth(r.accounts)
  pdf.writeLine('Accounts', 12, { bold: true, gap: 8 })
  pdf.table(
    [{ label: 'Account', x: pdf.margin, max: 40 }, { label: 'Institution', x: 300, max: 24 }, { label: 'Balance', x: right, align: 'right' }],
    [...r.accounts.filter((a) => !a.hidden).map((a) => [displayName(a) + (a.mask ? ` (${a.mask.slice(-4)})` : ''), a.institution ?? '', usd(isLiability(a) ? -Math.abs(a.balance) : a.balance)]), ['Net worth', '', usd(w.net)]],
  )

  pdf.writeLine('Spending by category', 12, { bold: true, gap: 8 })
  pdf.table([{ label: 'Category', x: pdf.margin }, { label: 'Amount', x: right, align: 'right' }], [...cats].sort((a, b) => b[1] - a[1]).map(([c, v]) => [c, usd(v)]))

  pdf.writeLine('Transactions', 12, { bold: true, gap: 8 })
  pdf.table(
    [{ label: 'Date', x: pdf.margin }, { label: 'Description', x: 110, max: 34 }, { label: 'Category', x: 300, max: 20 }, { label: 'Account', x: 410, max: 16 }, { label: 'Amount', x: right, align: 'right' }],
    r.list.map((t) => [t.date, t.name, t.category ?? '', t.accountId ? r.names.get(t.accountId) ?? '' : '', usd(t.amount)]),
    8,
  )
  return pdf.output()
}

export interface TaxReportInput {
  year: number
  pnl: Pnl
  estimate: Estimate
  rates: TaxRates
  quarters: { label: string; from: string; to: string; due: string; profit: number; estimate: number }[]
  business: Transaction[]
  names: Map<string, string>
}

export function taxPdf(r: TaxReportInput): Uint8Array {
  const pdf = new Pdf(`Davey - ${r.year} business summary`)
  const right = pdf.width - pdf.margin
  pdf.writeLine('Davey', 22, { bold: true, gap: 8 })
  pdf.writeLine(`${r.year} business profit & loss`, 14, { bold: true })
  pdf.writeLine(`Prepared ${new Date().toLocaleDateString('en-US')} for your tax professional. Figures come from transactions marked Business.`, 9, { gray: true, gap: 16 })
  pdf.writeLine('Profit & loss', 12, { bold: true, gap: 8 })
  pdf.table(
    [{ label: '', x: pdf.margin }, { label: 'Amount', x: right, align: 'right' }],
    [['Gross income', usd(r.pnl.income)], ...r.pnl.byCategory.map((c) => [`  ${c.category}`, usd(-c.amount)]), ['Total expenses', usd(-r.pnl.expenses)], ['Net profit', usd(r.pnl.net)]],
    10,
  )
  pdf.writeLine('Estimated tax (planning estimate, not tax advice)', 12, { bold: true, gap: 8 })
  pdf.table(
    [{ label: '', x: pdf.margin }, { label: 'Amount', x: right, align: 'right' }],
    [
      ['Self-employment tax (15.3% of 92.35% of profit)', usd(r.estimate.selfEmployment)],
      [`Federal income tax at ${(r.rates.federal * 100).toFixed(0)}%`, usd(r.estimate.federal)],
      [`State income tax at ${(r.rates.state * 100).toFixed(1)}%`, usd(r.estimate.state)],
      ['Total', usd(r.estimate.total)],
    ],
    10,
  )
  pdf.writeLine('Quarterly estimated payments', 12, { bold: true, gap: 8 })
  pdf.table(
    [{ label: 'Period', x: pdf.margin }, { label: 'Months', x: 110 }, { label: 'Due', x: 260 }, { label: 'Profit', x: 440, align: 'right' }, { label: 'Estimate', x: right, align: 'right' }],
    r.quarters.map((q) => [q.label, `${q.from} to ${q.to}`, q.due, usd(q.profit), usd(q.estimate)]),
  )
  pdf.writeLine('Business transactions', 12, { bold: true, gap: 8 })
  pdf.table(
    [{ label: 'Date', x: pdf.margin }, { label: 'Description', x: 110, max: 34 }, { label: 'Category', x: 300, max: 20 }, { label: 'Account', x: 410, max: 16 }, { label: 'Amount', x: right, align: 'right' }],
    r.business.map((t) => [t.date, t.name, t.category ?? '', t.accountId ? r.names.get(t.accountId) ?? '' : '', usd(t.amount)]),
    8,
  )
  return pdf.output()
}

export function cpaZip(r: TaxReportInput): Uint8Array {
  const readme = [
    `Davey business records for ${r.year}`,
    '',
    'profit-and-loss.pdf     P&L, estimated tax and quarterly periods',
    'business-transactions.csv  Every transaction marked Business (negative = expense)',
    'expenses-by-category.csv   Totals per category',
    '',
    'Estimates assume the rates shown and ignore the Social Security wage cap, credits and other income.',
  ].join('\r\n')
  return zip([
    { name: 'README.txt', data: readme },
    { name: 'profit-and-loss.pdf', data: taxPdf(r) },
    { name: 'business-transactions.csv', data: transactionsCsv(r.business, r.names) },
    { name: 'expenses-by-category.csv', data: toCsv(['Category', 'Amount'], r.pnl.byCategory.map((c) => [c.category, c.amount.toFixed(2)])) },
  ])
}

export function fullZip(r: ReportInput): Uint8Array {
  return zip([
    { name: 'transactions.csv', data: transactionsCsv(r.list, r.names) },
    { name: 'accounts.csv', data: accountsCsv(r.accounts) },
    { name: 'summary.pdf', data: summaryPdf(r) },
  ])
}

export function download(filename: string, data: Uint8Array | string, type: string) {
  const blob = new Blob([typeof data === 'string' ? data : (data as BlobPart)], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

