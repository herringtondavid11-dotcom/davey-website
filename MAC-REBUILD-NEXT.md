# Next Mac rebuild (one Claude Code paste)

## Duplicate accounts, chart shares, Investments layout (2026-10-26, do this first)
- Cause of the doubled Raymond James accounts: the web's Refresh all added every account Plaid reported for a bank,
  including ones never imported (the app only imports the accounts picked when connecting). Fixed on the web: a sync
  now updates only accounts the household has, matched by Plaid account ID household-wide, and never adds one.
  The app never did this (PlaidImporter.apply only touches the connection's accounts).
- The copies were hidden once (isArchived, shared; nothing deleted) when the web next loaded, with Undo. Hidden
  accounts appear under Settings › Accounts › Hidden on the iPhone/Mac; swipe to show one again.
- Accounts chart: the % column is now each category's share of assets (debts: share of debts), so a negative net
  worth can't flip the signs. iPhone/Mac: release-candidate ff8eac1 (pull and rebuild).
- Web Investments › By account: names no longer wrap one word per line on a desktop browser.
- Accounts showing "Bank" (no name/logo, stale balance): a sync now re-attaches an account the bank reports to its
  connection (PlaidImporter.relinkOrphans, release-candidate c3fbd77). Press Refresh all once after rebuilding.

## Refresh all (2026-10-25, do this first)

The Accounts tab's circular arrow (web: live now; iPhone/Mac: davey-ios release-candidate 71110d9) syncs every bank
right away and lists the result per bank. It needs the new plaid-sync deployed, run in Terminal on the Mac:

```sh
cd ~/davey-ios && git pull && git checkout release-candidate
supabase db query --linked -f supabase/migrations/20261026000700_plaid_items_balance_checked.sql
supabase migration repair --status applied 20261026000700
supabase functions deploy plaid-sync plaid-sync-sandbox --project-ref zvyargbnvccdqgmtytck --use-api
```

Until then the button still works: the old plaid-sync ignores the live request and syncs as before.

**Live balance check (costs money, off by default).** A refresh always gets Plaid's latest stored balance for free.
Checking live at the bank uses Plaid's Balance product (`/accounts/balance/get`), which Plaid bills per call (see
Plaid Dashboard › Billing for your rate). Davey limits it to one check per bank every 5 minutes. To turn it on, enable
Balance for Production in the Plaid Dashboard (Products), then run:

```sh
supabase db query --linked "update server_flags set value = 'true'::jsonb, updated_at = now() where key = 'realtime_balance';"
```

To turn it off, run the same with `'false'`.

**Wells Fargo looks way off:** tap Refresh all. If Wells Fargo shows "Needs you to sign in again", tap Reconnect and
finish the Wells Fargo sign-in. Its balance can't update until then, because the bank stopped sharing on Oct 21.

## Account categories, round 2 (2026-10-25)

davey-ios release-candidate fd4d4cf (CI green): household-managed categories (new SwiftData model
AccountCategoryRecord, synced as `accountCategory`; Account.accountCategoryID), Settings › Account Categories (add,
rename, colour, drag to reorder, swipe to remove with reassign), Accounts tab chart (donut/bar) that filters, Group /
Sort menus, category and bank chips, collapsible sections, Bank | Account | Category in every row, Mac sortable table.
No server change. Steps:
1. Rebuild and install on the Mac, David's iPhone and Allie's iPhone (cable install keeps data), usual paste.
2. On each: Accounts tab → the chart and sections appear; Settings › Account Categories lists the 16 built-ins.
3. Rename one category on the iPhone; within a minute the web (daveypersonalfinance.com/app, Settings) and Allie's
   iPhone show the new name. Pick a category for an account on the web; the iPhone moves it.
4. Run Davey's UI tests on the Mac once (AccountsTabUITests, MacDesktopUITests updated for the new controls).
5. Parity check on each surface (ACCOUNTS-PARITY.md): iPhone, iPad (the iPhone app), Mac, desktop browser, and
   daveypersonalfinance.com/app in iPhone Safari and Chrome. On each: switch List/Table, sort a table column, tap a
   chart slice, add a category from an account's menu, and confirm the same bank logo shows. davey-ios
   release-candidate 3cc3a04 adds the iPhone/iPad table and the shared bank logo.

## Account categories, round 1 (2026-10-25, superseded by round 2)

davey-ios release-candidate e103a57: Account.rollupCategory (optional field, migrates by itself), Accounts tab
grouped by category with totals and a pie, Category field on account detail. Rebuild and install on the Mac, David's
iPhone and Allie's iPhone (cable install keeps data) with the usual paste. Until a device runs this build, an edit
it makes to an account resends that account without its category; re-pick it on the web or an updated device.

## Chase audit (2026-10-25): queries, Dashboard checklist, Plaid message

Web change only (davey-website main): /app/oauth never starts a second Link inside a bank pop-up, and every web OAuth
return is logged (client_diagnostics event DAVEY_OAUTH_RETURN: same_tab, popup_handoff_link_open / _closed,
handoff_resumed). No server or iPhone/Mac change for Chase; nothing to rebuild for it.

**1. Latest Chase sessions (read-only, Terminal on the Mac):**

