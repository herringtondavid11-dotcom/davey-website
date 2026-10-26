/**
 * A typed amount as dollars, or null when it isn't one: "$1,250.50", "1250", "-40", ".5". Rejects letters, "1e9",
 * more than two decimals and misplaced commas, so a typo can't become a billion dollars or a fraction of a cent.
 */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[$\s]/g, '')
  if (!/^-?(\d{1,3}(,\d{3})+|\d+)?(\.\d{1,2})?$/.test(t) || !/\d/.test(t)) return null
  const n = Number(t.replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

/** The message for an amount field, or '' when it's fine. */
export function moneyProblem(text: string, opts: { min?: number; positive?: boolean } = {}): string {
  if (!text.trim()) return ''
  const n = parseMoney(text)
  if (n === null) return 'Enter an amount like 1,250.50'
  if (opts.positive && n <= 0) return 'Enter an amount above $0'
  if (opts.min !== undefined && n < opts.min) return `Enter $${opts.min} or more`
  return ''
}
