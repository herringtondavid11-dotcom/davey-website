// plaid-report-issue: stores a user's bank-connection problem report with the identifiers Plaid support needs
// (link_session_id, request_id, institution_id, error code). Davey support files it with Plaid
// (Plaid Dashboard → Support → New case) — Plaid has no public API for end-user reports.
// Body: { platform, institution, kind, details, issue?: { linkSessionId, requestId, institutionId, errorCode, errorMessage, at } }
// Needs migrations/20261022_plaid_issue_reports.sql. Optional secret REPORT_WEBHOOK_URL (e.g. a Slack webhook) is pinged.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders, handlePreflight } from '../_shared/cors.ts'

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null)

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight
  const headers = { ...corsHeaders(req), 'Content-Type': 'application/json' }
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false }), { status: 405, headers })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: u } = await supabase.auth.getUser()
  if (!u.user) return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401, headers })

  const body = await req.json().catch(() => ({}))
  const issue = (body.issue ?? {}) as Record<string, unknown>
  const row = {
    user_id: u.user.id,
    platform: clip(body.platform, 16) ?? 'web',
    institution: clip(body.institution, 120),
    kind: clip(body.kind, 80),
    details: clip(body.details, 2000),
    link_session_id: clip(issue.linkSessionId, 120),
    request_id: clip(issue.requestId, 120),
    institution_id: clip(issue.institutionId, 60),
    error_code: clip(issue.errorCode, 80),
    error_message: clip(issue.errorMessage, 500),
  }
  // Insert as the user (RLS: insert own rows only).
  const { error } = await supabase.from('plaid_issue_reports').insert(row)
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers })

  const hook = Deno.env.get('REPORT_WEBHOOK_URL')
  if (hook) {
    await fetch(hook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Bank issue: ${row.institution} — ${row.kind} (${row.error_code ?? 'no code'}) session ${row.link_session_id ?? '-'}` }),
    }).catch(() => undefined)
  }
  return new Response(JSON.stringify({ ok: true }), { headers })
})
