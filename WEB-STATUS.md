# Davey Web — status (overnight 2026-10-22)

_Updated after every feature. Phase 1 details: WEB-PHASE1.md. Decisions: DECISIONS.md._

## David: do this in the morning (in order)

1. ~~GitHub write access~~ **Done at 05:21 UTC** — pushes to `main` work and GitHub Pages deploys each one (Pages build for `fa537af` succeeded). Later commits are pushed by a loop every 15 minutes.
2. **Bank testing on the web needs these server steps** (commands in WEB-PHASE1.md): deploy `plaid-link-token` (platform=web), add CORS to `plaid-exchange` + `plaid-sync`, add Plaid redirect URI `https://daveypersonalfinance.com/app/oauth`, add `https://daveypersonalfinance.com/app/**` to Supabase Auth redirect URLs.
3. **Optional server changes** (each feature degrades gracefully without them) — see "Server changes" below.

## Push status

GitHub access works since 05:21 UTC; `main` deploys to https://daveypersonalfinance.com/app via GitHub Pages. A loop pushes new commits every 15 minutes; a git bundle backup is refreshed after every commit.

## Done

| Feature | Notes |
|---|---|
| Phase 1 | Auth + 2-step + recovery key, Overview, Transactions, Connect a Bank + /oauth, Settings, CSP. |
| Navigation | Sidebar groups (Money / Accounts / Business / More) with Connect a Bank button; phone tabs Overview · Activity · Budget · Accounts · More. Tax appears only when an account or transaction is Business. |
| Accounts | Every account: nickname + Business/Personal toggle (writes `nickname`, `is_business`), grouped by bank, connection status, hidden accounts toggle. |
| Connection issues + Reconnect | Reads `plaid_items` (if present); "needs attention" card; Reconnect uses Plaid update mode **only** if the server answers `mode:'update'` (otherwise stops safely — no duplicate connections). |
| Budget | Month picker, All/Personal/Business, income vs spent meter, budgets vs actual (over-budget first, terracotta + "$x over" text), not-budgeted categories, edit/set budget when a `budgets` table exists (otherwise read-only note). Transfers/card payments excluded. |
| Cash flow | 6/12 months, All/Personal/Business, averages + savings rate, income vs spending bar chart (hover/focus tooltip, legend), month table. |
| Recurring + calendar | Detects subscriptions, bills and income from transactions (weekly → yearly, variable amounts marked "~", stale streams dropped), merged with a stored `recurring_transactions` table if present. Month calendar: real past charges + projections, day detail, legend. Monthly totals + due in 7 days. |
| Credit cards | Per-card balance/limit, utilization meter + band, APR, minimum, due date; overall utilization; avalanche payoff planner (debt-free date, interest, which card first). |
| Mortgages & loans | Per loan: % paid off, payoff date + interest left, extra-payment savings, yearly amortization table, refinance (new payment, break-even, lifetime interest after costs), mortgage equity + LTV (PMI hint). Prefilled from account fields; edits are local what-ifs. |
| Investments | Totals, gain/loss vs cost basis, allocation bar (validated 5-hue palette, extras fold into Other) with legend, holdings table per account (from `holdings` + `securities`). |
| Household | Members with roles (Owner / Can edit / View only); owners change roles and remove members (RLS-enforced); invite link via `household-invite` (copy link; pending invites with copy); explains if the function isn't deployed. |
| Settings | Profile name (auth metadata), password change, 2-step + recovery key, sign out / sign out everywhere (confirm), login activity (`login-activity` function, else this browser + last sign-in), connection issues, theme. Account names moved to Accounts. |
| Exports | Date range (this/last month, YTD, last year, custom), account, All/Personal/Business. CSV (Excel-safe, formula-injection-safe), PDF statement (summary, accounts, categories, transactions), ZIP of all three. Generated in the browser (own PDF/ZIP writers, no third parties). |
| Tax (Business only) | This/last year: business income, expenses, net profit, P&L by category; estimated tax (SE 15.3% × 92.35% + federal bracket + state, editable, remembered); IRS quarterly periods with due dates and amounts to set aside; deduction finder (personal spending that looks like business, grouped by merchant, one-tap "Mark Business"); CPA package ZIP (P&L PDF + business CSV + category totals). |
| Ask AI | Floating "Ask AI" button → side panel (full screen on phones): suggested questions per screen, chat history (last 8 turns sent), answers rendered as plain text/lists (never HTML), Esc to close. Sends a small view context (screen, month totals, top categories, net worth — no account numbers or merchants). Explains when `ask-ai` isn't web-enabled yet or the monthly limit is reached. |
| PWA | Installable (manifest, 192/512/maskable icons, shortcuts), service worker caches only the /app shell and hashed assets (never Supabase/Plaid data), opens offline to the shell; "Install Davey" in Settings (Safari instructions on iPhone). |
| Performance | Screens code-split (main bundle 530 kB → 320 kB); stale-chunk reload after deploys. |
| Accessibility | axe-core (WCAG 2.1 A/AA) on every screen in light and dark: 0 serious/critical. Fixed badge contrast, chart/calendar/button names. Keyboard: focusable chart bars with tooltips, Esc closes sheets and Ask AI. |
| Connection Help + Report to Plaid | Troubleshooting topics; report form sends to `plaid-report-issue` with Link session/request IDs from the last failed Link; falls back to a pre-filled email if the function isn't deployed. |

## In progress / next

Recurring + calendar → PWA + polish.

## Blocked / needs David

| Item | Why | What to do |
|---|---|---|
| WebKit + Firefox test runs | Only Chromium is installed in the cloud container | `cd webapp && npx playwright install webkit firefox && npm run e2e` on a Mac. |
| Real schema | Supabase REST and the iOS repo aren't reachable from the container | Confirm column/table names in `webapp/src/lib/schema.ts` and `tables.ts`. |

## Server changes (in `/supabase-changes`, none deployed)

| File | Needed for | Status |
|---|---|---|
| `functions/plaid-link-token/*` + `_shared/cors.ts` | Connecting banks from the web | **Required** for bank testing. |
| `_shared/access-token.ts` (wire `decryptAccessToken` to the existing helper) | Reconnect from the web (update mode) | Optional; until wired, Reconnect sends people to the app. |
| `functions/plaid-report-issue` + `migrations/20261022_plaid_issue_reports.sql` | Report to Plaid in-app | Optional; falls back to email. |
| `functions/login-activity` | Settings › Login activity across devices | Optional. |
| `household-invite` (contract in supabase-changes/README.md) | Household › invite from the web | Optional; needs your household schema. |
| `functions/ask-ai/PATCH.md` (CORS + accept `context`/`history`) | Ask AI on the web | Optional; panel explains it's app-only until then. |

## Tests

- Vitest: 36 passed. Playwright (Chromium): 31 passed, including no-overflow checks at 360 px and 1920 px on every screen.
