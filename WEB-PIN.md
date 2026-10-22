# Company access code for Davey on the web

`daveypersonalfinance.com/app` asks for a 6-digit company access code before **Sign in**, **Create account** and
**Forgot password**. The code is never in this repo (public): it lives only in the `ACCESS_PIN` Supabase secret.

## How it works

| Piece | Where | What it does |
|---|---|---|
| `access-pin` function | davey-ios `supabase/functions/access-pin` (release-candidate) | Checks the code against `ACCESS_PIN`. Right → a random 30-day pass (only its SHA-256 is stored, in `access_passes`). Wrong → "N tries left". 5 wrong in 15 min from one IP → 15-minute lockout (also 200 wrong/hour across everyone). Only Davey's web origins may call it. |
| `access_gate_before_user_created` | migration `20261025000000_access_pin.sql` | Auth "Before User Created" hook: an email sign-up without a valid pass is rejected, so the Auth API can't skip the code. Sign in with Apple and emails with a pending household invite are let through (switches in `public.access_gate`). |
| Web | `webapp/src/screens/AccessCode.tsx`, `SignUp.tsx`, `lib/accessPass.ts` | Keeps the pass in this browser for 30 days, re-checks it with the server, sends it with sign-up. |

Existing accounts aren't affected beyond the code screen: your email + password and your 2-step code work exactly as
in the iPhone app (same Supabase project, same user, same household data).

Until the steps below are done, the code screen says "Couldn't check the code right now" and nobody gets past it.

## Mac steps (once)

Run in Terminal (the Supabase CLI login doesn't work from Claude Code's shell):

```sh
cd ~/Developer/davey-ios            # your davey-ios checkout
git fetch origin && git checkout release-candidate && git pull

# 1. The code (replace the placeholder; or use the hidden prompt on the next line)
supabase secrets set ACCESS_PIN=<YOUR-6-DIGIT-CODE> --project-ref zvyargbnvccdqgmtytck
#   read -rs "PIN?Access code: " && supabase secrets set ACCESS_PIN="$PIN" --project-ref zvyargbnvccdqgmtytck; unset PIN

# 2. Tables + hook function (one migration, never `supabase db push`)
supabase link --project-ref zvyargbnvccdqgmtytck
{ echo 'begin;'; cat supabase/migrations/20261025000000_access_pin.sql; echo 'commit;'; } > /tmp/access_pin.sql
supabase db query --linked -f /tmp/access_pin.sql
supabase migration repair --status applied 20261025000000

# 3. The functions (login-activity: Settings › Login activity on the web)
{ echo 'begin;'; cat supabase/migrations/20261025010000_login_activity.sql; echo 'commit;'; } > /tmp/login_activity.sql
supabase db query --linked -f /tmp/login_activity.sql
supabase migration repair --status applied 20261025010000
supabase functions deploy access-pin login-activity --project-ref zvyargbnvccdqgmtytck --use-api

# 4. Turn on the sign-up hook
#    Dashboard: Authentication › Auth Hooks › Add hook › Before User Created › Postgres
#    › schema public › function access_gate_before_user_created › Create.
#    Or with a personal access token (supabase.com/dashboard/account/tokens):
curl -sS -X PATCH "https://api.supabase.com/v1/projects/zvyargbnvccdqgmtytck/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"hook_before_user_created_enabled":true,"hook_before_user_created_uri":"pg-functions://postgres/public/access_gate_before_user_created"}'

# 5. Check: a wrong code is refused (expect {"error":"wrong_pin",...})
curl -sS https://zvyargbnvccdqgmtytck.supabase.co/functions/v1/access-pin \
  -H "Origin: https://daveypersonalfinance.com" -H "apikey: sb_publishable_cJpaZife9jClSJVtv3tHtw_xganiB7L" \
  -H "Content-Type: application/json" -d '{"action":"verify","pin":"000000"}'
```

Then open https://daveypersonalfinance.com/app, enter the code, sign in.

## Later

- **Change the code:** set the secret again, then sign everyone's devices out of the code screen:
  `supabase db query --linked "update public.access_passes set revoked = true where not revoked;"`
- **Turn the sign-up check off** (hook stays on): `update public.access_gate set enforce = false;`
- **Block Apple or invited-email sign-ups too:** `update public.access_gate set allow_apple = false;` /
  `set allow_invited_emails = false;` (the iPhone app has no code screen, so this blocks those sign-ups there).
- iPhone email sign-ups from people without an invite are blocked while the hook is on (the iPhone has no code screen).
