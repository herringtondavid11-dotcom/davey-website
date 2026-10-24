# Performance report (2026-10-24)

**Report from David:** switching between tabs and items and scrolling is extremely slow.

**Target:** feels instant on a 120 Hz iPhone, tab switch under 100 ms, no hitches.

**Status:**
- iPhone/Mac: davey-ios `release-candidate` 06da30f + 4a8488f, never main. CI passed: 523 unit tests on Mac.
- Web: davey-website `main`, deployed.

## Round 2 (2026-10-24): "fast at first, then slower; a bubble on every touch"

**Why it got slower over time.** Each of these runs again on every tab switch or every return to the app, and
together they kept the main thread busy:

| # | Cause | Fix |
|---|---|---|
| 1 | **Every return to the app rewrote all investment rows.** The household investments reload set every holding and daily value even when nothing changed. The save that followed made every open screen rebuild and woke the household sync. | It writes only real changes and saves only when something changed (`SustainedResponsivenessTests`). |
| 2 | **Sync echo loop.** Household Realtime sends this device's own pushes back. Each echo pulled them and built an index of every record (all transactions, holdings and daily values) on the main thread. | Own echoes are dropped before the store is touched, and the index fetches each kind only when needed. |
| 3 | **History rebuilt on every switch.** The net-worth history cache held one entry, keyed by each screen's own counter, so Overview and Accounts evicted each other. Every switch between them rebuilt history from every transaction (~0.5 s at 10,000), on a background context that competes with the main one. | Keyed by the app-wide save count, with 8 entries shared by all screens. |
| 4 | **Repeated rebuilds per save.** Each save rebuilt every open screen separately, several times during a sync burst. | Coalesced (400 ms). |

**The bubble.** Every chart (16 of them on Overview, Budget, Investments, Accounts and Tax) used SwiftUI's default
chart-selection gesture, which takes every touch. Starting a scroll on a chart popped the value bubble and fought the
scroll. On iPhone, scrubbing now starts after a short press (0.2 s): swipes scroll, and letting go hides the bubble
(`pressToScrub`). The Mac keeps pointer scrubbing.

On the web, iPhone Safari's grey tap highlight is turned off. Davey shows its own instant press feedback instead.
Ask AI's old tap-anywhere gesture was already removed (32f6d0a); it is not in this build.

**Stress tests:**
- **iPhone:** `SustainedResponsivenessUITests` runs ten rounds of every tab, Ask AI open and close, Transactions push
  and pop, scrolling, and Home then back, on 2,000 transactions. The later rounds must not be slower than the first.
- **Web:** `e2e/sustained.spec.ts` runs the same rounds plus a page hide and show. Measured: 1.1–1.4 s per round, flat;
  heap 12–13 MB; DOM 372–379 nodes, unchanged.

## Top causes found and fixed, round 1 (iPhone + Mac)

| # | Cause | Where | Fix |
|---|---|---|---|
| 1 | Overview rebuilt six months of reports, insights, attention items, debt and goal cards on **every body pass**. Every sync flag, sheet, save, history load and tab revisit re-ran it on the main thread. | `OverviewView` | Memoized (`Shared/Memo.swift`), keyed by month, View, save generation, counts and minute. One pass buckets transactions by month, and each card reads only its months. |
| 2 | Budget rebuilt the month report and comparison on every body pass, and its `.task` re-asked the server for Plaid bills on **every visit**, re-rendering the whole tab when the (equal) answer came back. | `BudgetsView`, `BankSyncService` | Memoized. Bills are refreshed at most every 15 minutes and assigned only on a real change. Same for `investmentsNeedingConsent`. |
| 3 | The household sync encoded **every record** on the main actor twice per sync: about 0.3 s at 10,000 transactions, on launch, activation, every edit and every partner change (Realtime). | `HouseholdSyncEngine` | Applying pulled records encodes only those records. The local-change scan is skipped when nothing was saved since the last one (`StoreSaves`). |
| 4 | `HouseholdDates` created a new ISO 8601 formatter for **every date** encoded or parsed: 20,000 formatters per sync at 10,000 transactions. | `HouseholdModels.swift` | Formatters are built once. |
| 5 | Transaction rows read `receiptImageData` to show the paperclip. That's external storage, so **each row read a file from disk** on the main thread while scrolling. | `TransactionRow`, Tax receipts | `ReceiptIndex`: receipt IDs fetched once (IDs only), kept in step on attach and remove. |
| 6 | Each iCloud import burst ran data upkeep once **per notification** on the main thread. | `DaveyApp` | Debounced (800 ms). |

**Already in place, verified and kept:**
- Each tab's screen stays alive (`TabView` with `Tab`), and only one Investments/Tax screen is mounted.
- Investments, Accounts, Overview net worth and account detail build balance history off the main thread.
- The transaction list groups from plain dates.
- Lists are `List`/`ThemedList`, which are lazy, with stable IDs. No shadows or blur in scrolling rows.
- Bank import and maintenance full passes run only when the transaction count changed.

**Left as is, with the reason:**
- Plaid import (`PlaidImporter`) still runs on the main actor during a bank sync. Moving it to a background `ModelActor` changes how imports and the household sync share one context, and it only runs during a sync, not on a tab switch or scroll. It's measured with the "PlaidImport" signpost. If Instruments shows it hitching on David's iPhone, the paste below has Claude move it.

## Before / after

**iPhone/Mac.** CI Mac runner, Debug build (Release on device is faster), 2,000 transactions:

