// plaid-link-token: creates a Plaid Link token for the signed-in user.
//   iOS:  POST {}                                  → redirect_uri = iOS universal link (unchanged behaviour)
//   Web:  POST { "platform": "web", ... }          → redirect_uri = https://daveypersonalfinance.com/app/oauth
// Response: { link_token, expiration }
//
// Secrets (already set for the existing function; names may differ — see WEB-PHASE1.md before deploying):
//   PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV (production|sandbox), optional PLAID_WEBHOOK_URL,
//   optional PLAID_IOS_REDIRECT_URI, optional PLAID_PRODUCTS (comma-separated, default "transactions").
//   SUPABASE_URL and SUPABASE_ANON_KEY are provided by the platform.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
import { linkTokenRequest, parsePlatform } from './platform.ts'

const PLAID_HOSTS: Record<string, string> = {
  production: 'https://production.plaid.com',
  sandbox: 'https://sandbox.plaid.com',
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization') ?? ''
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  })
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return json(req, { error: 'unauthorized' }, 401)

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    /* empty body: iOS default */
  }

  const env = Deno.env.get('PLAID_ENV') ?? 'production'
  const host = PLAID_HOSTS[env]
  if (!host) return json(req, { error: 'bad_plaid_env' }, 500)

  const request = linkTokenRequest({
    platform: parsePlatform(body),
    userId: userData.user.id,
    products: (Deno.env.get('PLAID_PRODUCTS') ?? 'transactions').split(',').map((p) => p.trim()).filter(Boolean),
    webhook: Deno.env.get('PLAID_WEBHOOK_URL') ?? undefined,
    iosRedirectUri: Deno.env.get('PLAID_IOS_REDIRECT_URI') ?? undefined,
  })

  const response = await fetch(`${host}/link/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: Deno.env.get('PLAID_CLIENT_ID'), secret: Deno.env.get('PLAID_SECRET'), ...request }),
  })
  const plaid = await response.json()
  if (!response.ok) {
    console.error('link/token/create failed', plaid.error_code, plaid.error_message, plaid.request_id)
    return json(req, { error: plaid.error_code ?? 'plaid_error', message: plaid.display_message ?? 'Could not start Plaid Link.' }, 502)
  }
  return json(req, { link_token: plaid.link_token, expiration: plaid.expiration })
})
