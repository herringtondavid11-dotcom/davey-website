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

## Findings
| # | P | Surface | Finding | Status |
|---|---|---|---|---|
| 1 | P2 | Web phone | Back to Transactions loses the scroll position (1500 px → top). | 🔴 |
| 2 | P2 | Web | Household is the slowest screen to open (122–174 ms; the others are under 80 ms). | 🔴 |
| 3 | P2 | Web | Accounts linked to a bank the household doesn't share still show "Bank". Show the institution Plaid reports, or "Linked bank (not shared)" with a fix-it link. | 🔴 |

## Enhancements (proposed)
| # | Idea | Why |
|---|---|---|

## David's Mac (needs a device)
- iPhone and Mac speed: `xcodebuild … test -only-testing:DaveyTests/PerformanceTests` and Instruments (PERF-REPORT.md).
- Safari: `cd webapp && npx playwright install webkit && npx playwright test --project=webkit`.
