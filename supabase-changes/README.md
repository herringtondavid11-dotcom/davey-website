# Server changes for Davey on the web

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
