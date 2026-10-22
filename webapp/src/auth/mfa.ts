import type { Factor } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { totp } from '../lib/totp'

export const BACKUP_FACTOR_NAME = 'Davey backup'
export const PRIMARY_FACTOR_NAME = 'Davey authenticator'

export function isBackup(f: Pick<Factor, 'friendly_name'>) {
  return f.friendly_name === BACKUP_FACTOR_NAME
}

export interface FactorSummary {
  primary?: Factor
  backup?: Factor
  unverified: Factor[]
}

export function summarizeFactors(factors: Factor[]): FactorSummary {
  const totpFactors = factors.filter((f) => f.factor_type === 'totp')
  const verified = totpFactors.filter((f) => f.status === 'verified')
  return {
    primary: verified.find((f) => !isBackup(f)),
    backup: verified.find(isBackup),
    unverified: totpFactors.filter((f) => f.status !== 'verified'),
  }
}

export async function listFactors(): Promise<FactorSummary> {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error
  return summarizeFactors(data.all)
}

export async function verifyCode(factorId: string, code: string) {
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.replace(/\s/g, '') })
  if (error) throw new Error(error.message?.includes('Invalid') ? "That code didn't work. Try the newest one." : error.message)
}

/** Remove abandoned, unverified enrollments so a fresh enroll doesn't hit the friendly-name uniqueness rule. */
export async function cleanupUnverified(summary: FactorSummary) {
  for (const f of summary.unverified) await supabase.auth.mfa.unenroll({ factorId: f.id })
}

export async function enrollTotp(friendlyName: string) {
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName, issuer: 'Davey' })
  if (error) throw error
  return { id: data.id, qr: data.totp.qr_code, secret: data.totp.secret, uri: data.totp.uri }
}

/**
 * Backup recovery key: a second TOTP factor whose secret is shown to the user once. Using it (we derive the
 * current code in the browser) proves possession; afterwards the key is rotated, so each key works once.
 */
export async function createBackupKey(existing?: Factor): Promise<string> {
  if (existing) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: existing.id })
    if (error) throw error
  }
  const enrolled = await enrollTotp(BACKUP_FACTOR_NAME)
  await verifyCode(enrolled.id, await totp(enrolled.secret))
  return enrolled.secret
}

export async function verifyWithRecoveryKey(backup: Factor, key: string) {
  let code: string
  try {
    code = await totp(key)
  } catch {
    throw new Error("That recovery key isn't valid. Check for typos.")
  }
  try {
    await verifyCode(backup.id, code)
  } catch {
    throw new Error("That recovery key didn't work. It may have been replaced by a newer one.")
  }
}
