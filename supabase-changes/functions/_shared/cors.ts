// CORS for Davey on the web (https://daveypersonalfinance.com/app). The iOS app doesn't send an Origin header, so
// these headers change nothing for it. Use in every function the web app calls: plaid-link-token, plaid-exchange,
// plaid-sync.
//
//   import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
//   Deno.serve(async (req) => {
//     const preflight = handlePreflight(req); if (preflight) return preflight
//     ...
//     return new Response(JSON.stringify(body), { headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })
//   })

export const WEB_ORIGINS = ['https://daveypersonalfinance.com', 'https://www.daveypersonalfinance.com']

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin')
  if (!origin || !WEB_ORIGINS.includes(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export function handlePreflight(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response('ok', { status: 204, headers: corsHeaders(req) })
}
