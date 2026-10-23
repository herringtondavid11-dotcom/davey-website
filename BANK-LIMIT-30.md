> **Superseded (2026-10-22, 5:10 PM PT): the limit is now 230 and lives on the server only (`server_flags.max_bank_connections`). See MAC-REBUILD-NEXT.md.**

# Bank connection limit: 10 → 30 (2026-10-22)

Premium's fair-use limit for linked banks (Plaid connections) is now 30. Free stays at 1; manual accounts stay unlimited.
(The paywall is still off for testing, so everyone currently gets Premium limits.)

| Where | Change | Status |
|---|---|---|
| Server: `supabase/functions/_shared/entitlement.ts` (`LIMITS.premium.bankConnections`), enforced by `plaid-link-token` | 30 | davey-ios `release-candidate` 79ef820; **live after the deploy below** |
| iPhone + Mac: `Davey/Store/PlanLimits.swift` (`premiumBankConnections`), checked before Plaid opens | 30 | same commit; **live after rebuilding/installing the app** |
| Web: no limit of its own (shows the server's message) | — | live once the server is deployed |
| Terms page ("up to 30 bank connections"), APPSTORE.md, LAUNCH-PREP.md, CLAUDE.md | 30 | Terms live on daveypersonalfinance.com |

## Mac (one paste into Claude Code)

```
In ~/Developer/davey-ios: git fetch && git checkout release-candidate && git pull. Deploy the bank limit change:
supabase functions deploy plaid-link-token plaid-link-token-sandbox --project-ref zvyargbnvccdqgmtytck --use-api
Then run the unit tests (xcodebuild ... test -only-testing:DaveyTests, EntitlementsTests must pass), build and install
Davey on my iPhone and this Mac from release-candidate (never merge to main), and confirm Settings › Davey Premium /
Connect a Bank no longer stops at 10 banks.
```
