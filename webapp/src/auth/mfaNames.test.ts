import { describe, expect, it } from 'vitest'
import { isBackup, isNameConflict, uniqueFactorName } from './mfa'

describe('2-step factor names', () => {
  it('recognizes Supabase name conflicts', () => {
    expect(isNameConflict({ code: 'mfa_factor_name_conflict' })).toBe(true)
    expect(isNameConflict({ message: 'A factor with the friendly name "Davey authenticator" for this user already exists' })).toBe(true)
    expect(isNameConflict({ message: 'Invalid TOTP code entered' })).toBe(false)
    expect(isNameConflict(null)).toBe(false)
  })
  it('makes a unique retry name; backups stay recognizable', () => {
    expect(uniqueFactorName('Davey authenticator', new Date('2026-10-22T14:05:00Z'))).toBe('Davey authenticator (2026-10-22 14:05)')
    expect(isBackup({ friendly_name: 'Davey backup' })).toBe(true)
    expect(isBackup({ friendly_name: uniqueFactorName('Davey backup') })).toBe(true)
    expect(isBackup({ friendly_name: 'Davey authenticator (2026-10-22 14:05)' })).toBe(false)
  })
})
