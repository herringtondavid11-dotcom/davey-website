// login-activity: the signed-in user's recent auth events (sign-ins, sign-outs, password and 2-step events)
// from auth.audit_log_entries. Only the caller's own rows are returned. SUPABASE_DB_URL is provided by the platform.
// Response: { events: [{ created_at, action, ip_address, user_agent? }] }
import postgres from 'npm:postgres@3'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { max: 1, prepare: false })
const ACTIONS = ['login', 'logout', 'user_recovery_requested', 'user_updated_password', 'mfa_code_login', 'factor_in_progress', 'verification_attempted']

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers })

  const rows = await sql`
    select created_at, ip_address, payload->>'action' as action, payload->'traits'->>'user_agent' as user_agent
    from auth.audit_log_entries
    where payload->>'actor_id' = ${u.user.id} and payload->>'action' = any(${ACTIONS})
    order by created_at desc
    limit 25`
  return new Response(JSON.stringify({ events: rows }), { headers })
})
