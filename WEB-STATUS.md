# Davey Web — status (overnight 2026-10-22)

_Updated after every feature. Phase 1 details: WEB-PHASE1.md. Decisions: DECISIONS.md._

## David: do this in the morning (in order)

1. **GitHub write access** for the Claude GitHub App on `davey-website` (if the push log below still says 403). Everything is committed; a retry loop pushes to the work branch and `main` every 15 min.
2. **Bank testing on the web needs these server steps** (commands in WEB-PHASE1.md): deploy `plaid-link-token` (platform=web), add CORS to `plaid-exchange` + `plaid-sync`, add Plaid redirect URI `https://daveypersonalfinance.com/app/oauth`, add `https://daveypersonalfinance.com/app/**` to Supabase Auth redirect URLs.
3. **Optional server changes** (each feature degrades gracefully without them) — see "Server changes" below.

## Push status

See the log at the bottom (updated by the loop). Backup bundle of all unpushed commits: scratchpad `davey-web.bundle` (lost when the session container ends).

## Done

| Feature | Notes |
|---|---|
| Phase 1 | Auth + 2-step + recovery key, Overview, Transactions, Connect a Bank + /oauth, Settings, CSP. |
| Navigation | Sidebar groups (Money / Accounts / Business / More) with Connect a Bank button; phone tabs Overview · Activity · Budget · Accounts · More. Tax appears only when an account or transaction is Business. |
| Accounts | Every account: nickname + Business/Personal toggle (writes `nickname`, `is_business`), grouped by bank, connection status, hidden accounts toggle. |
| Connection issues + Reconnect | Reads `plaid_items` (if present); "needs attention" card; Reconnect uses Plaid update mode **only** if the server answers `mode:'update'` (otherwise stops safely — no duplicate connections). |
| Connection Help + Report to Plaid | Troubleshooting topics; report form sends to `plaid-report-issue` with Link session/request IDs from the last failed Link; falls back to a pre-filled email if the function isn't deployed. |

## In progress / next

Budget + Cash flow → Recurring + calendar → Credit cards, Loans, Investments → Household + Settings → Exports + Tax → Ask AI → PWA + polish.

## Blocked / needs David

| Item | Why | What to do |
|---|---|---|
| Push to GitHub | 403: app has no write access | Grant access (step 1). |
| WebKit + Firefox test runs | Only Chromium is installed in the cloud container | `cd webapp && npx playwright install webkit firefox && npm run e2e` on a Mac. |
| Real schema | Supabase REST and the iOS repo aren't reachable from the container | Confirm column/table names in `webapp/src/lib/schema.ts` and `tables.ts`. |

## Server changes (in `/supabase-changes`, none deployed)

| File | Needed for | Status |
|---|---|---|
| `functions/plaid-link-token/*` + `_shared/cors.ts` | Connecting banks from the web | **Required** for bank testing. |
| `_shared/access-token.ts` (wire `decryptAccessToken` to the existing helper) | Reconnect from the web (update mode) | Optional; until wired, Reconnect sends people to the app. |
| `functions/plaid-report-issue` + `migrations/20261022_plaid_issue_reports.sql` | Report to Plaid in-app | Optional; falls back to email. |

## Tests

- Vitest: 36 passed. Playwright (Chromium): 31 passed, including no-overflow checks at 360 px and 1920 px on every screen.
