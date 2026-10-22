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

/**
 * The household from the database, read as the signed-in user (RLS: members see their household, members and its
 * invites; everyone sees their own profile). No Edge Function needed for reading.
 */
async function loadStatus(): Promise<HouseholdStatus> {
  const { data: auth } = await supabase.auth.getUser()
  const me = auth.user?.id
  if (!me) throw new Error('Not signed in.')
  const [members, profile] = await Promise.all([
    supabase.from('household_members').select('household_id,user_id,role,display_name,joined_at'),
    supabase.from('profiles').select('first_name,last_name,display_name,phone,email').eq('id', me).maybeSingle(),
  ])
  if (members.error) throw Object.assign(new Error(members.error.message), { code: members.error.code })
  const rows = (members.data ?? []) as { household_id: string; user_id: string; role: 'owner' | 'member'; display_name: string; joined_at: string }[]
  const mine = rows.find((m) => m.user_id === me)
  const role = mine?.role ?? 'owner'
  let invites: HouseholdInvite[] = []
  if (mine && role === 'owner') {
    const inv = await supabase
      .from('household_invites')
      .select('id,kind,expires_at,used_at,revoked,invitee_first_name,invitee_last_name,invitee_email,relationship')
      .eq('household_id', mine.household_id)
      .eq('kind', 'link')
      .order('created_at', { ascending: false })
      .limit(10)
    const now = Date.now()
    invites = ((inv.data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      status: r.used_at ? 'accepted' : r.revoked ? 'cancelled' : Date.parse(String(r.expires_at)) < now ? 'expired' : 'pending',
      first_name: String(r.invitee_first_name ?? ''),
      last_name: String(r.invitee_last_name ?? ''),
      email: (r.invitee_email as string) ?? null,
      relationship: String(r.relationship ?? 'other'),
      expires_at: String(r.expires_at),
    }))
  }
  const p = (profile.data ?? {}) as Record<string, string | null>
  return {
    household_id: mine?.household_id ?? '',
    role,
    members: (mine ? rows : []).map((m) => ({ user_id: m.user_id, role: m.role, display_name: m.display_name || null, joined_at: m.joined_at, is_you: m.user_id === me })),
    invites,
    can_invite: role === 'owner',
    email_enabled: true,
    profile: {
      first_name: p.first_name ?? '', last_name: p.last_name ?? '', display_name: p.display_name ?? '', phone: p.phone ?? '',
      email: p.email ?? auth.user?.email ?? '', needs_name: !(p.first_name || p.display_name),
    },
  }
}

export function householdStatus(force = false): Promise<HouseholdStatus> {
  if (!cached || force) {
    cached = loadStatus()
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
  ['parent', 'Parent'],
  ['child', 'Child'],
  ['sibling', 'Sibling'],
  ['friend', 'Friend'],
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

export const ACTION_UNAVAILABLE = "This needs a server update before it works on the web. Do it in the Davey app (Settings › Household) for now."

async function action<T>(name: string, body: Record<string, unknown>): Promise<T> {
  try {
    const r = await call<T>(name, body)
    resetHousehold()
    return r
  } catch (e) {
    if ((e as { code?: string }).code === 'unreachable' || (e as { status?: number }).status === 404) throw new Error(ACTION_UNAVAILABLE)
    throw e
  }
}

export function inviteAction(kind: 'resend' | 'link' | 'cancel', inviteId: string): Promise<{ link?: string }> {
  return action('household-invite', { action: kind, invite_id: inviteId })
}

export function removeMember(): Promise<unknown> {
  return action('household-remove-member', {})
}

export function leaveHousehold(): Promise<unknown> {
  return action('household-leave', {})
}

/** Own profile, written directly (RLS allows first/last/display name and phone) and shown to the partner. */
export async function updateProfile(p: { firstName: string; lastName?: string; phone?: string }) {
  const { data: auth } = await supabase.auth.getUser()
  const id = auth.user?.id
  if (!id) throw new Error('Not signed in.')
  const fields = { first_name: p.firstName, last_name: p.lastName || null, display_name: p.firstName, phone: p.phone || null }
  const { error } = await supabase.from('profiles').update(fields).eq('id', id)
  if (error) throw new Error(error.message)
  await supabase.from('household_members').update({ display_name: p.firstName }).eq('user_id', id)
  resetHousehold()
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
