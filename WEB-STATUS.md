# Davey Web — status (morning of 2026-10-22)

**Live:** https://daveypersonalfinance.com/app (GitHub Pages from `main`, last push `b15e92c`+). Phases 1–3 built; Phase 4
(real data) done together with the Mac session: the web reads and writes the app's shared copy (`household_records`), so
it shows the same accounts and data as the iPhone/Mac for anyone using Household Sharing.
Details: DECISIONS.md (incl. the 2026-10-22 reconciliation notes), server changes in `supabase-changes/README.md`.

## David: do this in the morning (in order)

1. **Plaid Dashboard › Allowed redirect URIs:** add `https://daveypersonalfinance.com/app/oauth` (OAuth banks on the
   web). The server side (`plaid-link-token` web mode, CORS) is already deployed by the Mac session.
2. **Supabase › Auth › URL Configuration › Redirect URLs:** add `https://daveypersonalfinance.com/app/**`.
3. **Test bank connection:** sign in at /app (2-step setup on first web sign-in; save the recovery key) → Connect a Bank →
   Name your accounts → it appears on the iPhone/Mac via Household Sharing. Try Chase for the OAuth path.
4. **Apply `supabase-changes/davey-ios/web-cors.patch`** (one `git apply` + one deploy command in the README): enables
   invite / remove / leave household, Report to Plaid, disconnect bank and Link diagnostics from the web.
5. **Sign in with Apple on the web (optional):** create an Apple Services ID with return URL
   `https://zvyargbnvccdqgmtytck.supabase.co/auth/v1/callback`, add it to Supabase's Apple provider client IDs.
6. **Run WebKit + Firefox tests on your Mac:** `cd webapp && npm ci && npx playwright install webkit firefox && npm run build && npm run e2e`.
7. **Questions logged in DECISIONS.md:** single transactions markable Business? Apple Services ID?

## Push status

All commits are on `claude/dazzling-faraday-c87dto` and `main`. `main` also has two Mac-session commits (06652bd,
91d370e); they were merged, not overwritten (merge commit da22a33). GitHub Pages deploys every push.

## Tests (end of Phase 4)

Vitest 80/80. Playwright (Chromium) 55/55, including screenshots (390/1024/1440 × light/dark), axe WCAG 2.1 AA (0
serious/critical, light and dark) and no overflow at 360/1920 px. WebKit/Firefox: run on the Mac (step 6).

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
