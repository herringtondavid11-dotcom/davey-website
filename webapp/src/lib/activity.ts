import { supabase } from './supabase'

export interface LoginEvent {
  at: string
  action: string
  ip?: string
  device?: string
}

/** Login history from the login-activity Edge Function (reads auth.audit_log_entries). Null if not deployed. */
export async function fetchLoginActivity(): Promise<LoginEvent[] | null> {
  const { data, error } = await supabase.functions.invoke('login-activity', { body: {} })
  if (error || !Array.isArray(data?.events)) return null
  return (data.events as Record<string, unknown>[]).map((e) => ({
    at: String(e.created_at ?? e.at ?? ''),
    action: String(e.action ?? 'login'),
    ip: typeof e.ip_address === 'string' ? e.ip_address : undefined,
    device: typeof e.user_agent === 'string' ? describeAgent(e.user_agent) : undefined,
  }))
}

export function describeAgent(ua: string): string {
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Davey|CFNetwork/.test(ua) ? 'Davey app' : 'Browser'
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : ''
  return os ? `${browser} on ${os}` : browser
}

export const ACTION_LABEL: Record<string, string> = {
  login: 'Signed in',
  logout: 'Signed out',
  user_recovery_requested: 'Password reset requested',
  user_updated_password: 'Password changed',
  mfa_code_login: '2-step verified',
  factor_in_progress: '2-step setup started',
  verification_attempted: '2-step code tried',
}
