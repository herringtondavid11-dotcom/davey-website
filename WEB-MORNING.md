# Davey on the web — morning summary (2026-10-22)

## What's live
- https://daveypersonalfinance.com/app (GitHub Pages, `main`), now behind a **Company access code** screen before
  Sign in, Create account and Forgot password. A device that enters the right code stays approved for 30 days.
- Your existing email + password are the same as on iPhone. The web does not email a sign-in code: access code + password, same Supabase project, user and
  household data. Nothing here creates accounts, sets passwords or signs in as you.
- `/app/oauth` (Plaid OAuth return) is served as before.
- **The code screen won't accept any code until you run the Mac paste below** (the server pieces aren't deployed yet).

## What was fixed / added tonight
- Access code: `access-pin` function + 30-day hashed passes + 5-wrong-then-15-minute lockout; sign-up hook so the Auth
  API can't skip it (davey-ios `release-candidate` 2f4a764; never main).
- New **Create account** screen (sends the pass; confirmation email; resend).
- Clear rate-limit messages ("Too many emails, try again in a few minutes." / "Wait N seconds" / "Too many attempts").
- Password reset: the emailed token is verified once only (no double verify → no false "link expired").
- Investments tables no longer scroll sideways at 768px.
- QC loops since (WEB-QC-LOG.md): Recurring reads the app's own rules; friendly load errors; charts use the app's exact
  colors; 3:1 focus ring; sidebar fits short laptops; OAuth return survives the access code, sign-in and an idle
  sign-out; login-activity function (deploy with the Mac paste).
- Screens checked at 360 / 768 / 1280 / 1920 in light and dark; axe on every screen including the new ones.

## Tests
- Vitest: 114/114. Playwright (Chromium): 125 passed, 0 skipped, 0 failed (loop 51; the emailed sign-in code was removed). Latest counts: WEB-QC-LOG.md.
- WebKit/Firefox aren't installed in the cloud container; on the Mac: `cd webapp && npm run e2e`.

## Your one Claude Code paste (on the Mac)
```
In ~/Developer/davey-ios (branch release-candidate, git pull first), follow davey-website/WEB-PIN.md "Mac steps":
set ACCESS_PIN (ask me for the code with a hidden prompt; never write it to a file or log), apply migration
20261025000000_access_pin.sql with `supabase db query --linked -f` inside begin/commit and then
`supabase migration repair --status applied 20261025000000` (never db push), apply 20261025010000_login_activity.sql the same way, deploy access-pin and login-activity with --use-api,
enable the Before User Created hook (public.access_gate_before_user_created), then run the wrong-code curl check and
confirm https://daveypersonalfinance.com/app shows the code screen and accepts my code. Also deploy
plaid-link-token and plaid-link-token-sandbox (bank limit 30, BANK-LIMIT-30.md) and reinstall Davey on iPhone and Mac from
release-candidate.
```
