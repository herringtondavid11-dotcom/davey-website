# Next Mac rebuild (one Claude Code paste)

Pending iPhone + Mac changes on davey-ios `release-candidate` (never main):

| Commit | Change |
|---|---|
| b971420 | Accounts tab: the Connect a Bank / Add Account card is gone; the % Funded / Balance / Name sort sits right under the Total Balance card. Connecting and adding stay in Settings › Accounts (+ menu) and Overview's empty state. |
| a54ae9c | Sign-up / reset code screens say "6-digit code" (works with today's 8-digit codes too). |
| 79ef820 | Premium bank limit 30 (app side; the server side needs the deploy below). |

```
In ~/Developer/davey-ios: git fetch origin && git checkout release-candidate && git pull (never merge to main).
1. Deploy the bank limit change: supabase functions deploy plaid-link-token plaid-link-token-sandbox --project-ref zvyargbnvccdqgmtytck --use-api
2. Run the unit tests and these UI tests on a booted iPhone 17 simulator (-parallel-testing-enabled NO -test-timeouts-enabled YES
   -default-test-execution-time-allowance 120): DaveyTests, DaveyUITests/AccountsTabUITests, DaveyUITests/MemberInviteUITests.
   Fix anything that fails, commit and push to release-candidate.
3. Build and install Davey on my iPhone and this Mac from release-candidate, keeping my data.
4. Confirm on both: the Accounts tab shows Total Balance then the sort control with no Connect a Bank / Add Account
   card, and Settings › Accounts › + still offers Connect a Bank and Add Manual Account.
(Optional, when ready to turn the web's email code back on: scripts/auth-email-fix.sh per AUTH-EMAIL-FIX.md.)
```
