# Web QC log

Each loop: pull main, Vitest + Playwright (Chromium; WebKit/Firefox aren't installed in the cloud container), screens at
360/768/1280/1920 light + dark, axe, Lighthouse (served gzipped like GitHub Pages), bundle size, console errors, broken
links, empty/loading/error states. The live site can't be reached from the container (DNS); its deploy is checked via
the GitHub Pages run instead.

## Loop 1 — 2026-10-22 10:20 UTC
- Found: Recurring asked for 3 tables that don't exist (404s on every visit) and ignored the recurring rules entered in
  the app; Settings called a `login-activity` function that was never built (404); Overview and Tax showed raw server
  error text ("boom") with no way to retry; sign-in screens downloaded Overview/Transactions/Connect code; the local
  test server didn't gzip, so Lighthouse under-scored.
- Fixed: Recurring reads the app's rules (household_records, entity "recurring"; paused/ended hidden; next date from
  the start date); new `login-activity` function + SQL in davey-ios release-candidate 87ecec7 (deploy with the Mac
  paste); friendly load errors + Try again; Overview/Transactions/Connect/MfaEnroll load on demand (-7 kB gz on first
  visit); test server gzips. Test mock uses the production Investments table names.
- New tests: recurringRecords (3), loadError (2), perf.spec (bundle budget < 170 kB gz, no signed-in code on sign-in),
  sweep.spec (every screen: no console errors or 4xx/5xx, no broken in-app links; server error → message, no crash).
- Lighthouse (sign-in, access code): performance 94/98, accessibility 100, best practices 100.
- Counts: Vitest 101/101, Playwright Chromium 82/82.