| Measure | Before | After |
|---|---|---|
| Overview summary, first build when the tab appears | 112 ms on every body pass | 82 ms, once per change |
| Overview, repeat body passes (sync flags, sheets, tab revisits), 20 passes | ~112 ms each | 0.05 ms for all 20 |
| Budget month report | rebuilt on every pass, plus a network round trip per visit | 29 ms, once per change, bills at most every 15 min |
| 20,000 household dates | one formatter per date (est. 0.4–0.8 s) | 27 ms |
| Household sync with no local change | full encode of every record, twice | pulled records only, no scan |
| Unit test run (523 tests) | – | all pass |

Heavy-user unit benchmarks are unchanged and pass: View switch at 10,000 transactions is Overview 49 ms and Budget 68 ms.

**Web.** Chromium, measured inside the page from click to the new screen's heading:

| Tab switch | Before | After |
|---|---|---|
| Overview, Budget, Accounts | 16–42 ms | 16–34 ms |
| Investments, first visit | 131–134 ms | 48–94 ms |
| Investments, second visit | 46–47 ms | 40–53 ms |
| Transaction list scroll | p95 16.7 ms, worst 16.8 ms | p95 16.7 ms, worst 16.8 ms (no dropped frames) |

**Web fixes:**
- Each tab's code, plus the Investments tables, now downloads while the browser is idle after the first screen, so a first visit doesn't wait for a chunk.
- The shell no longer scans every transaction on each navigation (`hasBusiness` is memoized).
- The first download stays under the 170 kB gzip budget (`perf.spec.ts`).

## Tests added

**iPhone/Mac:**
- `DaveyTests/TabSwitchBudgetTests`, on 2,000 transactions:
  - Overview's first build is under 100 ms.
  - 20 repeat passes take under 5 ms, and data is rebuilt only on a save.
  - The Budget report is under 100 ms.
  - 20,000 dates encode in under 250 ms.
- `DaveyUITests/TabSwitchScrollPerformanceUITests`, on `-perfStore -perfTransactions 2000`:
  - Signpost metrics for `TabSwitch`, `OverviewSummary` and `BudgetReport`.
  - `XCTOSSignpostMetric.scrollingAndDecelerationMetric` (hitches) on the Overview and transaction list scrolls.
  - Each tab is on screen within 1 s including XCUITest overhead.

**Web:** `e2e/tab-budget.spec.ts`:
- Each tab's best of two switches is under 100 ms, and no switch takes over 200 ms, on desktop and phone.
- No scroll frame over 50 ms, and p95 under 34 ms.

## Mac paste (Instruments on David's iPhone in Release, then fix and install)

```
In ~/Developer/davey-ios: git fetch origin && git checkout release-candidate && git pull (never merge to main).
1. Find my iPhone (unlocked, on the cable): xcrun devicectl list devices → <UDID>.
2. Release build with the measurement hooks (local only; never upload this build), install over the app (data stays):
   xcodebuild -project Davey.xcodeproj -scheme Davey -configuration Release -destination 'id=<UDID>' \
     -allowProvisioningUpdates -derivedDataPath /tmp/davey-perf \
     SWIFT_ACTIVE_COMPILATION_CONDITIONS='$(inherited) PERF_HOOKS' build
   xcrun devicectl device install app --device <UDID> /tmp/davey-perf/Build/Products/Release-iphoneos/Davey.app
3. Open Davey on the phone and unlock it. Record three 45 s traces while I switch Overview → Budget → Accounts →
   Investments → Ask twice, open and close an account, and scroll Overview and All Transactions fast:
   xcrun xctrace record --device <UDID> --template 'Time Profiler' --attach Davey --time-limit 45s --output ~/Desktop/davey-time.trace
   xcrun xctrace record --device <UDID> --template 'SwiftUI' --attach Davey --time-limit 45s --output ~/Desktop/davey-swiftui.trace
   xcrun xctrace record --device <UDID> --template 'Animation Hitches' --attach Davey --time-limit 45s --output ~/Desktop/davey-hitches.trace
   (Tell me when to do the switching for each recording.) Also record one 3-minute Time Profiler trace while I keep
   switching tabs, opening Ask AI and leaving/returning to the app, and compare the first and last minute: CPU per
   switch must not grow.
4. Read the traces (xcrun xctrace export --input <trace> --toc, then --xpath for the time profile, the SwiftUI view-body
   table, the Points of Interest signposts TabSwitch / OverviewSummary / BudgetReport / PlaidImport / DataMaintenance,
   and the hitches table). Budgets: tab switch < 100 ms, no hitch > 16 ms during scrolling (120 Hz: aim < 8 ms),
   no main-thread stall > 50 ms while I'm touching the screen. List the top 10 main-thread symbols by time.
5. Fix anything over budget in Davey's code (body work → memoize or move off the main actor; @Query without a
   predicate on big tables → add predicates; PlaidImport or household sync hitching → move to a background ModelActor),
   add a test for each fix, run DaveyTests and DaveyUITests/TabSwitchScrollPerformanceUITests and
   DaveyUITests/ResponsivenessUITests and DaveyUITests/SustainedResponsivenessUITests on a booted iPhone 17 simulator (-parallel-testing-enabled NO
   -test-timeouts-enabled YES -default-test-execution-time-allowance 120), then commit and push to release-candidate.
   Re-record step 3 and put the before/after numbers in PERF-REPORT.md.
6. Install the normal build (Debug, no PERF_HOOKS) on my iPhone and this Mac from release-candidate, keeping my data:
   iPhone: xcodebuild ... -configuration Debug -destination 'id=<UDID>' -allowProvisioningUpdates -derivedDataPath /tmp/davey-dev build
           xcrun devicectl device install app --device <UDID> /tmp/davey-dev/Build/Products/Debug-iphoneos/Davey.app
   Mac: build and run the Davey scheme for "My Mac (Mac Catalyst)" the usual way.
7. Delete the trace files from ~/Desktop when done (they can hold screen contents).
```
