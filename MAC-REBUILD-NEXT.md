# Next Mac rebuild (one Claude Code paste)

## 0. Performance (2026-10-24)

The paste is in PERF-REPORT.md (Instruments on the iPhone in Release, fix anything over budget, install). Run it after
§1 below. iPhone/Mac commits: davey-ios release-candidate 06da30f, 4a8488f (never main).

## 1. Household parity for investments (2026-10-24, do this first)

The problem: Allie's Investments tab showed $0 and a flat line. The fix is commit 8a15b6a on davey-ios
`release-candidate` (never main). Details are in davey-ios HOUSEHOLD-PARITY.md.

The web side is already live. It covers members' read-only Refresh, holdings-based balances and shared manual
holdings.

What the commit changes:
- **Server:**
  - New read-only `household-investments` function.
  - `plaid-investments` never runs Plaid on someone else's Item.
  - Migration 20261026000600 (indexes and read policies, no data changes).
- **iPhone/Mac:**
  - Every device loads the household's stored investments.
  - Manual and CSV holdings, the history of manual accounts, and rental properties sync to the household.

```
In ~/Developer/davey-ios: git fetch origin && git checkout release-candidate && git pull (never merge to main).
1. Server (never supabase db push; check `supabase migration list --linked` first and apply only what's missing):
   supabase link --project-ref zvyargbnvccdqgmtytck
   { echo 'begin;'; cat supabase/migrations/20261026000600_household_investments_parity.sql; echo 'commit;'; } > /tmp/parity.sql
   supabase db query --linked -f /tmp/parity.sql
   supabase migration repair --status applied 20261026000600
   supabase functions deploy plaid-investments plaid-investments-sandbox household-investments household-investments-sandbox \
     --project-ref zvyargbnvccdqgmtytck --use-api
2. Backfill now (instead of waiting for the 2:15 AM job): run the investments-daily job once. Run its own stored
   command, so the secret stays in Vault:
   supabase db query --linked "select command from cron.job where jobname = 'investments-daily';"
   Copy the select net.http_post(...) it prints and run it with supabase db query --linked "<that statement>".
   Wait 2 minutes, then check row counts only (no amounts):
   supabase db query --linked "select count(*) as snapshots, count(distinct account_id) as accounts from public.investment_snapshots;"
3. Tests on a booted iPhone 17 simulator (-parallel-testing-enabled NO -test-timeouts-enabled YES
   -default-test-execution-time-allowance 120): DaveyTests (HouseholdInvestmentParityTests, InvestmentImporterTests,
   HouseholdSyncTests must pass) and DaveyUITests/MemberInviteUITests. Also run:
   cd supabase/functions && deno test --allow-env --allow-read --env-file=_shared/test.env _shared/
   Fix anything that fails, then commit and push to release-candidate.
4. Build and install Davey on my iPhone and this Mac from release-candidate, keeping my data (install over the existing
   app; never delete it first). Open Davey on each so it uploads my manual holdings and history to the household.
5. Allie's iPhone, by cable, keeping her data:
   - Unlock her iPhone and connect it to this Mac with a cable. Tap Trust if asked.
   - Find her device ID: xcrun devicectl list devices
   - Build: xcodebuild -project Davey.xcodeproj -scheme Davey -configuration Debug -destination 'id=<her UDID>' \
       -allowProvisioningUpdates -derivedDataPath /tmp/davey-allie build
   - Install over her current app (same bundle ID; her data and sign-in stay):
     xcrun devicectl device install app --device <her UDID> /tmp/davey-allie/Build/Products/Debug-iphoneos/Davey.app
   - Never use "Delete App". If iOS says "Untrusted Developer": on her iPhone, Settings › General › VPN & Device
     Management › trust the developer.
   (In Xcode instead: choose her iPhone as the run destination and press Run; that also installs over her app.)
6. Confirm on David's iPhone, Allie's iPhone, the Mac and daveypersonalfinance.com/app (signed in as each person):
   - Investments shows the same Portfolio value, holdings and 1Y chart for both.
   - Overview net worth and the Accounts tab totals match.
   - Pull to refresh on Allie's Investments shows the same numbers (it never re-pulls David's banks).
```

## 2. Earlier pending items (skip any already done)

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
