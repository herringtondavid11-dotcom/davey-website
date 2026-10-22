# Decisions — Davey Web, Phase 1 (2026-10-22)

Autonomous run; David unavailable. Defaults chosen and logged here. Marketing-site decisions stay in WEBSITE-DECISIONS.md.

| # | Decision | Why |
|---|----------|-----|
| 1 | **Anon key: no placeholder needed.** The web app uses the publishable key already shipped in `assets/js/config.js` (`sb_publishable_cJpa…`). Overridable via `VITE_SUPABASE_ANON_KEY`. | Public by design (RLS protects data); the iOS repo isn't in this session, but the marketing site already uses this key against the same project. |
| 2 | **Schema read defensively.** The Supabase REST endpoint is blocked from the build container and the iOS repo isn't available, so tables are read with `select=*` and normalized in `webapp/src/lib/schema.ts` (candidate column names per field). Writes go to whichever candidate column the row already has. | Avoids hard-coding guesses in screens; one file to correct once the real schema is confirmed. Assumptions listed in WEB-PHASE1.md. |
| 3 | **Built output is committed** (`/app`), source in `/webapp`. No GitHub Actions. | GitHub Pages serves `main` from the repo root with no build step today; keeps the existing deploy unchanged. |
| 4 | **SPA routing:** each route gets its own `app/<route>.html` copy (GitHub Pages serves `/app/oauth` → `oauth.html` with 200, no trailing-slash redirect), plus a `/app/*` fallback in the root `404.html` (`/app/?p=…`). | The Plaid OAuth redirect must land on a real 200 page at exactly `/app/oauth`. |
| 5 | **2-step verification required for every web sign-in**, not only owners. | "Owner" isn't knowable without the household schema; requiring it for everyone is a superset and safer. |
| 6 | **Backup codes = a single-use recovery key.** It is the secret of a second Supabase TOTP factor ("Davey backup"); the browser derives the current code from it (RFC 6238). After it's used, the key is rotated (old factor unenrolled, new key shown once). | Supabase MFA has no native backup codes, and true hashed one-time codes need a new table + Edge Function (Phase 2). This works today with zero server changes. |
| 7 | **Sign-out is `scope: 'local'`** (manual and idle). | Signing out of the browser must not sign the iPhone/Mac out. |
| 8 | **Idle timeout 30 min**, warning at 28 min, shared across tabs via `localStorage` timestamp; also enforced on reload. | Spec. |
| 9 | **Plaid pending link token kept in `localStorage`** (30-min TTL, cleared on finish/sign-out); OAuth resume is claimed per `oauth_state_id` so Link reopens exactly once. | Mobile OAuth banks can return in a new tab where `sessionStorage` is empty. |
| 10 | **Fonts self-hosted** (@fontsource Inter + Plus Jakarta Sans, Latin only). | Strict CSP allows only self + Plaid + Supabase, so Google Fonts are out. |
| 11 | **CSP via `<meta>`; `frame-ancestors` can't be set by meta**, so the app refuses to render inside a frame (JS check) and the doc lists adding real headers (e.g. Cloudflare) in Phase 2. `style-src 'self'` (no inline styles in HTML). | Spec asked "where possible"; GitHub Pages can't send headers. |
| 12 | **Marketing header:** "Log in" (→ `/app/login`) + "Get started" (→ `/app/`) replace the header "Get early access" button on index, help, terms, cancel and 404. The waitlist CTAs in the page body are unchanged. Handoff pages (/join, /auth/*) have no nav and are unchanged except below. | Spec; three header CTAs crowded the bar. |
| 13 | **`/auth/reset` gets a "Reset on the web" button** that passes the email's `token_hash` to `/app/reset`. | Reset emails already point at `/auth/reset`; this lets people without the app reset in the browser. Nothing else on that page changed. |
| 14 | **Edge Function delivered as a full replacement + pure helper module** (`supabase-changes/functions/plaid-link-token/`), with CORS helper for plaid-exchange/plaid-sync. Not deployed. | No production changes from this run; the current deployed source isn't visible, so WEB-PHASE1.md says to diff before deploying. |
| 15 | **Plaid amount sign:** positive = money out (Plaid convention), shown as negative. One flag in `config.ts` flips it. | Matches Plaid; unverified against the app's tables. |
| 16 | **Net worth** = non-hidden assets − |credit + loan balances|. | Standard; matches how Plaid reports liabilities. |
| 17 | **Playwright runs Chromium only here**; WebKit/Firefox projects are configured and run automatically wherever those browsers are installed. | Only Chromium is preinstalled; installing browsers was off-limits in this environment. |
| 18 | **Pushed to `main`** (and the working branch). The first attempt got 403; a retry loop pushed every 15 min and succeeded at 05:21 UTC once access was granted. | David asked for it to deploy; GitHub Pages serves from `main`. |

## Overnight Phase 2/3 (2026-10-22)

| # | Decision | Why |
|---|----------|-----|
| 19 | **Optional tables** (`plaid_items`, `budgets`, `holdings`/`securities`, `household_members`, `recurring_transactions`, …) are probed by candidate name; a missing table shows an explanation instead of an error (`webapp/src/lib/tables.ts`). | Schema still unverifiable from the container. |
| 20 | **Reconnect = Plaid update mode, only if the server replies `mode:'update'`.** Otherwise the web app stops and points to the iPhone app. | A plain link token would create a duplicate Item. |
| 21 | **Report to Plaid** goes to a new `plaid-report-issue` function + table (Davey support files it with Plaid); falls back to a pre-filled email. | Plaid has no public API for end-user reports. |
| 22 | **Transfers and credit-card payments are excluded** from income/spending (category "Transfer", or names like AUTOPAY / CREDIT CARD PAYMENT). | Otherwise moving money double-counts. |
| 23 | **Chart colors:** income = brand sage (#4E7A62 light / #6F9A82 dark), spending = gold (#C99A2E light / #E8B84A dark). The dataviz validator flags sage's low chroma and gold's 2.5:1 contrast on white, so every chart has a legend, hover/focus tooltip and a table of the same numbers. | Brand palette is mandated; secondary encoding makes it accessible. |
| 24 | **Budgets:** monthly; editing writes the `amount` column of the existing row; adding a new budget inserts `{category, amount}` and, if RLS/defaults reject it, asks the user to add it in the app. | Unknown required columns (user/household id). |
| 25 | **Loan fields** read from the account row (`interest_rate`/`apr`, `original_principal`, `origination_date`, `term_months`, `minimum_payment`, `property_value`). Missing values fall back to editable defaults (6.5%, 25-yr mortgage / 5-yr loan remaining). Calculator edits are not saved. | Plaid Liabilities fields may live elsewhere; what-ifs shouldn't change shared data. |
| 26 | **Card payoff = avalanche** (highest APR first); cards without APR assume 22%; missing minimums assume max($25, 2%). | Mathematically cheapest; clearly labeled. |
| 27 | **Allocation colors** = the dataviz reference categorical hues minus magenta, violet and red (no purple/pink; red is over-budget). 5 slots, the rest folds into "Other" (slate). Validator: all checks pass, contrast WARN relieved by the legend with % and $. | Brand has too few distinct hues for categories. |
| 28 | **Tax estimate** = 15.3% SE tax on 92.35% of profit + federal bracket and state rate (user-editable, saved in this browser) on profit minus half the SE tax; ignores the SS wage cap, QBI, credits and other income; labeled "planning estimate, not tax advice". IRS payment periods (Jan–Mar, Apr–May, Jun–Aug, Sep–Dec). | Simple, transparent, matches the IRS 1040-ES worksheet structure. |
| 29 | **Deduction finder** flags personal spending at known business tools (Adobe, Canva, Zoom, AWS, Staples…) or business-like categories (software, office, advertising, professional…); not entertainment subscriptions. Grouped by merchant; "Mark Business" writes `is_business`. | Low-noise suggestions the user confirms. |
| 30 | **Exports are generated in the browser** with small built-in CSV/PDF/ZIP writers (no third-party libraries, nothing uploaded). CSV cells starting with = + - @ are prefixed with ' (formula injection). | Privacy and CSP (`self` only). |
| 31 | **Ask AI** sends the question, the last 8 turns and a small screen summary (view, month income/spending, top 5 categories, net worth, account count) — no account numbers, merchant names or raw transactions. Answers render as plain text (no HTML). | Least data needed; server already has account access. |
| 32 | **Household:** roles shown as Owner / Can edit / View only (raw `owner|member|viewer`, admin→owner, read_only→viewer). Only owners see role changes, removal and the invite form; RLS remains the real gate. Invites need a `household-invite` function (contract documented). | Matches the app's sharing model as far as visible. |
| 33 | **Login activity** comes from a new `login-activity` function reading `auth.audit_log_entries` for the caller only; without it, Settings shows this browser and the last sign-in time. "Sign out everywhere" uses global scope after a confirm. | Supabase doesn't expose sessions to the client. |
| 34 | **PWA service worker** caches only same-origin `/app/` shell and hashed assets; network-first for pages so deploys show immediately; never caches Supabase/Plaid responses. Playwright blocks service workers except in the PWA test. | No financial data at rest in the browser cache. |
| 35 | **Screens are code-split** (React.lazy); a failed chunk load after a deploy reloads the page once. | Main bundle 530 → 320 kB. |
| 36 | **Screenshots are committed** (`webapp/screenshots`, ~19 MB of PNGs, mock data only). | Requested; easy to review on GitHub. |

## 2026-10-22 — from the Mac session (reconciled against production)
- **Real schema:** there are no `accounts` / `transactions` / `budgets` tables. The iPhone/Mac app keeps money data on the
  device and in iCloud; the only server copy is `household_records` (Household Sharing): `entity` + `id` + `payload`
  jsonb, RLS for household members, writes only through `rpc/push_household_records` (last-write-wins on `updated_at`,
  whole payloads). Payload format = `HouseholdSyncCodec.swift` (minor units; negative = money out; ISO dates).
  `webapp/src/lib/serverData.ts` maps it to the rows `schema.ts` reads; `data.ts`/`tables.ts` go through it. Business
  vs Personal is per account in Davey (transactions inherit it). Budgets are read-only on the web for now.
- **Connect a Bank on the web** imports the new bank into the household records the way the app does
  (`importBank.ts`, mirrors PlaidImporter + PlaidCategoryMapper), so the iPhone/Mac receive it; without a household it
  explains instead of creating a connection no device would show.
- **Server deployed (release-candidate be86f94):** `plaid-link-token` platform=web (redirect
  https://daveypersonalfinance.com/app/oauth, retried without it if Plaid rejects; client redirect ignored; update mode
  answers `mode:"update"`), CORS for Davey's origins only on plaid-link-token / plaid-exchange / plaid-sync (+ sandbox).
  `/supabase-changes/functions/plaid-link-token` was NOT deployed as written: it would have dropped modes, plan limits,
  OAuth fallbacks and the Mac path; its behaviour is merged into the existing function. `plaid-report-issue` not
  deployed: the existing `link-support` (action "report") stores the same thing.
- Anon key: the publishable key in config.ts is the project's real one (checked).
- (Mac session) Business vs Personal on the web follows the account, as in the app (transactions have no business flag
  in Davey's records). The Tax deduction finder's "Mark Business" explains that instead of writing. QUESTION for David:
  should single transactions be markable Business (Davey has TaxLineOverride records for tax lines)? Until then, move
  the transaction's account to Business.
- (Mac session) Liabilities come out of the adapter as amounts owed (positive), and a mortgage's home counts in net
  worth as its own Real Estate account, as in the app.
