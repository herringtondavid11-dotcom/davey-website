# Server changes for Davey on the web

> **Updated 2026-10-22 (Phase 4):** the real backend is davey-ios `release-candidate`. It already has `platform: 'web'`
> in `plaid-link-token` and web CORS on `plaid-link-token`, `plaid-exchange`, `plaid-sync` (commit `be86f94`). The one
> remaining change is **`davey-ios/web-api.patch`** below. The older files in `functions/` (plaid-link-token,
> plaid-report-issue, login-activity, ask-ai notes) were written before that code was visible; keep `login-activity`
> if you want cross-device login history, ignore the rest.

## Apply the web patch (≈5 min)

```bash
cd <davey-ios> && git checkout release-candidate && git pull
git apply <davey-website>/supabase-changes/davey-ios/web-api.patch
deno test supabase/functions   # optional
supabase functions deploy plaid-item-status household-status household-invite household-remove-member \
  household-leave profile-update ask-ai link-support plaid-link-session plaid-item-remove plaid-sync \
  plaid-link-token plaid-exchange --project-ref zvyargbnvccdqgmtytck
```

What it does: adds web-origin CORS (`{ cors: "app" }`, only https://daveypersonalfinance.com) to the 10 functions
the web calls that don't have it yet; `plaid-item-status` also returns `institution_name` and `created_at`;
`plaid-sync` called with `platform: "web"` leaves `needs_sync` for the app.

## Edits sync (proposal, not built)

Web edits are browser-only today. To share them with the app: a `user_annotations` table
(`user_id`, `household_id`, `kind` account|transaction|budget, `key`, `value jsonb`, `updated_at`; RLS by household)
plus an `annotations-sync` function, and the app merging those into SwiftData. Say the word and I'll draft it.

## Original Phase 1–3 notes

Nothing here is deployed. Deploy from the iOS repo (`supabase/functions/…`) with
`supabase functions deploy <name> --project-ref zvyargbnvccdqgmtytck`. Every function the browser calls needs
`_shared/cors.ts` (OPTIONS preflight + `Access-Control-Allow-Origin: https://daveypersonalfinance.com`).

| Change | Files | Web feature | Without it |
|---|---|---|---|
| **Required** `plaid-link-token` accepts `platform:'web'` | `functions/plaid-link-token/*`, `_shared/cors.ts` | Connect a Bank | Can't connect banks on the web |
| **Required** CORS on `plaid-exchange`, `plaid-sync` | add `_shared/cors.ts` calls | Connect a Bank | Browser blocks the calls |
| Update mode (Reconnect) | wire `_shared/access-token.ts` `decryptAccessToken` | Accounts › Reconnect | Web says "Reconnect in the app" |
| `plaid-report-issue` + `migrations/20261022_plaid_issue_reports.sql` | `functions/plaid-report-issue` | Connection help › Report to Plaid | Pre-filled email instead |
| `login-activity` | `functions/login-activity` | Settings › Login activity | Shows this browser + last sign-in only |
| `household-invite` (contract below; write against your household tables) | — | Household › Create invite link | Web says "send the invite from the app" |
| CORS on `ask-ai` + accept `context` | see `functions/ask-ai/PATCH.md` | Ask AI panel | Panel explains AI is app-only for now |

## `household-invite` contract (implement in the iOS repo next to `household-invite-preview`)

- `POST` with the user's JWT, body `{ platform: 'web', first_name?: string, email?: string, role: 'member' | 'viewer' }`.
- Only a household owner may create invites (403 otherwise). Create the same invite row the app creates.
- Reply `{ token }` (the web builds `https://daveypersonalfinance.com/join?t=<token>`) or `{ url }`.
- Must include CORS (`_shared/cors.ts`).