```sh
supabase db query --linked "select created_at, platform, mode, config, link_session_id, request_id, error_type, error_code, exit_status, app_version from plaid_link_events where institution_id = 'ins_56' or institution_name ilike '%chase%' order by created_at desc limit 20;"
supabase db query --linked "select created_at, app_version, payload->>'event' as event, payload->>'view_name' as view, payload->>'link_session_id' as session, payload->>'request_id' as request, payload->>'error_code' as code, payload->>'exit_status' as status, left(payload->>'user_agent', 60) as agent from client_diagnostics where kind = 'link_event' and (payload->>'institution_id' = 'ins_56' or payload->>'institution_name' ilike '%chase%' or payload->>'event' = 'DAVEY_OAUTH_RETURN') order by created_at desc limit 40;"
```

Read it as: OPEN_OAUTH → (DAVEY_OAUTH_RETURN only if Plaid sent the browser to /app/oauth) → ERROR/EXIT. An
ERROR right after OPEN_OAUTH with no DAVEY_OAUTH_RETURN means Chase/Plaid failed before Davey's page was involved.

**2. Plaid Dashboard (dashboard.plaid.com, Production):**
- Developers › API › **Allowed redirect URIs**: exactly `https://daveypersonalfinance.com/app/oauth` and
  `https://herringtondavid11-dotcom.github.io/plaid/oauth` (no trailing slash, https, no `app.` subdomain).
- **Link › OAuth institutions** (or Compliance / Institution access): Chase (ins_56) row must say **Enabled / Live**
  for Production, not "Pending", "Action required" or "Registration in progress". Note the date it went live: Chase
  can take days to propagate after approval.
- **Application profile / Security questionnaire** (Chase requires both): status Complete and Approved; company
  name, logo and support contact filled in.
- **Link › Customization › Data Transparency Messaging** use cases set (otherwise INVALID_LINK_CUSTOMIZATION).
- Team settings › Products: Transactions enabled for Production.
- Screenshot the Chase row and the questionnaire status for the Plaid ticket.

**3. Message to Plaid support (fill the session rows from query 1):**

> Subject: Chase (ins_56) OAuth fails for client "Davey" on web, iOS and Mac (invalid_grant / Unauthorized Client)
>
> Hello. Chase OAuth fails for our Production client on all three of our integrations, while other OAuth banks
> (Wells Fargo, Bank of America) succeed for the same client and the same user's Chase login works in another app.
> - Web (Link JS, desktop Chrome/Safari): link_session_id [WEB-SESSION-ID], request_id [REQUEST-ID], [UTC time]
> - iOS (LinkKit 7.2.2, universal link redirect): link_session_id [IOS-SESSION-ID] and 01a15f27-e041-7e7f-8120-f21a21251309
> - Mac (Hosted Link, no redirect_uri): link_session_id [MAC-SESSION-ID]; Chase's page showed "Unauthorized Client"
> - Earlier case: 01a14aee-87bc-79fa-85b4-21fbf07ed973, where you found Chase issued a code and your exchange got
>   invalid_grant.
> Our link tokens: products ["transactions"] only, no optional/additional consented products, no account_filters,
> country_codes ["US"], language "en", redirect_uri exactly as registered (web:
> https://daveypersonalfinance.com/app/oauth). Each attempt uses one link token; the web reinitializes Link once
> with receivedRedirectUri, and never inside the OAuth pop-up.
> "Unauthorized Client" at Chase's authorize step points at our client's Chase registration. Please check: (1) is
> Chase OAuth fully approved and live for our client_id in Production, and is anything outstanding (security
> questionnaire, app profile, Chase review)? (2) for the sessions above, was Chase's code redeemed more than once or
> late, and which redirect/client_type did you record? (3) is there anything we must change on our side?
> Thank you. — [Your name], Davey

## Connection badges (2026-10-25)

davey-ios release-candidate: a passing sync failure (network, sync_busy, 5xx) no longer marks a bank "Connection
problem" for the household (SyncFailureStatusTests). Rebuild and install on the Mac, David's iPhone and Allie's iPhone
(cable install keeps data) with the usual paste. No server change.

## PenFed reconnect on the web (2026-10-25)

Web-only fix (davey-website main). No server deploy, no secret change, no iPhone/Mac rebuild needed: the web now
publishes the reconnected bank's status, cursor, balances and transactions to household_records, which the iPhone and
Mac already apply. To see the outcome of David's PenFed session, run in Terminal on the Mac (read-only):

```sh
supabase db query --linked "select created_at, event, platform, mode, institution_id, institution_name, error_code, exit_status, link_session_id from plaid_link_events where platform = 'web' order by created_at desc limit 15;"
supabase db query --linked "select created_at, kind, payload->>'event' as event, payload->>'institution_name' as bank, payload->>'error_code' as code from client_diagnostics where kind = 'link_event' order by created_at desc limit 15;"
supabase db query --linked "select plaid_item_id, institution_name, status, error_code, needs_sync, last_synced_at from plaid_items where institution_name ilike '%penfed%' or institution_name ilike '%pentagon%';"
```

Two PenFed rows in the last query = the duplicate case: open daveypersonalfinance.com/app, Connect an account,
pick PenFed again; the web now merges it into the existing accounts and removes the old Item.

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
