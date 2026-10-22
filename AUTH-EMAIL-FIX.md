# Sign-in email: a 6-digit code, no link (2026-10-22)

**Bug (David, 11:55 AM PT):** the web's sign-in email arrived as Supabase's default "Your sign-in link" email: a link,
no code. The link opened the home page (the Site URL), back at the start.

**Cause:** the production Auth email templates were still Supabase's defaults (the branded ones in davey-ios were never
uploaded), and email codes were 8 digits.

## Fixed in code (live / pushed)

| Where | Change |
|---|---|
| Web (davey-website `main`) | "Enter the 6-digit code we emailed you"; the field takes exactly 6 digits (paste with spaces works); sign-in emails ask Supabase to send any link to `/app/`; an old link that lands on the home page is forwarded to `/app/`, which shows the code screen (or finishes the sign-in). |
| iPhone + Mac (davey-ios `release-candidate`, never main) | Sign-up and reset code screens say "6-digit code" and accept it; test codes are 123456 / 654321. Needs a rebuild + install to reach your devices. |
| Server config (davey-ios) | `supabase/templates/signin_code.html` (Navy/Gold, the code `{{ .Token }}` in large type, no link), `otp_length = 6`, `scripts/auth-email-fix.sh` + `scripts/auth_email_fix.py`. |

## The one Mac step (Claude Code paste)

```
In ~/Developer/davey-ios: git fetch origin && git checkout release-candidate && git pull.
Run scripts/auth-email-fix.sh in my own Terminal-equivalent shell. It reads the Supabase CLI's access token (env
SUPABASE_ACCESS_TOKEN, the macOS Keychain "Supabase CLI" item, or ~/.supabase/access-token; if none is readable it asks
me to paste a token from https://supabase.com/dashboard/account/tokens, never write it to a file or log), then uses the
Management API (GET, then PATCH https://api.supabase.com/v1/projects/zvyargbnvccdqgmtytck/config/auth) to set
mailer_otp_length=6, set the Magic Link AND Confirm signup subjects to "Your Davey sign-in code" with
supabase/templates/signin_code.html as both templates (code only, no link), and add
https://daveypersonalfinance.com/app/** to uri_allow_list if missing (keeping the rest). Show me the BEFORE and AFTER
values it prints and the VERIFIED line, and tell me where it saved the rollback file. Don't change any other setting.
Then rebuild and install Davey on my iPhone and this Mac from release-candidate.
```

**Check it worked:** sign in at daveypersonalfinance.com/app → the email "Your Davey sign-in code" shows a big 6-digit
code and no link → type it → you're in.

**Undo:** the script saves `~/davey-auth-config-before-<time>.json`; PATCH those values back with the same API.
