// Company access code (WEB-PIN.md): the 6-digit PIN is checked by the access-pin function (ACCESS_PIN secret), which
// returns a 30-day pass. The browser keeps the pass; sign-up sends it to Auth (user_metadata.access_pass), where the
// before-user-created hook checks it again, so the API can't skip the PIN.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'

const KEY = 'davey.accessPass'

export type StoredPass = { pass: string; expiresAt: string }

export type PinResult =
  | { ok: true }
  | { ok: false; kind: 'wrong'; attemptsLeft: number }
  | { ok: false; kind: 'locked'; retryAt: Date }
  | { ok: false; kind: 'unavailable' }

export function storedPass(now = new Date()): StoredPass | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as StoredPass
    if (typeof value?.pass !== 'string' || !/^dap_[A-Za-z0-9_-]{43}$/.test(value.pass)) return null
    if (!(Date.parse(value.expiresAt) > now.getTime())) return null
    return value
  } catch {
    return null
  }
}

export function hasAccess(): boolean {
  return storedPass() !== null
}

export function clearPass() {
  try { localStorage.removeItem(KEY) } catch { /* storage off */ }
}

function savePass(value: StoredPass) {
  try { localStorage.setItem(KEY, JSON.stringify(value)) } catch { /* storage off: asked again next time */ }
}

async function call(body: Record<string, unknown>): Promise<Response> {
  return fetch(`${SUPABASE_URL}/functions/v1/access-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify(body),
  })
}

export async function verifyPin(pin: string): Promise<PinResult> {
  let response: Response
  try {
    response = await call({ action: 'verify', pin })
  } catch {
    return { ok: false, kind: 'unavailable' }
  }
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (response.ok && typeof body.pass === 'string' && typeof body.expires_at === 'string') {
    savePass({ pass: body.pass, expiresAt: body.expires_at })
    return { ok: true }
  }
  if (body.error === 'wrong_pin') return { ok: false, kind: 'wrong', attemptsLeft: Number(body.attempts_left) || 0 }
  if (body.error === 'locked') {
    const retry = typeof body.retry_at === 'string' ? new Date(body.retry_at) : new Date(Date.now() + 15 * 60_000)
    return { ok: false, kind: 'locked', retryAt: retry }
  }
  return { ok: false, kind: 'unavailable' }
}

/** Re-checks the stored pass with the server (revoked when the code changes). Network errors keep the pass. */
export async function recheckPass(): Promise<boolean> {
  const stored = storedPass()
  if (!stored) return false
  try {
    const response = await call({ action: 'check', pass: stored.pass })
    if (!response.ok) return true
    const body = (await response.json()) as { valid?: boolean }
    if (body.valid === false) {
      clearPass()
      return false
    }
  } catch { /* offline: keep it */ }
  return true
}

export function minutesUntil(date: Date, now = new Date()): number {
  return Math.max(1, Math.ceil((date.getTime() - now.getTime()) / 60_000))
}
