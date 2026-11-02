import { describe, expect, it } from 'vitest'
import {
  OAUTH_RETURN_TIMEOUT_MS,
  bankRefusedMessage,
  canonicalAppHref,
  oauthAttemptFailed,
  oauthTimedOut,
  oauthWaitingMessage,
} from './plaid'

describe('OAuth return URL', () => {
  it('keeps the registered path and the oauth state when a slash was added', () => {
    expect(canonicalAppHref('https://daveypersonalfinance.com/app/oauth/?oauth_state_id=abc')).toBe('/app/oauth?oauth_state_id=abc')
    expect(canonicalAppHref('https://daveypersonalfinance.com/app/oauth?oauth_state_id=abc')).toBe('/app/oauth?oauth_state_id=abc')
    expect(canonicalAppHref('https://www.daveypersonalfinance.com/app/oauth/')).toBe('/app/oauth')
    expect(canonicalAppHref('https://daveypersonalfinance.com/app/')).toBe('/app/')
  })
})

describe('OAuth failure copy', () => {
  it('says Chase refused the connection, and names any other bank', () => {
    expect(bankRefusedMessage('ins_56', 'Chase')).toMatch(/Chase refused the connection/)
    expect(bankRefusedMessage(undefined, 'Chase')).toMatch(/not approved/)
    expect(oauthWaitingMessage('ins_56', 'Chase')).toMatch(/blank or says the connection was refused/)
    expect(bankRefusedMessage('ins_126339', 'SoFi')).toMatch(/^SoFi didn't finish/)
    expect(oauthWaitingMessage('ins_126339', 'SoFi')).toMatch(/^SoFi's sign-in is open/)
  })

  it('treats FAIL_OAUTH and INSUFFICIENT_CREDENTIALS as a failed attempt', () => {
    expect(oauthAttemptFailed('FAIL_OAUTH', {})).toBe(true)
    expect(oauthAttemptFailed('ERROR', { error_code: 'INSUFFICIENT_CREDENTIALS' })).toBe(true)
    expect(oauthAttemptFailed('ERROR', { error: { error_code: 'INSUFFICIENT_CREDENTIALS' } })).toBe(true)
    expect(oauthAttemptFailed('ERROR', { error_code: 'INVALID_CREDENTIALS' })).toBe(false)
    expect(oauthAttemptFailed('OPEN_OAUTH', {})).toBe(false)
  })

  it('waits longer than a real sign-in before giving up', () => {
    expect(OAUTH_RETURN_TIMEOUT_MS).toBeGreaterThan(110_000)
    const opened = 1_000
    expect(oauthTimedOut(opened, opened + OAUTH_RETURN_TIMEOUT_MS - 1)).toBe(false)
    expect(oauthTimedOut(opened, opened + OAUTH_RETURN_TIMEOUT_MS)).toBe(true)
  })
})
