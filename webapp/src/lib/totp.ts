// RFC 4226 / 6238 one-time codes (SHA-1, 30 s, 6 digits: what Supabase MFA uses). Used only to turn a backup
// recovery key (the secret of the user's "backup" TOTP factor) into a code, entirely in the browser.

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch)
    if (idx === -1) throw new Error('Invalid recovery key')
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(out)
}

export async function hotp(key: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new Uint8Array(8)
  let c = counter
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff
    c = Math.floor(c / 256)
  }
  const cryptoKey = await crypto.subtle.importKey('raw', key as BufferSource, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, msg))
  const offset = mac[mac.length - 1] & 0x0f
  const bin =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3]
  return String(bin % 10 ** digits).padStart(digits, '0')
}

export async function totp(secretBase32: string, timeMs = Date.now(), step = 30, digits = 6): Promise<string> {
  return hotp(base32Decode(secretBase32), Math.floor(timeMs / 1000 / step), digits)
}

/** Group a base32 secret for display: "ABCD EFGH ...". */
export function formatRecoveryKey(secret: string): string {
  return secret.replace(/\s/g, '').toUpperCase().match(/.{1,4}/g)?.join(' ') ?? secret
}
