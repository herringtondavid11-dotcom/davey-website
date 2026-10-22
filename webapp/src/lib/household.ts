// Household Sharing through the app's Edge Functions (household-status, household-invite, household-remove-member,
// household-leave, profile-update). One partner per household; roles are owner and member.
import { supabase } from './supabase'

export type Role = 'owner' | 'member' | 'viewer'

export interface HouseholdMember {
  user_id: string
  role: 'owner' | 'member'
  display_name: string | null
  joined_at: string | null
  is_you: boolean
}

export interface HouseholdInvite {
  id: string
  status: string
  first_name: string
  last_name: string
  email: string | null
  relationship: string
  expires_at: string
}

export interface HouseholdStatus {
  household_id: string
  role: 'owner' | 'member'
  members: HouseholdMember[]
  invites: HouseholdInvite[]
  can_invite: boolean
  email_enabled: boolean
  member_access?: { state: string; until: string | null }
  profile: { first_name: string; last_name: string; display_name: string; phone: string; email: string; needs_name: boolean }
}

export const INVITE_UNAVAILABLE = "Creating invites from the web needs a server update. Send the invite from the Davey app (Settings › Household) for now."

async function call<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    let payload: { error?: string; message?: string } = {}
    try {
      payload = await (error as { context?: Response }).context?.json()
    } catch {
      /* not JSON */
    }
    const status = (error as { context?: Response }).context?.status
    const e = new Error(payload.message || (status === undefined ? 'unreachable' : error.message)) as Error & { code?: string; status?: number }
    e.code = payload.error ?? (status === undefined ? 'unreachable' : undefined)
    e.status = status
    throw e
  }
  return data as T
}

let cached: Promise<HouseholdStatus> | null = null
export function householdStatus(force = false): Promise<HouseholdStatus> {
  if (!cached || force) {
    cached = call<HouseholdStatus>('household-status', {})
    cached.catch(() => (cached = null))
  }
  return cached
}

export function resetHousehold() {
  cached = null
}

export const RELATIONSHIPS = [
  ['spouse', 'Spouse'],
  ['partner', 'Partner'],
  ['family', 'Family'],
  ['other', 'Other'],
] as const

/** Owner (Premium) invites a partner. Returns the one-time link. */
export async function createInvite(opts: { firstName: string; lastName?: string; email?: string; relationship: string; sendEmail: boolean }): Promise<{ link: string; email: string }> {
  try {
    const r = await call<{ link: string; email: string }>('household-invite', {
      action: 'create',
      first_name: opts.firstName,
      last_name: opts.lastName || undefined,
      email: opts.email || undefined,
      relationship: opts.relationship,
      role: 'member',
      send_email: opts.sendEmail,
    })
    resetHousehold()
    return r
  } catch (e) {
    const err = e as Error & { code?: string }
    if (err.code === 'unreachable' || (e as { status?: number }).status === 404) throw new Error(INVITE_UNAVAILABLE)
    throw e
  }
}

export async function inviteAction(action: 'resend' | 'link' | 'cancel', inviteId: string): Promise<{ link?: string }> {
  const r = await call<{ link?: string }>('household-invite', { action, invite_id: inviteId })
  resetHousehold()
  return r
}

export async function removeMember(): Promise<void> {
  await call('household-remove-member', {})
  resetHousehold()
}

export async function leaveHousehold(): Promise<void> {
  await call('household-leave', {})
  resetHousehold()
}

export async function updateProfile(p: { firstName: string; lastName?: string; phone?: string }) {
  const r = await call<{ profile: unknown }>('profile-update', { first_name: p.firstName, last_name: p.lastName ?? '', phone: p.phone || undefined })
  resetHousehold()
  return r
}

export function inviteUrl(token: string): string {
  return `https://daveypersonalfinance.com/join?t=${encodeURIComponent(token)}`
}

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', member: 'Member', viewer: 'View only' }
export const ROLE_HELP: Record<Role, string> = {
  owner: 'Pays for Premium, manages the household and invites.',
  member: 'Sees and edits the shared banks, budgets and transactions.',
  viewer: 'Sees everything, changes nothing.',
}
