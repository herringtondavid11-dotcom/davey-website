# Next Mac rebuild (one Claude Code paste)

Pending iPhone + Mac changes on davey-ios `release-candidate` (never main):

| Commit | Change |
|---|---|
| 874bf92 | **Bank limit 230, server-side only.** `server_flags.max_bank_connections` (migration 20261025020000 sets 230; default 230 if missing), enforced and worded by `plaid-link-token`. iPhone/Mac no longer cap Premium themselves and show the server's message. |
| b971420 | Accounts tab: the Connect a Bank / Add Account card is gone; the % Funded / Balance / Name sort sits right under the Total Balance card. Connecting and adding stay in Settings › Accounts (+ menu) and Overview's empty state. |
| a54ae9c | Sign-up / reset code screens say "6-digit code" (works with today's 8-digit codes too). |

```
In ~/Developer/davey-ios: git fetch origin && git checkout release-candidate && git pull (never merge to main).
1. Bank limit 230 (server). Apply ONE migration (never supabase db push):
   supabase link --project-ref zvyargbnvccdqgmtytck
   { echo 'begin;'; cat supabase/migrations/20261025020000_max_bank_connections.sql; echo 'commit;'; } > /tmp/bank_limit.sql
   supabase db query --linked -f /tmp/bank_limit.sql
   supabase migration repair --status applied 20261025020000
   supabase db query --linked "select key, value from public.server_flags where key = 'max_bank_connections';"   # expect 230
   supabase functions deploy plaid-link-token plaid-link-token-sandbox --project-ref zvyargbnvccdqgmtytck --use-api
   (Optional: ask-ai imports the same shared file but doesn't use the bank limit; redeploying it isn't needed.)
2. Run the unit tests and these UI tests on a booted iPhone 17 simulator (-parallel-testing-enabled NO -test-timeouts-enabled YES
   -default-test-execution-time-allowance 120): DaveyTests (EntitlementsTests must pass), DaveyUITests/AccountsTabUITests,
   DaveyUITests/MemberInviteUITests. Fix anything that fails, commit and push to release-candidate.
3. Build and install Davey on my iPhone and this Mac from release-candidate, keeping my data.
4. Confirm on both: Connect a Bank works past 10 banks (the app no longer stops at 10/30); the Accounts tab shows Total
   Balance then the sort control with no Connect a Bank / Add Account card; Settings › Accounts › + still offers Connect a
   Bank and Add Manual Account.
(Optional, when ready to turn the web's email code back on: scripts/auth-email-fix.sh per AUTH-EMAIL-FIX.md.)
```
