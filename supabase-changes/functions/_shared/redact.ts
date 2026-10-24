// Drops Plaid tokens and other secrets from objects we store. Session ids, request ids, and institution
// ids stay. Never log the return value together with a raw request body.

const SECRET_KEY = /token|secret|password|credential|routing|account_number/i

export function redactTokens(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactTokens)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? '[redacted]' : redactTokens(child)
  }
  return out
}
