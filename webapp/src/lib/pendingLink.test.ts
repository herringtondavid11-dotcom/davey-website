import { beforeEach, describe, expect, it } from 'vitest'
import { pendingLinkFor, readPendingLink, savePendingLink } from './plaid'

const startedAt = '2026-10-22T10:00:00Z'
const at = (iso: string) => Date.parse(iso)

beforeEach(() => localStorage.clear())

describe('pending Link across the OAuth round trip', () => {
  it('lasts as long as a link token (4 hours), not 30 minutes', () => {
    savePendingLink({ linkToken: 'link-1', startedAt, userId: 'u1' })
    expect(readPendingLink(localStorage, at('2026-10-22T13:59:00Z'))?.linkToken).toBe('link-1')
    expect(readPendingLink(localStorage, at('2026-10-22T14:01:00Z'))).toBeNull()
  })
  it('resumes only for the user who started it; another user discards it', () => {
    savePendingLink({ linkToken: 'link-1', startedAt, userId: 'u1' })
    const now = at('2026-10-22T10:40:00Z')
    expect(pendingLinkFor('u1', localStorage, now)?.linkToken).toBe('link-1')
    expect(pendingLinkFor('u2', localStorage, now)).toBeNull()
    expect(pendingLinkFor('u1', localStorage, now)).toBeNull()
  })
})
