# Davey deep QA – running list

Started 2026-10-26 05:30 UTC (22:30 PT) at David's request. **Assess only until 2:00 AM PT (09:00 UTC)**, then
fix/enhance from this list in priority order (P1 first), each with a test, on every platform.

Scope and how it's tested here:
- **Web, desktop and phone:** Playwright Chromium at 1280/1440/1920 and phone emulation (390×844, touch). Probes
  are in `webapp/e2e/qa/` (`QA=1 npx playwright test e2e/qa`).
- **iPhone and Mac apps:** this cloud container is Linux, with no Xcode or simulator. The apps are checked by code
  review and by CI on the macOS runner (unit tests on an iOS simulator and on Mac Catalyst). UI and speed checks that
  need a device go in the "David's Mac" section, with the exact command to run.
- **Safari (WebKit):** not installed here. It's covered by the Mac run.

Status: 🔴 open · 🟡 in progress · ✅ fixed (commit)

## Fixed today (before the QA window)
- ✅ Duplicate investment accounts from Refresh all (3dc0c9a)
- ✅ Accounts chart % flipped sign with a negative net worth (3dc0c9a, iOS ff8eac1)
- ✅ Investments › By account names wrapped one word per line on desktop (3dc0c9a)
- ✅ Accounts showing "Bank" with no logo and a stale balance (d9b6f48, iOS c3fbd77)
- ✅ A sync could overwrite an edit made at the same moment (d9b6f48)

## Speed (web, Chromium, mock data)
| Screen | Phone (ms) | Desktop (ms) |
|---|---|---|
| Transactions | 39 | 34 |
| Accounts | 78 | 28 |
| Connection help | 52 | 76 |
| Budget | 36 | 40 |
| Cash flow | 28 | 28 |
| Recurring | 33 | 23 |
| Credit cards | 26 | 26 |
| Loans | 29 | 24 |
| Investments | 17 | 17 |
| Household | 122 | 174 |
| Exports | 36 | 17 |
| Tax | 27 | 16 |
| Settings | 34 | 28 |

## Speed with a heavy household (10,000 transactions, web Chromium, round 2, 06:05 UTC)
| Step | Desktop | Phone |
|---|---|---|
| Cold load to settled | 2,727 ms (long tasks 168/99/79 ms) | 1,790 ms |
| Accounts | 141 ms | 86 ms |
| Investments | 216 ms (155 ms long task) | 104 ms |
| Tax | 93 ms | 39 ms |
| Other screens | 35–76 ms | 31–51 ms |
| Search "netflix" on Transactions | no long tasks, ~200 ms over typing | same |
| Chart legend tap → filter | ~60 ms | ~130 ms |
| Refresh all, 3 banks (mock, instant backend) | **7,038 ms** | **5,272 ms** |
| JS heap | 72 MB | 72 MB |

Requests: cold load fetches transactions in 11 pages (fine) but investment holdings twice. Refresh all with 3 banks
made **7 full household reloads (77 transaction-page requests)** for 3 syncs and 2 saves.

## Findings
| # | P | Surface | Finding | Status |
|---|---|---|---|---|
| 1 | P2 | Web phone | Back to Transactions loses the scroll position (1500 px → top). | 🔴 |
| 2 | P2 | Web | Household is the slowest screen to open (122–174 ms; the others are under 80 ms). | 🔴 |
| 3 | P2 | Web | Accounts linked to a bank the household doesn't share still show "Bank". Show the institution Plaid reports, or "Linked bank (not shared)" with a fix-it link. | 🔴 |
| 4 | **P1** | Web | Refresh all reloads every household record before and after each bank (7 reloads, 77 requests for 3 banks; 5–7 s with an instant mock). With ~12 real banks that's ~25 reloads and several hundred requests. Fix: load once, sync banks in parallel (2–3 at a time), merge onto the latest copy of just the changed records, reload once at the end. The background relink has the same cost. | 🔴 |
| 5 | P2 | Web | Cold load with 10k transactions: 1.8–2.7 s and long tasks up to 168 ms (record parsing and toRows). Fix: build rows in one pass, defer non-visible work, and cache the last load (IndexedDB) for an instant first paint. | 🔴 |
| 6 | P2 | Web | Investments: 155 ms long task on open (10k). Fix: memoize the history/performance series and compute it off the first render. | 🔴 |
| 7 | P3 | Web | Investment holdings are fetched twice on cold load (`investment_holdings`, `household_records?holding`). | 🔴 |
| 8 | P3 | iPhone/Mac | Check the same Refresh all cost on the app (BankSyncService.refreshAll runs banks one after another). Code review in a later round. | 🔴 |

## Enhancements (proposed)
| # | Idea | Why |
|---|---|---|
| E1 | Refresh all shows per-bank progress (✓ Chase, … Wells Fargo) while it runs | It takes seconds with many banks; today it's one "Refreshing N banks…" line |
| E2 | Instant first paint from a cached copy (IndexedDB), then refresh in place | Cold load is 2–3 s for a heavy household |

## David's Mac (needs a device)
- iPhone and Mac speed: `xcodebuild … test -only-testing:DaveyTests/PerformanceTests` and Instruments (PERF-REPORT.md).
- Safari: `cd webapp && npx playwright install webkit && npx playwright test --project=webkit`.
