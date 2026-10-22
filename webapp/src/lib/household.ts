import { SITE_ORIGIN } from '../config'
import { supabase } from './supabase'
import type { Role } from './tables'

export const INVITE_UNAVAILABLE = "Creating invites from the web needs a server update. Send the invite from the Davey app (Settings › Household) for now."

export function inviteUrl(token: string): string {
  return `${SITE_ORIGIN}/join?t=${encodeURIComponent(token)}`
}

/**
 * Asks the household-invite Edge Function for a new invite. Expected reply: { token } or { url }.
 * Throws INVITE_UNAVAILABLE when the function isn't deployed.
 */
export async function createInvite(opts: { firstName?: string; email?: string; role: Role }): Promise<string> {
  const { data, error } = await supabase.functions.invoke('household-invite', {
    body: { platform: 'web', first_name: opts.firstName || undefined, email: opts.email || undefined, role: opts.role },
  })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 404 || /not found|failed to send/i.test(error.message)) throw new Error(INVITE_UNAVAILABLE)
    throw new Error(error.message || "Couldn't create the invite.")
  }
  if (typeof data?.url === 'string') return data.url
  if (typeof data?.token === 'string') return inviteUrl(data.token)
  throw new Error(INVITE_UNAVAILABLE)
}

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', member: 'Can edit', viewer: 'View only' }
export const ROLE_HELP: Record<Role, string> = {
  owner: 'Manages the household, banks and members.',
  member: 'Sees and edits accounts, budgets and transactions.',
  viewer: 'Sees everything, changes nothing.',
}
