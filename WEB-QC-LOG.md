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

## Loop 2 — 2026-10-22 10:45 UTC
- Visual audit of all 180 screenshots (360/768/1280/1920, light + dark): palette and layout match the app (navy, gold
  fills, sage gains, terracotta overspend).
- Found: Mortgages & loans refinance card showed "-$32,206 more after costs" (minus and "more" together); the
  "Budgets vs actual" title broke onto two cramped lines at 360px; Recurring's subtitle said everything was "found in
  your transactions" (it now includes the app's own rules).
- Fixed: lifetime interest shows the amount without a sign ("$32,206 more after costs"); the budget total drops
  below the title on narrow screens; subtitle reworded.
- New tests: debt.spec refinance wording; overflow.spec one-line card title at 360px.
- Counts: Vitest 101/101, Playwright Chromium 83/83.

## Loop 3 — 2026-10-22 11:05 UTC
- Found: on laptop windows under ~860px tall, the sidebar pushed Settings and Sign out below the fold (only reachable
  by scrolling the sidebar, with no hint).
- Fixed: compact sidebar spacing for short windows (email hidden under 700px); everything fits at 1280×700.
- Also reviewed: Transactions 360 dark, Settings 1280 light: no further issues. Login activity notice disappears once
  `login-activity` is deployed (Mac paste).
- New test: overflow.spec "sidebar fits a short laptop window".
- Counts: Vitest 101/101, Playwright Chromium 84/84.

## Loop 4 — 2026-10-22 11:15 UTC
- Checked empty states for a brand-new account (no household data) on every screen at 360px: headings, $0.00 totals,
  "No accounts yet" + Connect a Bank, budget guidance. No NaN/undefined/endless spinners. No issues found.
- New test: sweep.spec "brand-new account" (every screen: heading, no NaN/undefined/Infinity, no stuck spinner).
- Counts: Vitest 101/101, Playwright Chromium 85/85.

## Loop 5 — 2026-10-22 11:25 UTC
- Public pages (/, /help, /terms, /cancel, /join, /auth/callback, /auth/reset, /app/access) served like GitHub Pages:
  no script errors, every internal link and asset resolves. No issues found. (Live site: container has no DNS for
  daveypersonalfinance.com; GitHub Pages deploys for every push tonight are checked instead.)
- New test: public.spec.
- Counts: Vitest 101/101, Playwright Chromium 86/86.

## Loop 6 — 2026-10-22 10:45 UTC
- Live: David confirmed from a real browser (10:32 UTC) that daveypersonalfinance.com/app serves the new build and
  redirects to /app/access?next=/login with the Company access code screen.
- Found: in light mode the keyboard focus ring was plain gold on white/light surfaces, 1.84:1 (WCAG 1.4.11 needs 3:1);
  input focus border the same.
- Fixed: focus ring and focused-input border use gold ink in light mode (gold in dark mode and on navy surfaces:
  sidebar, net worth card).
- Checked: a deep link (/app/budget) survives the access code, sign-in and 2-step code.
- New tests: focus.spec (focus indicator ≥ 3:1, light + dark; fails on the old CSS), access.spec deep link.
- Counts: Vitest 101/101, Playwright Chromium 89/89.

## Loop 7 — 2026-10-22 11:00 UTC
- Palette audit (every color in the CSS vs the app's assets). Found: Cash flow drew spending in gold (the app: slate
  blue = spending, gold = nearing a limit); Investments allocation used generic bright blue/orange/green instead of the
  app's six categorical chart colors (and its dark mode skipped slot 5); budget bars had no "nearing the limit" state.
- Fixed: chart colors are now the app's ChartIncome/Slate/Gold/Overspend/Grid and ChartCategory1–6 values, light and
  dark; allocation shows six slots before "Other" like the app; budget bars turn chart gold at 80% (the app's alert
  threshold) and terracotta over.
- New tests: money.spec chart colors (light + dark), debt.spec allocation colors (light + dark), Meter.test.
- Counts: Vitest 102/102, Playwright Chromium 93/93 (three runs; one earlier run had a single failure that didn't
  repeat and wasn't captured; watching for it with failure output on).
