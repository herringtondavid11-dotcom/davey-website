import { describe, expect, it } from 'vitest'
import { idleState, readLastActive, writeLastActive } from './idle'
import { claimOAuthResume, clearPendingLink, readPendingLink, savePendingLink } from './plaid'

const MIN = 60_000

describe('idle timeout', () => {
  it('warns at 28 minutes and expires at 30', () => {
    expect(idleState(0, 27 * MIN)).toBe('active')
    expect(idleState(0, 28 * MIN)).toBe('warning')
    expect(idleState(0, 30 * MIN)).toBe('expired')
  })
  it('round-trips the shared timestamp and tolerates bad values', () => {
    writeLastActive(localStorage, 1234)
    expect(readLastActive(localStorage)).toBe(1234)
    localStorage.setItem('davey.lastActive', 'nope')
    expect(readLastActive(localStorage)).toBeNull()
    expect(readLastActive(undefined)).toBeNull()
  })
})

describe('Plaid OAuth resume', () => {
  it('resumes exactly once per oauth_state_id', () => {
    localStorage.clear()
    savePendingLink({ linkToken: 'link-123', startedAt: new Date().toISOString() })
    const url = 'https://daveypersonalfinance.com/app/oauth?oauth_state_id=abc'
    expect(claimOAuthResume(url)).toBe(true)
    expect(claimOAuthResume(url)).toBe(false)
    expect(claimOAuthResume('https://daveypersonalfinance.com/app/oauth')).toBe(false)
    expect(claimOAuthResume('https://daveypersonalfinance.com/app/oauth?oauth_state_id=def')).toBe(true)
    expect(readPendingLink()?.linkToken).toBe('link-123')
    clearPendingLink()
    expect(readPendingLink()).toBeNull()
  })
  it('ignores a pending link older than a link token lives (4 hours)', () => {
    savePendingLink({ linkToken: 'old', startedAt: '2026-10-22T00:00:00Z' })
    expect(readPendingLink(localStorage, Date.parse('2026-10-22T03:59:00Z'))?.linkToken).toBe('old')
    expect(readPendingLink(localStorage, Date.parse('2026-10-22T04:01:00Z'))).toBeNull()
  })
  it('a new Link session can be resumed again', () => {
    localStorage.clear()
    const url = 'https://daveypersonalfinance.com/app/oauth?oauth_state_id=same'
    savePendingLink({ linkToken: 'a', startedAt: '' })
    expect(claimOAuthResume(url)).toBe(true)
    savePendingLink({ linkToken: 'b', startedAt: '' })
    expect(claimOAuthResume(url)).toBe(true)
  })
})
