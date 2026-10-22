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
| 18 | **Push to `main` attempted** (and the working branch); GitHub returned 403 (no app write access), so the commit is local only. | David asked for it to deploy; GitHub Pages serves from `main`. |
