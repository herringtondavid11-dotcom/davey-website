# Davey Web — status (morning of 2026-10-22)

**Live:** https://daveypersonalfinance.com/app (GitHub Pages from `main`). Phases 1–3 are built, tested and pushed.
Details: Phase 1 in WEB-PHASE1.md, every default decision in DECISIONS.md, server changes in `supabase-changes/README.md`.

## David: do this in the morning (≈30 min, in order)

1. **Make bank connections work on the web** (required for bank testing; exact commands in WEB-PHASE1.md › Remaining steps):
   - Deploy `plaid-link-token` from `supabase-changes/functions/plaid-link-token/` (+ `_shared/cors.ts`). Diff against the deployed version first.
   - Add CORS to `plaid-exchange` and `plaid-sync` and redeploy them.
   - Plaid Dashboard › Allowed redirect URIs: add `https://daveypersonalfinance.com/app/oauth`.
   - Supabase › Auth › URL Configuration › Redirect URLs: add `https://daveypersonalfinance.com/app/**`.
2. **Test:** sign in at /app (2-step setup on first web sign-in; save the recovery key) → Connect a Bank → Name your accounts → Overview. Try an OAuth bank (Chase) to exercise /app/oauth.
3. **Check the guessed schema** against the iOS repo: `webapp/src/lib/schema.ts` (accounts, transactions) and `webapp/src/lib/tables.ts` (plaid_items, budgets, holdings, securities, household_members, household_invites, recurring_transactions). Each screen degrades gracefully if a table differs, but it then shows less.
4. **Optional server updates** (each feature already explains itself without them): Reconnect/update mode, Report to Plaid, login activity, household invites from the web, Ask AI on the web — table in `supabase-changes/README.md`.
5. **Run WebKit + Firefox tests on your Mac** (only Chromium exists in the cloud container): `cd webapp && npm ci && npx playwright install webkit firefox && npm run build && npm run e2e`.

## Push status

GitHub write access works since 05:21 UTC. Every commit tonight is on `claude/dazzling-faraday-c87dto` and `main`; GitHub Pages deployed each push (checked: Pages run for `fa537af` succeeded). A git bundle backup was refreshed after every commit.

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

 / next

## Blocked / not done

| Item | Why | What to do |
|---|---|---|
| Real bank connection on the web | Needs the server steps above (not deployable from here: no production changes allowed) | Step 1 above. |
| WebKit + Firefox runs | Browsers not installed in the cloud container | Step 5 above. Config already runs all three. |
| Schema verification | Supabase REST blocked from the container; iOS repo not available | Step 3 above. |
| Web sign-up / paywall | Not in scope tonight; accounts are created in the app | Phase 4. |
| HTTP security headers (`frame-ancestors`, HSTS) | GitHub Pages can't set headers; CSP is a `<meta>` + frame-busting | Put Cloudflare (or similar) in front later. |

## Tests (final run)

- **Vitest: 70 passed** (12 files): TOTP RFC vectors, schema normalization, budgets/cash flow, recurring detection + calendar, loan/card math (amortization, payoff, refinance, LTV, avalanche), tax (P&L, SE tax, IRS periods, deduction finder), CSV/PDF/ZIP writers, Ask AI rendering + context, Edge Function platform logic.
- **Playwright (Chromium): 52 passed** (12 files) against the repo served like GitHub Pages with mocked Supabase + Plaid: sign-in + 2-step, recovery key, enrollment, reset, idle sign-out, Overview, Transactions edit, Connect + /oauth once, Accounts (nickname + Business), Reconnect (both server states), Report to Plaid (function + email fallback), Budget, Cash flow, Recurring calendar, Credit cards, Loans, Investments, Household, Settings, Exports (real file downloads checked), Tax + CPA ZIP, Ask AI (answer, not-enabled, limit), PWA (manifest, SW, offline), no overflow at 360 px and 1920 px on every screen, **axe WCAG 2.1 AA: 0 serious/critical in light and dark**, zero CSP violations on key flows.
- **Screenshots:** 122 in `webapp/screenshots/` (390 / 1024 / 1440 × light / dark × 20 screens + Ask AI panel).
