import { describe, expect, it } from 'vitest'
import { base32Decode, formatRecoveryKey, hotp, totp } from './totp'

// RFC 4226 Appendix D / RFC 6238 Appendix B (SHA-1 seed "12345678901234567890").
const SEED_B32 = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'

describe('totp', () => {
  it('decodes base32', () => {
    expect(new TextDecoder().decode(base32Decode(SEED_B32))).toBe('12345678901234567890')
    expect(new TextDecoder().decode(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq'))).toBe('12345678901234567890')
  })
  it('rejects invalid keys', () => {
    expect(() => base32Decode('NOT-VALID-1!')).toThrow()
  })
  it('matches RFC 4226 HOTP vectors', async () => {
    const key = base32Decode(SEED_B32)
    const expected = ['755224', '287082', '359152', '969429', '338314']
    for (let i = 0; i < expected.length; i++) expect(await hotp(key, i)).toBe(expected[i])
  })
  it('matches RFC 6238 TOTP vectors (6 digits)', async () => {
    expect(await totp(SEED_B32, 59_000)).toBe('287082')
    expect(await totp(SEED_B32, 1111111109_000)).toBe('081804')
    expect(await totp(SEED_B32, 1234567890_000)).toBe('005924')
    expect(await totp(SEED_B32, 20000000000_000)).toBe('353130')
  })
  it('formats recovery keys in groups of four', () => {
    expect(formatRecoveryKey('abcdefghijklmnop')).toBe('ABCD EFGH IJKL MNOP')
  })
})
