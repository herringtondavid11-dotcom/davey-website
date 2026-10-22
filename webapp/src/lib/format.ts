import type { Account } from './schema'

const formatters = new Map<string, Intl.NumberFormat>()
export function money(value: number, currency = 'USD', opts: { sign?: boolean } = {}): string {
  const key = currency + (opts.sign ? '+' : '')
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat('en-US', { style: 'currency', currency, signDisplay: opts.sign ? 'exceptZero' : 'auto' })
    formatters.set(key, f)
  }
  return f.format(value)
}

export function displayName(a: Pick<Account, 'nickname' | 'name'>): string {
  return a.nickname?.trim() || a.name
}

export function maskLabel(mask?: string): string {
  if (!mask) return ''
  return '•••• ' + mask.slice(-4)
}

/** "2026-10-21" → "Oct 21" (or "Oct 21, 2025" outside the current year). Dates are calendar dates, not instants. */
export function shortDate(iso: string, now = new Date()): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(y !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

export function typeLabel(type: string): string {
  const labels: Record<string, string> = {
    depository: 'Cash',
    credit: 'Credit cards',
    loan: 'Loans',
    investment: 'Investments',
    brokerage: 'Investments',
    other: 'Other',
  }
  return labels[type] ?? type.charAt(0).toUpperCase() + type.slice(1)
}

export function shortDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export function percentText(v: number, digits = 0): string {
  return `${v.toFixed(digits)}%`
}
