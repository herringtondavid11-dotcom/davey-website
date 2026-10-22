import { describe, expect, it } from 'vitest'
import { maskEmail } from '../screens/EmailCode'
import { isEmailVerifiedSession, sessionMethods } from './AuthProvider'

const token = (amr: string[]) => `x.${btoa(JSON.stringify({ amr: amr.map((method) => ({ method, timestamp: 1 })) })).replace(/=+$/, '')}.y`

describe('web 2-step: emailed code', () => {
  it('a password alone is not enough; the emailed code (or a reset link) is', () => {
    expect(isEmailVerifiedSession(token(['password']))).toBe(false)
    expect(isEmailVerifiedSession(token(['password', 'otp']))).toBe(true)
    expect(isEmailVerifiedSession(token(['otp']))).toBe(true)
    expect(isEmailVerifiedSession(token(['recovery']))).toBe(true)
    expect(isEmailVerifiedSession('garbage')).toBe(false)
    expect(sessionMethods(token(['password', 'otp']))).toEqual(['password', 'otp'])
  })
  it('masks the address on screen', () => {
    expect(maskEmail('alex@example.com')).toBe('a•••@example.com')
  })
})
