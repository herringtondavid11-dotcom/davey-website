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

## Fix log (from 2:00 AM PT)
- 09:30 UTC: #4 Refresh all 7 reloads → 2, 5–7 s → 1.7 s (3 banks); #9/#10 (+#1) screens open at the top, Back restores the scroll position. a91c572

- 10:10 UTC: #18/#19 help and Settings usable during a data outage, clearer error; #22 44 px touch targets. 2137bf0

- 10:50 UTC: #11 focus on new screens, #13 Transactions filters in the URL, #15/#16 + E3 amount fields. 8571a00

- 11:35 UTC: #12 Back closes dialogs and sheets; #14 verified OK; household-parity test made robust. a20737d

- 12:25 UTC: #6 Investments 216 → ~50 ms (shared date formatters); cold load 2.7 → 1.8 s; #2 downgraded to P3 after profiling. 0cf3ef3

- 13:00 UTC: #3 "Bank not shared" with how to fix it (web + iOS 179a542); #17 offline banner. bf498b3

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

## Responsive and themes (round 6, 08:35 UTC)
18 screens at 320/390/768/1280/1920 in light and dark mode. No contrast failures (axe), no text under 11 px, no
clipped money amounts, and nothing wider than the screen (overflow spec). 1280 and 1920 are clean. Problems: #22–#23 (tap targets on touch sizes).

## Empty, loading and error states (round 5, 08:00 UTC)
Works: slow loads show a labeled spinner ("Loading accounts") within 300 ms on every screen; failed loads show an
error with Try again on every screen; empty Overview, Credit cards, Loans and Investments say what to do.
Problems: #18–#21.

## Forms (round 4, 07:20 UTC)
Works: double Enter or double-click submits once (nickname, manual account); a slow save shows "Saving…" with the
button disabled; offline saves show an error instead of hanging. Problems: #15–#17.
Probe note: Playwright's offline switch doesn't block mocked requests, so the offline check aborts them instead.

