# Davey Web — Phase 1

> Phases 2–3 (Budget, Cash flow, Recurring, Accounts, Cards, Loans, Investments, Household, Settings, Exports, Tax, Ask AI, PWA) shipped overnight 2026-10-22 — see **WEB-STATUS.md** for the current state and the morning checklist.

**Live at https://daveypersonalfinance.com/app** (GitHub Pages from `main`, pushed 2026-10-22 05:21 UTC after write access was granted). Sign-in works now; **connecting a bank from the web needs steps 1–2 below** (Edge Function + Plaid redirect URI).

## Remaining steps for David (in order)

1. **Deploy the Edge Function change (≈10 min, from the iOS repo).**
   ```bash
   cd <davey iOS repo>
   # a) Back up what's deployed now, and check secret names
   supabase functions download plaid-link-token --project-ref zvyargbnvccdqgmtytck
   supabase secrets list --project-ref zvyargbnvccdqgmtytck   # expects PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV
   # b) Copy the new files in
   cp -R <davey-website>/supabase-changes/functions/_shared supabase/functions/
   cp <davey-website>/supabase-changes/functions/plaid-link-token/{index.ts,platform.ts} supabase/functions/plaid-link-token/
   # c) Diff against the backup. If the old function did more (e.g. update mode, a different webhook,
   #    link_customization_name, different secret names), carry that over; keep platform.ts + the CORS lines.
   git diff supabase/functions/plaid-link-token
   # d) Deploy (keep JWT verification on, as today)
   supabase functions deploy plaid-link-token --project-ref zvyargbnvccdqgmtytck
   ```
   Behaviour: body `{"platform":"web"}` → `redirect_uri=https://daveypersonalfinance.com/app/oauth`; no platform → iOS universal link `https://herringtondavid11-dotcom.github.io/plaid/oauth` (override with secret `PLAID_IOS_REDIRECT_URI` if the app uses another). Web never sends iOS-only fields, and a client-supplied redirect_uri is ignored.

2. **Add CORS to `plaid-exchange` and `plaid-sync`** (browsers send an OPTIONS preflight; the iOS app doesn't, so it's unaffected). In each function's `index.ts`:
   ```ts
   import { corsHeaders, handlePreflight } from '../_shared/cors.ts'
   // first line inside Deno.serve(async (req) => {
   const preflight = handlePreflight(req); if (preflight) return preflight
   // and add ...corsHeaders(req) to the headers of EVERY Response it returns (including errors)
   ```
   Then `supabase functions deploy plaid-exchange plaid-sync --project-ref zvyargbnvccdqgmtytck`.
   The web app calls `plaid-exchange` with `{ public_token, platform: "web", institution, accounts, link_session_id }` and reads `item_id` (or `itemId`) from the response; `plaid-sync` with `{ item_id }`. If the deployed functions expect different field names, adjust `webapp/src/lib/plaid.ts` (one place).

3. **Plaid Dashboard → Developers → API → Allowed redirect URIs:** add `https://daveypersonalfinance.com/app/oauth` (production). Without it, OAuth banks (Chase, Wells Fargo, BofA…) fail; non-OAuth banks work after steps 1–2.

4. **Supabase → Authentication → URL Configuration → Redirect URLs:** add `https://daveypersonalfinance.com/app/**` (password reset from the web lands on `/app/reset`).

5. **Supabase → Authentication → Multi-Factor:** confirm TOTP is enabled (enroll + verify). It is by default.

6. **Anon key: nothing to do.** No placeholder: the app uses the publishable key already in `assets/js/config.js`.

7. **Check with the iOS app:** web enrollment adds TOTP factors named "Davey authenticator" and "Davey backup" to the account. If the iOS app reads MFA factors (or requires aal2 when factors exist), it will now ask that account for a code too. Decide whether that's wanted.

Quick check after steps 1–4: sign in at /app → Connect a Bank → link a real bank (production) → "Name your accounts" appears → the accounts show on Overview and in the iPhone app.

## What's live

