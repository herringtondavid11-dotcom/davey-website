import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearPass, hasAccess, minutesUntil, recheckPass, storedPass, verifyPin } from './accessPass'

const PASS = 'dap_' + 'A'.repeat(43)
const future = () => new Date(Date.now() + 86_400_000).toISOString()

function respond(status: number, body: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

afterEach(() => {
  vi.restoreAllMocks()
  clearPass()
})

describe('company access code', () => {
  it('stores the pass on a right code', async () => {
    const fetch = respond(200, { pass: PASS, expires_at: future() })
    expect(await verifyPin('123456')).toEqual({ ok: true })
    expect(hasAccess()).toBe(true)
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body))).toEqual({ action: 'verify', pin: '123456' })
  })
  it('reports tries left and lockouts', async () => {
    respond(401, { error: 'wrong_pin', attempts_left: 3 })
    expect(await verifyPin('000000')).toEqual({ ok: false, kind: 'wrong', attemptsLeft: 3 })
    respond(429, { error: 'locked', retry_at: '2030-01-01T00:00:00Z' })
    const locked = await verifyPin('000000')
    expect(locked.ok === false && locked.kind).toBe('locked')
    expect(hasAccess()).toBe(false)
  })
  it('treats a missing function or network error as unavailable, never as access', async () => {
    respond(404, { message: 'not found' })
    expect(await verifyPin('123456')).toEqual({ ok: false, kind: 'unavailable' })
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('offline'))
    expect(await verifyPin('123456')).toEqual({ ok: false, kind: 'unavailable' })
    expect(hasAccess()).toBe(false)
  })
  it('ignores expired or malformed stored passes', () => {
    localStorage.setItem('davey.accessPass', JSON.stringify({ pass: PASS, expiresAt: '2000-01-01T00:00:00Z' }))
    expect(storedPass()).toBeNull()
    localStorage.setItem('davey.accessPass', JSON.stringify({ pass: 'nope', expiresAt: future() }))
    expect(storedPass()).toBeNull()
  })
  it('drops a revoked pass, keeps it when offline', async () => {
    localStorage.setItem('davey.accessPass', JSON.stringify({ pass: PASS, expiresAt: future() }))
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('offline'))
    expect(await recheckPass()).toBe(true)
    respond(200, { valid: false })
    expect(await recheckPass()).toBe(false)
    expect(hasAccess()).toBe(false)
  })
  it('rounds minutes up', () => {
    const now = new Date('2026-10-22T12:00:00Z')
    expect(minutesUntil(new Date('2026-10-22T12:14:01Z'), now)).toBe(15)
  })
})