## Navigation (round 3, 06:40 UTC)
Works: deep links to all 18 screens (fresh load) land on the right screen and title; signed out → `/login?next=…`;
the Accounts chart filter and group/sort survive Back (saved prefs); `?q=` on Transactions fills the search.
Problems: #9–#14 below.

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
| 1 | P2 | Web phone | Back to Transactions loses the scroll position (1500 px → top). | ✅ a91c572 |
| 2 | P3 | Web | Household is the slowest screen to open (122–174 ms; the others are under 80 ms). | 🔴 (profiled: no CPU cost; it waits on one backend call, so prefetch it) |
| 3 | P2 | Web | Accounts linked to a bank the household doesn't share still show "Bank". Show the institution Plaid reports, or "Linked bank (not shared)" with a fix-it link. | ✅ bf498b3, iOS 179a542 |
| 4 | **P1** | Web | Refresh all reloads every household record before and after each bank (7 reloads, 77 requests for 3 banks; 5–7 s with an instant mock). With ~12 real banks that's ~25 reloads and several hundred requests. Fix: load once, sync banks in parallel (2–3 at a time), merge onto the latest copy of just the changed records, reload once at the end. The background relink has the same cost. | ✅ a91c572 |
| 5 | P2 | Web | Cold load with 10k transactions: 1.8–2.7 s and long tasks up to 168 ms (record parsing and toRows). Fix: build rows in one pass, defer non-visible work, and cache the last load (IndexedDB) for an instant first paint. | 🟡 0cf3ef3: 2.7 s → 1.8 s, longest task 168 → 77 ms; cached first paint (E2) still open |
| 6 | P2 | Web | Investments: 155 ms long task on open (10k). Fix: memoize the history/performance series and compute it off the first render. | ✅ 0cf3ef3 |
| 7 | P3 | Web | Investment holdings are fetched twice on cold load (`investment_holdings`, `household_records?holding`). | 🔴 |
| 9 | **P1** | Web phone | Opening a screen from a link lower on the page keeps the old scroll position: Budget opened 685 px down, so the top (title, summary) is off-screen. New screens must start at the top. | ✅ a91c572 |
| 10 | P2 | Web | Back doesn't restore the scroll position anywhere (Transactions 1200 → 0 on desktop and phone). Extends #1. Restore per history entry; new navigations go to the top. | ✅ a91c572 |
| 11 | P2 | Web | Focus after navigation: it stays on the clicked link (desktop) or falls to `body` (phone), so screen readers don't announce the new screen. Move focus to the new screen's `h1` (tabindex -1) and announce the title. | ✅ 8571a00 |
| 12 | P2 | Web phone | Back with a dialog open (Manage categories) leaves the screen instead of closing the dialog. On phones, Back should close dialogs, sheets and the account editor first. | ✅ a20737d |
| 13 | P2 | Web | Transactions search and filters are lost on Back (the URL stays /transactions). `?q=` already works as a deep link, so write the search and filters to the URL (replace) to make Back, refresh and shared links keep them. | ✅ 8571a00 |
| 14 | P3 | Web | Unknown address (/app/does-not-exist) shows Overview but keeps the wrong URL, with no "page not found" note. Redirect to /app/ (replace) and show a one-line notice. | ✅ no change: it already redirects to /app (the probe read the URL too early) |
| 15 | P2 | Web | Add a manual account with balance "abc": pressing Add does nothing, with no message. Show "Enter an amount like 1,250.50" next to the field. | ✅ 8571a00 |
| 16 | P3 | Web | Goal editor: invalid amounts ("abc", "-5", "0") just grey out Save without saying why; "1e9" is accepted as $1,000,000,000; "10,000.555" keeps fractions of a cent; a target date in the past is accepted. Inline messages, money parsing to cents, date ≥ today. | 🔴 |
| 17 | P3 | Web | Offline: saving shows "Couldn't save. Try again." with no sign the device is offline, and the edit is lost on reload. Show an offline banner and offer to retry when back online. | 🔴 |
| 18 | P2 | Web | When loading fails, every screen shows only "Couldn't load your data", including Connection help, which is static help you need most when things are broken. Keep help (and Settings › sign out) usable; show the error as a banner over cached data where there is some. | ✅ 2137bf0 |
| 19 | P3 | Web | The error card repeats itself ("Couldn't load your data" as the title and again in the text). Say what to do instead: "Check your connection, then Try again. Your data is safe." | ✅ 2137bf0 |
| 20 | P3 | Web | Empty household: Accounts, Budget, Cash flow, Recurring and Tax show $0.00 dashboards instead of a first step. Overview, Credit cards, Loans and Investments already say "Connect an account". Make them consistent: one short line and a Connect / Add account button. | 🔴 |
| 21 | P2 | Web ↔ app parity | Household on the web says "Turn it on in the Davey app"; starting Household Sharing isn't possible on the web. Check against the spec; either add it or link to the exact app steps. | 🔴 |
| 22 | P2 | Web phone/tablet | Tap targets under 44 px (Apple's minimum) at 320–768: the account name buttons on Accounts are 24 px tall; Set goal, Budget Edit (24×28), Set budget, Settings Remove and Exports downloads are 28 px. Give them a 44 px hit area (padding or a pseudo-element) without changing the look. | ✅ 2137bf0 |
| 23 | P3 | Web phone | Recurring calendar day cells are 32 px wide at 320 px (fine at 390 and up). Acceptable; note for a compact week view. | 🔴 |
| 8 | P3 | iPhone/Mac | Check the same Refresh all cost on the app (BankSyncService.refreshAll runs banks one after another). Code review in a later round. | 🔴 |

## Enhancements (proposed)
| # | Idea | Why |
|---|---|---|
| E1 | Refresh all shows per-bank progress (✓ Chase, … Wells Fargo) while it runs | It takes seconds with many banks; today it's one "Refreshing N banks…" line |
| E3 | Shared money input (parse "$1,250.50", reject "1e9", round to cents, inline error) for every amount field | One rule everywhere; fixes #15/#16 together | ✅ 8571a00
| E2 | Instant first paint from a cached copy (IndexedDB), then refresh in place | Cold load is 2–3 s for a heavy household |

## David's Mac (needs a device)
- iPhone and Mac speed: `xcodebuild … test -only-testing:DaveyTests/PerformanceTests` and Instruments (PERF-REPORT.md).
- Safari: `cd webapp && npx playwright install webkit && npx playwright test --project=webkit`.