| Area | Status |
|---|---|
| Stack | React 19 + TypeScript + Vite 8 in `/webapp`, built to `/app` (base `/app/`). Per-route pages (`app/oauth.html`, …) + `/app/*` fallback in root `404.html`. |
| Design | App palette only (Navy, Slate, Blue-Grey, Gold, Light Gold, Cream, positive #6F9A82, over-budget #C0705A). Sidebar ≥900 px, bottom tabs on phones, light/dark (Automatic/Light/Dark in Settings). Inter + Plus Jakarta Sans self-hosted. |
| Auth | Email + password (same accounts as the app). TOTP 2-step verification required (enroll with QR + setup key on first web sign-in), single-use recovery key (copy/download, rotated after use), password reset (`/app/forgot` → email → `/app/reset`, 2-step first), 30-min idle sign-out with warning, Sign out (this browser only). |
| Overview | Net worth (assets/debts), accounts grouped by type with nickname + •••• last 4 + available balance, 8 recent transactions. |
| Transactions | Search (merchant, category, notes, account, amount), filters (account, category, Business/Personal, money in/out, date range), grouped by day, edit sheet for category, notes, Business/Personal (writes via RLS). |
| Connect a Bank | Plaid Link Web (`link-initialize.js`), `platform:'web'` link token, exchange → sync → **Name your accounts**. `/app/oauth` resumes Link with `receivedRedirectUri` exactly once per `oauth_state_id`. |
| Settings | 2-step status, new recovery key, theme, rename accounts, sign out. |
| Security | Strict CSP `<meta>` (self + cdn.plaid.com/*.plaid.com + the Supabase project only; no inline scripts/styles; `object-src 'none'`, `base-uri`/`form-action 'self'`), `referrer` strict-origin-when-cross-origin, refuses to render in a frame (meta can't carry `frame-ancestors`), `noindex`. The build fails if the CSP meta is missing or an inline script appears. |
| Marketing site | Header "Log in" + "Get started" on home, help, terms, cancel, 404. `/auth/reset` gains "Reset on the web". Everything else unchanged. |

## Test results (2026-10-22)

- **Vitest: 31/31 passed** — TOTP (RFC 4226/6238 vectors), schema normalization, net worth, filters, edit patch building, idle timer, OAuth resume-once + TTL, Name-your-accounts matching, Edge Function platform logic.
- **Playwright: 22/22 passed on Chromium** against the repo served like GitHub Pages, with mocked Supabase + Plaid: wrong password, sign-in + 2-step (bad then good code), recovery key + rotation, forced enrollment + recovery key, local-only sign-out, 30-min idle (fake clock), forgot password, reset via token_hash (+2-step), expired link, Overview figures, Transactions search/filter/edit (PATCH body checked), Connect a Bank (link-token body checked: `platform:'web'`, redirect URI), `/oauth` resume exactly once, Settings rename + theme, marketing links + `/app/*` fallback, frame refusal. **Zero CSP violations** asserted on key flows.
- **Screenshots:** 48 in `webapp/screenshots/` (390/1024/1440 × light/dark × login, 2-step, overview, transactions, edit, connect, name accounts, settings); each run also asserts no horizontal scroll, sidebar vs tabs, and sheet within the viewport. Fixed during review: date filters overflowing at 390 px, sidebar background on long pages, dark-mode net-worth card contrast.
- **WebKit / Firefox: not run here** (only Chromium is installed in this environment). The config runs them automatically where installed: `cd webapp && npx playwright install webkit firefox && npm run e2e`.

## Schema assumptions (confirm against the iOS repo; fix in `webapp/src/lib/schema.ts` only)

- Tables `accounts` and `transactions`, readable/writable by the signed-in user (and household) under existing RLS.
- `accounts`: `id`, `nickname` (or `display_name`/`custom_name`), `name`/`official_name`, `mask`, `type`/`subtype` (Plaid values), `current_balance`, `available_balance`, `iso_currency_code`, `institution_name`, `plaid_account_id`, `is_hidden`, `created_at`.
- `transactions`: `id`, `account_id` (accounts.id or Plaid account id — both handled), `date`, `merchant_name`/`name`, `amount` (Plaid sign: positive = outflow), `category` (or `user_category`), `notes` (or `note`), `is_business` boolean (or text `usage`/`classification`), `pending`.
- Updates use `PATCH … ?id=eq.<id>` with `return=representation`; zero rows back is shown as "no permission".
- Free-plan limits (1 bank) are **not** enforced by the web UI; they should be enforced server-side in `plaid-link-token`/`plaid-exchange` (likely already are for iOS — confirm).

## Phase 2 plan

1. **Parity screens:** Budgets, Spending & trends, Goals, Investments, Credit cards, Mortgages & Loans, Views, Business & tax (Schedule C export), Davey AI, Household Sharing; bank management (re-auth via Link update mode, remove bank).
2. **Typed schema:** `supabase gen types typescript` from the iOS repo; replace the defensive normalizer; server-side pagination/search for large histories; Realtime updates.
3. **Plans & limits:** read the user's StoreKit-backed entitlement; gate Premium features and bank count on the web exactly like PlanLimits.
4. **Security hardening:** real response headers via Cloudflare (or similar) in front of GitHub Pages — `frame-ancestors 'none'`, HSTS preload, `Permissions-Policy`; true hashed single-use backup codes (table + Edge Function, 10 codes); optional passkeys; session list / sign out other devices.
5. **Quality:** GitHub Action running Vitest + Playwright on Chromium/WebKit/Firefox for every push, build-and-commit of `/app` automated; code splitting (main bundle ~530 kB, 150 kB gzip); accessibility audit (axe) and Lighthouse budget.
6. **Sign-up on the web** (when the App Store listing is live): create account → verify email → 2-step → paywall.
