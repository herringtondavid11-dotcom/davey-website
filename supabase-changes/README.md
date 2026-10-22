# Server changes for Davey on the web

> **Updated 2026-10-22:** the real backend is davey-ios `release-candidate`. Deployed already (Mac session):
> `platform: 'web'` in `plaid-link-token`, web CORS on `plaid-link-token` / `plaid-exchange` / `plaid-sync`, and
> `ask-ai` web mode. The web reads the app's data from `household_records` and `household_members` /
> `household_invites` / `profiles` directly (RLS), so no function is needed for reading. The only remaining change is
> **`davey-ios/web-cors.patch`**. The older files in `functions/` here predate seeing the real code: ignore them
> (keep `login-activity` only if you want cross-device login history in Settings).

## Apply the web CORS patch (≈5 min)

```bash
cd <davey-ios> && git checkout release-candidate && git pull
git apply <davey-website>/supabase-changes/davey-ios/web-cors.patch   # verified: applies cleanly to be86f94
supabase functions deploy household-invite household-remove-member household-leave link-support \
  plaid-item-remove plaid-link-session --project-ref zvyargbnvccdqgmtytck
```

It adds `{ cors: "app" }` (only https://daveypersonalfinance.com and www) to the six functions the web calls for:
inviting / removing / leaving a household partner, Report to Plaid, disconnecting a bank, and Link diagnostics.
Until then those buttons explain that the action needs a server update (Report to Plaid falls back to email).

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
