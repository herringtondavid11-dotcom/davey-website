import { describe, expect, it } from 'vitest'
import { RATE_LIMIT_MESSAGE, TOO_MANY_ATTEMPTS_MESSAGE, authErrorMessage } from './authErrors'

describe('auth error messages', () => {
  it('rate limits read as "too many emails"', () => {
    expect(authErrorMessage({ status: 429, code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' })).toBe(RATE_LIMIT_MESSAGE)
    expect(authErrorMessage({ status: 429, message: 'email rate limit exceeded' })).toBe(RATE_LIMIT_MESSAGE)
    expect(authErrorMessage({ status: 429, message: 'For security purposes, you can only request this after 58 seconds.' })).toBe('Too many emails. Wait 58 seconds, then try again.')
    expect(authErrorMessage({ status: 429, code: 'over_request_rate_limit', message: 'Request rate limit reached' })).toBe(TOO_MANY_ATTEMPTS_MESSAGE)
  })
  it('known codes get Davey wording, others keep Supabase text', () => {
    expect(authErrorMessage({ code: 'same_password' })).toMatch(/haven't used/)
    expect(authErrorMessage({ status: 400, message: 'Something else' })).toBe('Something else')
  })
})
