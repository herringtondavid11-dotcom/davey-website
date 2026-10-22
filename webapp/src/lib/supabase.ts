import { createClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/**
 * Email links verified by Supabase's own page arrive as #access_token=…&refresh_token=… (the iPhone app asks for that
 * form). The PKCE client only reads ?code=, so take the session from the fragment once, then clear it from the URL.
 */
export const hashSession: Promise<void> = (async () => {
  if (typeof window === 'undefined') return
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const access_token = hash.get('access_token')
  const refresh_token = hash.get('refresh_token')
  if (!access_token || !refresh_token) return
  window.history.replaceState(null, '', window.location.pathname + window.location.search)
  await supabase.auth.setSession({ access_token, refresh_token }).catch(() => undefined)
})()
