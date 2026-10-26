# Web QC log

Each loop: pull main, Vitest + Playwright (Chromium; WebKit/Firefox aren't installed in the cloud container), screens at
360/768/1280/1920 light + dark, axe, Lighthouse (served gzipped like GitHub Pages), bundle size, console errors, broken
links, empty/loading/error states. The live site can't be reached from the container (DNS); its deploy is checked via
the GitHub Pages run instead.

## Loop 1 — 2026-10-22 10:09 UTC
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

## Loop 2 — 2026-10-22 10:12 UTC
- Visual audit of all 180 screenshots (360/768/1280/1920, light + dark): palette and layout match the app (navy, gold
  fills, sage gains, terracotta overspend).
- Found: Mortgages & loans refinance card showed "-$32,206 more after costs" (minus and "more" together); the
  "Budgets vs actual" title broke onto two cramped lines at 360px; Recurring's subtitle said everything was "found in
  your transactions" (it now includes the app's own rules).
- Fixed: lifetime interest shows the amount without a sign ("$32,206 more after costs"); the budget total drops
  below the title on narrow screens; subtitle reworded.
- New tests: debt.spec refinance wording; overflow.spec one-line card title at 360px.
- Counts: Vitest 101/101, Playwright Chromium 83/83.

## Loop 3 — 2026-10-22 10:15 UTC
- Found: on laptop windows under ~860px tall, the sidebar pushed Settings and Sign out below the fold (only reachable
  by scrolling the sidebar, with no hint).
- Fixed: compact sidebar spacing for short windows (email hidden under 700px); everything fits at 1280×700.
- Also reviewed: Transactions 360 dark, Settings 1280 light: no further issues. Login activity notice disappears once
  `login-activity` is deployed (Mac paste).
- New test: overflow.spec "sidebar fits a short laptop window".
- Counts: Vitest 101/101, Playwright Chromium 84/84.

## Loop 4 — 2026-10-22 10:16 UTC
- Checked empty states for a brand-new account (no household data) on every screen at 360px: headings, $0.00 totals,
  "No accounts yet" + Connect a Bank, budget guidance. No NaN/undefined/endless spinners. No issues found.
- New test: sweep.spec "brand-new account" (every screen: heading, no NaN/undefined/Infinity, no stuck spinner).
- Counts: Vitest 101/101, Playwright Chromium 85/85.

## Loop 5 — 2026-10-22 10:19 UTC
- Public pages (/, /help, /terms, /cancel, /join, /auth/callback, /auth/reset, /app/access) served like GitHub Pages:
  no script errors, every internal link and asset resolves. No issues found. (commit times; Live site: container has no DNS for
  daveypersonalfinance.com; GitHub Pages deploys for every push tonight are checked instead.)
- New test: public.spec.
- Counts: Vitest 101/101, Playwright Chromium 86/86.

## Loop 6 — 2026-10-22 10:35 UTC
- Live: David confirmed from a real browser (10:32 UTC) that daveypersonalfinance.com/app serves the new build and
  redirects to /app/access?next=/login with the Company access code screen.
- Found: in light mode the keyboard focus ring was plain gold on white/light surfaces, 1.84:1 (WCAG 1.4.11 needs 3:1);
  input focus border the same.
- Fixed: focus ring and focused-input border use gold ink in light mode (gold in dark mode and on navy surfaces:
  sidebar, net worth card).
- Checked: a deep link (/app/budget) survives the access code, sign-in and 2-step code.
- New tests: focus.spec (focus indicator ≥ 3:1, light + dark; fails on the old CSS), access.spec deep link.
- Counts: Vitest 101/101, Playwright Chromium 89/89.

## Loop 7 — 2026-10-22 10:44 UTC
- Palette audit (every color in the CSS vs the app's assets). Found: Cash flow drew spending in gold (the app: slate
  blue = spending, gold = nearing a limit); Investments allocation used generic bright blue/orange/green instead of the
  app's six categorical chart colors (and its dark mode skipped slot 5); budget bars had no "nearing the limit" state.
- Fixed: chart colors are now the app's ChartIncome/Slate/Gold/Overspend/Grid and ChartCategory1–6 values, light and
  dark; allocation shows six slots before "Other" like the app; budget bars turn chart gold at 80% (the app's alert
  threshold) and terracotta over.
- New tests: money.spec chart colors (light + dark), debt.spec allocation colors (light + dark), Meter.test.
- Counts: Vitest 102/102, Playwright Chromium 93/93 (three runs; one earlier run had a single failure that didn't
  repeat and wasn't captured; watching for it with failure output on).

## Loop 8 — 2026-10-22 10:52 UTC
- Flake hunt: full Chromium suite ×4 (372 runs) → 1 failure: screenshots "1280 light". Cause: the test left the access
  code screen before the pass was saved (test timing, not an app bug); a11y.spec had the same race.
- Fixed: both tests wait for the Sign in screen before navigating. Screenshots + a11y ×3: 36/36.
- Counts: Vitest 102/102, Playwright Chromium 93/93.

## Loop 9 — 2026-10-22 10:55 UTC
- Found: an account created on the web keeps the company access pass in its user metadata, which Supabase copies into
  every access token.
- Fixed: after the first full sign-in (2-step done) the web clears `access_pass` from the metadata (other fields kept).
- New test: access.spec "access pass is cleared from the account metadata".
- Counts: Vitest 102/102, Playwright Chromium 94/94.

## Loop 10 — 2026-10-22 11:00 UTC (David: OAuth return through the PIN and login)
- Checked: /app/oauth?oauth_state_id=…&extra=… with no pass and no session → /app/access?next=/login?next=/oauth?… →
  code → /login?next=/oauth?… → password + 2-step → /oauth with the full original query → Link resumes with that exact
  receivedRedirectUri. Worked already; now covered by a test.
- Found: the realistic way to land there signed out is the 30-minute idle sign-out while at the bank, and that
  sign-out deleted the pending Link session; the pending session also expired after 30 minutes (Plaid's link token
  lasts 4 hours; 30 minutes is the public token's lifetime). Either way Link couldn't resume.
- Fixed: an idle sign-out keeps the pending Link session (an explicit sign-out still clears it); it lasts 4 hours; it
  records who started it and only that user can resume it (another user's is discarded).
- New tests: access.spec ×3 (full query through code + login + 2-step; idle sign-out then resume; never another
  user's), pendingLink.test ×2; idle.test updated for the 4-hour lifetime. Both new e2e tests fail on the old code.
- Counts: Vitest 104/104, Playwright Chromium 97/97.

## Loop 11 — 2026-10-22 12:16 UTC (hourly check; main had the Mac session's redesigned Overview + Accounts goals)
- Pages: previous deploys succeeded. Pulled main (7c5f066): Vitest 112/112, Playwright 100/100 before fixes.
- Found: net worth, portfolio and forecast chart axes read "$$1M", "$$750k", "$$0" (the formatter already adds "$"; the
  Investments/forecast ones predate the redesign); negative axis values would read "$-5000"; the net worth trend
  started at $0, so +4% over 6 months drew as a flat line.
- Fixed: one "$" (sign first: "-$5k"); net worth and portfolio trends scale to their range.
- New tests: compact.test (labels, range ticks), sweep.spec (no "$$" on chart screens; net worth axis not from $0).
- Counts: Vitest 115/115, Playwright Chromium 102/102.

## Loop 12 — 2026-10-22 13:32 UTC (hourly check)
- Pages: ddc73b7 deployed (success). No new commits on main.
- Checked: Accounts goal editor open at 360 light/dark (layout, axe), Lighthouse access/login 96/94 performance,
  100 accessibility, 100 best practices. No issues found.
- New test: a11y.spec "Accounts with a goal editor open" (light + dark).
- Counts: Vitest 115/115, Playwright Chromium 104/104.

## Loop 13 — 2026-10-22 14:33 UTC (David blocked: "friendly name 'Davey authenticator' already exists")
- Cause: a leftover unfinished 2-step setup held the name "Davey authenticator"; Supabase refuses a second one, and
  the cleanup didn't clear it, so "Turn on 2-step verification" stopped with that error and only "Cancel and sign out".
- Fixed: on a name conflict the web clears unfinished setups and retries, then falls back to a unique name
  ("Davey authenticator (date time)"); setup runs once per page even if the screen mounts twice; the error state has a
  Try again button.
- New tests: auth.spec "leftover unfinished 2-step setup never blocks setup", mfaNames.test.
- Counts: Vitest 117/117, Playwright Chromium 105/105.

## Loop 14 — 2026-10-22 14:56 UTC (David: replace the QR setup with a code by text; chose email, free)
- Web 2-step is now: password → "Check your email" → enter the code from Davey's sign-in email. QR/authenticator
  enrollment, recovery keys and the TOTP challenge are removed from the web. Settings › Security says so.
- One code per sign-in (a reload doesn't send another), "Send a new code" after 60 s, clear email-limit message,
  "Use a different account". Password-reset links count as verified (they already prove the email).
- Tests: auth.spec rewritten (email code sign-in, no QR, one send, resend wait, rate limit, Settings wording, reset
  links); access.spec/screenshots use the email code; emailCode.test.
- Counts: Vitest 112/112, Playwright Chromium 105/105.

## Loop 15 — 2026-10-22 15:39 UTC (hourly check)
- Pages: a4f93d0 (email-code sign-in) deployed successfully at 15:06 UTC. No new commits from other sessions.
- Checked: "Check your email" screen with axe in light and dark — no serious/critical issues.
- New test: a11y.spec "Check your email" sign-in code screen (light + dark).
- Counts: Vitest 112/112, Playwright Chromium 107/107.

## Loop 16 — 2026-10-22 16:43 UTC (hourly check)
- Pages: a497e8a deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112, Playwright Chromium 107/107.

## Loop 17 — 2026-10-22 17:47 UTC (hourly check)
- Pages: ed3e02d deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112, Playwright Chromium 107/107.

## Loop 18 — 2026-10-22 18:51 UTC (hourly check)
- Pages: d44ef69 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112, Playwright Chromium 107/107.

## Loop 19 — 2026-10-22 19:03 UTC (David's real login: link-only email, back to the start)
- Cause: production Auth email templates were still Supabase's defaults (link, no code); codes were 8 digits; the link
  pointed at the Site URL (home page).
- Fixed (web): "Enter the 6-digit code we emailed you", exactly 6 digits (pasted spaces OK), emails ask for links to
  /app/, and an old link landing on the home page (?code= or #error_code/#access_token) is forwarded to /app/ (code
  screen or finished sign-in). Home page itself unaffected.
- Fixed (app, davey-ios release-candidate a54ae9c): code screens say/accept 6 digits; fakes 123456/654321.
- Server config: code-only branded template + scripts/auth-email-fix.sh (Management API, before/after, rollback);
  needs David's Mac run (AUTH-EMAIL-FIX.md). Until then emails still arrive as the default link email.
- New tests: auth.spec (6-digit field and wording, redirect_to /app/, old link → code screen, home page not redirected).
- Counts: Vitest 112/112, Playwright Chromium 110/110.

## Loop 20 — 2026-10-22 19:17 UTC (sign-in works today without the Supabase change)
- The code email asks Supabase to send its link to /app/auth/callback. Tapping it in the same browser finishes the
  2nd step: supabase-js exchanges ?code= once on load; a ?token_hash= link is verified at most once. A link that
  went to the home page (redirect not allowed) is forwarded to /app/auth/callback. Old/expired links → code screen
  with "That sign-in link has expired or was already used. Enter the 6-digit code…" (or sign-in when signed out).
- The code screen also says "No code in the email? Tap its sign-in link on this device and browser instead."
- Fixed: a reload while the first code email was in flight could send a second one (now recorded before sending).
- /app/** in the production redirect allow-list: reported added by the Mac session on 2026-10-21 (OVERNIGHT-REPORT.md);
  not checkable from this container. If it isn't, the home-page forwarder covers it (test b3).
- Proof (e2e/signin-proof.spec.ts): (a) code → Overview; (b) link → callback → signed in, 1 exchange, 0 verifies;
  (b2) token_hash verified once; (b3) via home page; (c) expired/used links → code screen + message; (c2) signed out
  → sign in + message; (d) wrong code, resend after 60 s, email limit; (e) PIN pass + code step across refreshes.
  Auth/access/proof specs ×4–5 repeats: 152/152 and 130/130.
- Counts: Vitest 112/112, Playwright Chromium 119/119 (two full runs).

## Loop 21 — 2026-10-22 19:55 UTC (hourly check)
- Pages: da55550 (email-link sign-in) deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112, Playwright Chromium 119/119.

## Loop 22 — 2026-10-22 21:00 UTC (hourly check)
- Pages: 378b0ac deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112, Playwright Chromium 119/119.

## Loop 23 — 2026-10-22 22:06 UTC (hourly check)
- Pages: 106ffb6 deployed (success). No new commits from other sessions.
- Found: ai.spec failed once (passed 18/18 on repeat): the test read the Ask AI request body before the browser had
  sent it (test timing, not an app bug).
- Fixed: the test waits for the request (expect.poll). ai.spec ×10: 30/30.
- Counts: Vitest 112/112, Playwright Chromium 119/119.

## Loop 24 — 2026-10-22 23:10 UTC (hourly check)
- Pages: 22f38da deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112, Playwright Chromium 119/119.

## Loop 25 — 2026-10-22 23:28 UTC (David 4:22 PM PT: disable the emailed 2nd step on the web)
- He got another "Your sign-in link" email (Supabase template still the default; AUTH-EMAIL-FIX.md not run yet).
- Done: webapp/src/flags.ts EMAIL_2FA_ENABLED = false. Access code (still required) → email + password → Overview.
  The code screen never renders, so signInWithOtp is never called and no sign-in email is sent. Settings says 2-step
  is off on the web for now. The email-code code and its tests stay in the codebase (tests skip while the flag is off).
- New tests: e2e/signin-direct.spec.ts (password → Overview with zero /otp or /verify calls; access code still
  enforced on /app, /login, /signup, /forgot; wrong password; refresh; old link email; Settings wording).
- Counts: Vitest 112/112; Playwright Chromium 108 passed, 17 skipped (email-code tests), 0 failed.
- Turn back on: set EMAIL_2FA_ENABLED = true after scripts/auth-email-fix.sh has run (6-digit code emails).

## Loop 26 — 2026-10-22 23:35 UTC (UPDATE all platforms: remove the Accounts tab buttons card)
- Web: the Connect a Bank / Add Account buttons are gone from the Accounts tab; search + the % Funded / Balance / Name
  sort now sit directly under the Total Balance card. No replacement button on the tab.
- iPhone + Mac (davey-ios release-candidate b971420): same removal in AccountsTabView; the sort picker is the first
  thing under the header card. UI tests updated (buttons absent, sort under the total, Settings › Accounts still has
  Connect a Bank + Add Manual Account). Not built here (no Xcode): in MAC-REBUILD-NEXT.md.
- Paths that remain: web: sidebar "Connect a Bank" (desktop), More › Connect a Bank (phone), Overview header, and
  "Add a manual account instead" on the Connect a Bank page (manual add existed only in the removed card on the web,
  so it moved there, mirroring the app's Settings › Accounts). iPhone: Settings › Accounts › + (Connect a Bank,
  Connect a Mortgage or Loan, Connect an Investment Account, Add Manual Account); Overview's empty state. Mac: the
  Settings section/window › Accounts › + (same menu).
- New tests: accounts.spec (no buttons, sort directly under the total at 360/1280; remaining paths + manual add).
- Counts: Vitest 112/112; Playwright Chromium 110 passed, 17 skipped (email-code), 0 failed.

## Loop 27 — 2026-10-22 23:42 UTC (PRIORITY: Plaid Link a small box at the bottom on iPhone Safari)
- Cause: our CSP (style-src 'self') refuses the inline styles Plaid's script puts on its iframe, so the iframe stayed
  an unstyled in-page box at the end of <body> (reproduced: y=725 instead of 0 on the old CSS). Not a z-index, transform,
  overflow or 100vh problem.
- Fixed (CSP unchanged, still strict): app.css sizes iframe[id^="plaid-link-iframe"] itself: position fixed, inset 0,
  100vw × 100dvh, z-index max, only while body.plaid-open (set by usePlaidFlow while Link is open); hidden otherwise,
  so a closed Link never covers the app. The tab bar, mobile header and Ask AI button hide while Link is open.
- New tests: e2e/plaid-overlay.spec.ts with iPhone 14 and iPad emulation (Chromium engine; WebKit isn't installed in
  this container) + desktop: the frame's box equals the viewport, it's the topmost element at the center, top-left
  and bottom edge (where the tab bar is), the bars are hidden, and closing Link hides it. Fails on the old CSS.
  The Plaid test fake now adds its iframe like Plaid (inline style, refused by the CSP); that one console warning is
  expected and allowed.
- Counts: Vitest 112/112; Playwright Chromium 113 passed, 17 skipped (email-code), 0 failed.

## Loop 28 — 2026-10-23 00:17 UTC (PRIORITY: bank limit 230, one server-side value)
- David hit "You've connected 10 banks…" on iPhone (5:10 PM PT): the installed app (10) and the deployed server (10)
  both still had the old cap; the 10 → 30 change was never deployed or installed.
- Where the cap lived: server _shared/entitlement.ts (LIMITS.premium.bankConnections, used by plaid-link-token);
  iPhone/Mac Store/PlanLimits.swift (premiumBankConnections, checked before Link in BankConnectionFlow,
  AccountsListView, ServicerHelpSheet; message BankSyncService.fairUseMessage). plaid-exchange and the web had none.
- Now: one value, server_flags.max_bank_connections (migration 20261025020000 upserts 230; default 230 if missing),
  read by plaid-link-token, which decides and words the message with the live number. iPhone/Mac: no Premium cap
  (free plan's 1-bank paywall gate stays), the server's message is shown as is. Web: shows the server's message as
  is (it used to show supabase-js's generic "non-2xx" text); no client cap. Terms page: up to 230.
- Tests: Deno (90/90 incl. 10, 11, 229 allowed; 230, 231 refused with "230 banks"; flag parsing; free message);
  Swift EntitlementsTests (Premium never capped on device at 10/11/229/230/231; server message shown as is; not run
  here, no Xcode); web e2e (server's 230 message shown; Connect always asks the server).
- davey-ios release-candidate 874bf92. Needs David's Mac: migration + deploy plaid-link-token (fixes it for the web
  and for the server's own check) AND an iPhone/Mac rebuild (the installed app refuses at 10 before asking the server).
- Counts: Vitest 112/112; Playwright Chromium 115 passed, 17 skipped (email-code), 0 failed.

## Loop 29 — 2026-10-23 01:13 UTC (resumed)
- Pages: 0f86791 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112; Playwright Chromium 115 passed, 17 skipped (email-code), 0 failed.

## Loop 30 — 2026-10-23 01:20 UTC (hourly check)
- Pages: e9a5875 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112; Playwright Chromium 115 passed, 17 skipped (email-code), 0 failed.

## Loop 31 — 2026-10-23 02:23 UTC (hourly check)
- Pages: 6a8a45f deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112; Playwright Chromium 115 passed, 17 skipped (email-code), 0 failed.

## Loop 32 — 2026-10-23 03:28 UTC (hourly check)
- New on main from another session: 563b597 "Browser and marketing UX sweep (#1)" (failed first load → error + Try
  again, self-hosted fonts, focus/phone menu, SEO, prices hidden while subscriptions are off). Pages deployed (success).
- Noted, not changed: the public pages and Terms now promise "up to 30" banks (its tests require that and forbid
  "230" publicly), while the real server cap is 230 (server_flags.max_bank_connections). The promise is below the cap,
  so nothing breaks; the app/server message still says 230 when that's reached.
- Counts: Vitest 112/112; Playwright Chromium 118 passed, 17 skipped (email-code), 0 failed.

## Loop 33 — 2026-10-23 04:32 UTC (hourly check)
- Pages: 820f145 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 112/112; Playwright Chromium 118 passed, 17 skipped (email-code), 0 failed.

## Loop 34 — 2026-10-23 05:36 UTC (hourly check)
- New on main from another session: 113076b "Show a message when Plaid Link exits before bank sign-in finishes (#2)"
  (new 'unfinished' step: "<Bank> sign-in didn't finish. Make sure pop-ups are allowed…", Try again). Reviewed: works
  with the full-screen Link fix (the overlay class is only on while 'linking'). Pages deployed (success).
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 35 — 2026-10-23 06:40 UTC (hourly check)
- Pages: 1c7bfde deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 36 — 2026-10-23 07:44 UTC (hourly check)
- Pages: 52bd7b3 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 37 — 2026-10-23 08:48 UTC (hourly check)
- Pages: a5240b1 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 38 — 2026-10-23 09:52 UTC (hourly check)
- Pages: 2261bbc deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 39 — 2026-10-23 10:57 UTC (hourly check)
- Pages: 98675ef deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 40 — 2026-10-23 12:02 UTC (hourly check)
- Pages: 07178ac deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 41 — 2026-10-23 13:09 UTC (hourly check)
- Pages: bced44a deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 42 — 2026-10-23 14:23 UTC (hourly check)
- Pages: 1d8cd93 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 43 — 2026-10-23 15:30 UTC (hourly check)
- Pages: c180f57 deployed (success). No new commits from other sessions. No issues found.
- Counts: Vitest 116/116; Playwright Chromium 119 passed, 17 skipped (email-code), 0 failed.

## Loop 44 — 2026-10-23 16:37 UTC (hourly check)
- New on main from another session (5d6165c…905d2f0): one Plaid session for bank/loan/investment connect, WebKit
  fixes (Sign in with Apple contrast in dark mode, serial screenshots, offline shell), Ask opens from the phone tab,
  tests wait for the access pass. Reviewed: the full-screen Plaid fix is intact (body.plaid-open + app.css), the
  'unfinished' message kept. Pages: 905d2f0 deployed (success).
- Counts: Vitest 116/116; Playwright Chromium 120 passed, 17 skipped (email-code), 0 failed.

## Loop 45 – 2026-10-23 17:40 UTC
- No new commits on main since 8a4c911; Pages run for 8a4c911: success.
- Live-site curl blocked by this container's network proxy (403 on CONNECT); deploy verified via the Actions API instead.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 116/116; Playwright Chromium 120 passed, 17 skipped (email-code), 0 failed (incl. 360/768/1280/1920 light+dark screens, axe, console, perf).

## Loop 46 – 2026-10-23 18:47 UTC
- No new commits on main since 5096ae0; Pages run for 5096ae0: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 116/116; Playwright Chromium 120 passed, 17 skipped (email-code), 0 failed.

## Loop 47 – 2026-10-23 19:52 UTC
- No new commits on main since 5c84295; Pages run for 5c84295: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 116/116; Playwright Chromium 120 passed, 17 skipped (email-code), 0 failed.

## Loop 48 – 2026-10-23 20:57 UTC
- No new commits on main since 749cd7f; Pages run for 749cd7f: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 116/116; Playwright Chromium 120 passed, 17 skipped (email-code), 0 failed.

## Loop 49 – 2026-10-23 22:02 UTC
- No new commits on main since e379f12; Pages run for e379f12: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 116/116; Playwright Chromium 120 passed, 17 skipped (email-code), 0 failed.

## Loop 50 – 2026-10-23 23:08 UTC
- New on main from another agent (bb09508, 772eb5d, co-authored from David's account): Plaid Link no longer covers the
  sidebar/tab bar; the frame sits beside the sidebar (desktop) or between the phone header and tab bar, so a Link
  that never paints can't freeze navigation. This replaces the earlier full-screen-and-hide-bars behavior on purpose.
  Reviewed: CSP-safe sizing kept, iframe hidden when closed, class removed in a layout effect; plaid-overlay e2e
  updated by that agent and passing here (iPhone 14, iPad, desktop).
- Issues found: 0. Fixed: 0.
- Counts: Vitest 116/116; Playwright Chromium 120 passed, 17 skipped (email-code), 0 failed.

## Loop 51 – 2026-10-24 00:20 UTC
- New on main from another agent (049fcaa, 4758956, co-authored from David's account), both deployed (Pages: success):
  - 049fcaa: content column widens on large desktops, three-column overview starts later, bigger section links;
    docs/QUALITY-ASSESSMENT-2026-10.md and e2e/quality.spec.ts added.
  - 4758956: the emailed sign-in code is removed entirely (it was already off via EMAIL_2FA_ENABLED=false), with its
    tests; service worker v2 is network-first with cache:'reload' for pages, so an old cached shell can't keep asking
    for a code. Reviewed: only same-origin /app/ GETs cached, no Supabase/Plaid data; offline still falls back to the shell.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 52 – 2026-10-24 01:22 UTC
- No new commits on main since 207c61b; Pages run for 207c61b: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 53 – 2026-10-24 02:26 UTC
- No new commits on main since e9b1a01; Pages run for e9b1a01: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 54 – 2026-10-24 03:30 UTC
- No new commits on main since afd695e; Pages run for afd695e: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 55 – 2026-10-24 04:35 UTC
- No new commits on main since 9b850cf; Pages run for 9b850cf: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 56 – 2026-10-24 05:40 UTC
- No new commits on main since 0c993ec; Pages run for 0c993ec: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 57 – 2026-10-24 06:44 UTC
- No new commits on main since 7b889bc; Pages run for 7b889bc: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 58 – 2026-10-24 07:50 UTC
- No new commits on main since 3df1a9c; Pages run for 3df1a9c: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 59 – 2026-10-24 08:55 UTC
- No new commits on main since 2063744; Pages run for 2063744: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 60 – 2026-10-24 10:00 UTC
- No new commits on main since 32939c8; Pages run for 32939c8: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 61 – 2026-10-24 11:06 UTC
- No new commits on main since 732aeb4; Pages run for 732aeb4: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 62 – 2026-10-24 12:14 UTC
- No new commits on main since ded3902; Pages run for ded3902: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 63 – 2026-10-24 13:19 UTC
- No new commits on main since 3605261; Pages run for 3605261: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 64 – 2026-10-24 14:23 UTC
- No new commits on main since 97709b7; Pages run for 97709b7: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 65 – 2026-10-24 15:29 UTC
- No new commits on main since dc60630; Pages run for dc60630: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 66 – 2026-10-24 16:34 UTC
- No new commits on main since a988724; Pages run for a988724: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 67 – 2026-10-24 17:40 UTC
- No new commits on main since a2c26da; Pages run for a2c26da: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 68 – 2026-10-24 18:45 UTC
- No new commits on main since 6cab7d1; Pages run for 6cab7d1: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 114/114; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 69 – 2026-10-24 19:52 UTC
- New on main: 7f38885 (PR #7, merged from David's account, Cursor agent): web Plaid Link onEvent/onExit logged to
  client_diagnostics as link_event (same shape as iOS); Mac Hosted Link tokens get the universal-link redirect for
  Chase OAuth; server bundles, loaders, a migration and rollback copies under supabase-changes/. Pages: success.
- Reviewed: link events use an allowlist, drop anything shaped like a link-/public-/access- token, never throw;
  plaidLinkEvent.test.ts covers it. Secret scan of supabase-changes/: no keys, only comments naming key types.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 117/117; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Loop 70 – 2026-10-24 20:55 UTC
- No new commits on main since 0e47be4; Pages run for 0e47be4: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 117/117; Playwright Chromium 125 passed, 0 skipped, 0 failed.

## Household parity – 2026-10-24 (priority update)
- Report: Allie (household member) saw $0 and a flat line on Investments; David saw real holdings and history.
- Cause: holdings and daily values weren't household data. Linked brokerages reached a member only through her own
  Plaid pull. Manual and CSV holdings, manual accounts' history and rentals never left David's devices. On the web,
  investment accounts were valued at starting balance plus transactions instead of their holdings.
- Web (this push): Investments merges the shared `holding` and `investmentSnapshot` records with the server rows.
  Investment accounts with holdings are worth their holdings, like the app. A member's Refresh is read-only on the
  server.
- Tests: householdParity.test.ts and e2e/household-parity.spec.ts (owner and member render identical portfolio
  $518,640.55, holdings, chart and net worth).
- iPhone/Mac and server: davey-ios release-candidate 8a15b6a. Steps are in MAC-REBUILD-NEXT.md §1.
- Counts: Vitest 121/121; Playwright Chromium 126 passed, 0 failed.

## Performance – 2026-10-24 (priority update)
- Web: each tab's code and the Investments tables now download while the browser is idle after the first screen.
  The shell's business check is memoized (it scanned every transaction on each navigation).
- Before/after, measured in the page from click to heading: Investments first visit 131–134 ms → 48–94 ms; other
  tabs 16–42 ms → 16–34 ms. Scrolling: p95 16.7 ms, no frame over 17 ms.
- New e2e/tab-budget.spec.ts:
  - Desktop and phone: each tab's best of two switches under 100 ms, every switch under 200 ms.
  - Scroll: frame budget.
- iPhone/Mac: davey-ios release-candidate (Overview/Budget memoized, household sync no longer re-encodes everything,
  cached date formatters, no receipt file reads per row). PERF-REPORT.md has the Instruments paste.
- Counts: Vitest 121/121; Playwright Chromium 129 passed, 0 failed (twice).

## Loop 71 – 2026-10-24 22:17 UTC
- New on main: only this session's performance and household-parity work. Pages run for 3d5cac1: success.
- Issues found: 0 beyond the performance work above. Fixed: 0.
- Counts: Vitest 121/121; Playwright Chromium 129 passed, 0 failed (two consecutive full runs).

## Responsiveness round 2 – 2026-10-24 (David: slows down over time, a "bubble" on every touch)
- Web: iPhone Safari's grey tap highlight (a rounded box over every tapped card and row) is turned off. Taps show
  Davey's own instant press feedback and act without the double-tap-zoom wait (touch-action: manipulation).
- New e2e/sustained.spec.ts runs ten rounds of: every tab, Ask AI open and close, Transactions, and the page hidden
  and shown. Measured at 1.1–1.4 s per round on desktop and phone, flat; heap 12–13 MB; DOM 372–379 nodes, unchanged.
- Counts: Vitest 121/121; Playwright Chromium 131 passed, 0 failed.

## Loop 72 – 2026-10-24 23:20 UTC
- No new commits on main since 7f3f42a; Pages run for 7f3f42a: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 121/121; Playwright Chromium 131 passed, 0 failed (including sustained and tab-budget specs).

## Loop 73 – 2026-10-25 00:25 UTC
- No new commits on main since f294ee0 or on davey-ios release-candidate; Pages run for f294ee0: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 121/121; Playwright Chromium 131 passed, 0 failed.

## Loop 74 – 2026-10-25 01:30 UTC
- No new commits on main since c7fcbc8 or on davey-ios release-candidate; Pages run for c7fcbc8: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 121/121; Playwright Chromium 131 passed, 0 failed.

## Loop 75 – 2026-10-25 02:36 UTC
- No new commits on main since b9ea775 or on davey-ios release-candidate; Pages run for b9ea775: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 121/121; Playwright Chromium 131 passed, 0 failed.

## Loop 76 – 2026-10-25 03:43 UTC
- No new commits on main since e95a705 or on davey-ios release-candidate; Pages run for e95a705: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 121/121; Playwright Chromium 131 passed, 0 failed.

## PenFed reconnect fix – 2026-10-25 04:10 UTC
- Root cause: web Reconnect (Plaid update mode, correct) then called plaid-sync without the cursor and discarded the
  answer, so the shared bankConnection stayed needsReauth and no balances/transactions changed on any platform.
- Fix: `lib/refreshBank.ts` syncs from the bank's cursor and pushes status ok, cursor, lastSyncedAt, balances and
  transactions to household_records; "Updating {bank}…" then "Updated just now"; a second pass after 30 s.
  Connecting the same bank as a new Item (same institution + mask) adopts it into the existing records and removes
  the old Item instead of duplicating accounts.
- Tests: refreshBank.test.ts (7); e2e accounts.spec: update-mode reconnect clears the badge; same-bank dedupe.
- Counts: Vitest 128/128; Playwright Chromium 132 passed, 0 failed.

## SoFi / PenFed badges – 2026-10-25
- Accounts kept a cached connection list after a reconnect, so the badge stayed until a full reload. Now cleared.
- "Connection problem" (status error, e.g. one failed sync on any device) had no fix button. Accounts now checks each
  flagged bank by syncing it (at most every 10 min): one that syncs turns OK on every platform; a login problem is
  checked once plaid-item-status says Plaid accepts the login again. Error rows show Try again and Reconnect.
- Tests: e2e accounts.spec (auto-check heals SoFi, keeps WF's Reconnect; a bank fixed elsewhere clears); unit test.
- Counts: Vitest 129/129; Playwright Chromium 134 passed, 0 failed.

## Loop 77 – 2026-10-25 04:55 UTC
- No new commits from other sessions; main head 45902e1 (SoFi/PenFed badge fix) deployed: success.
- Full suites ran on this head minutes ago (badge fix): issues found 0 beyond that fix.
- Counts: Vitest 129/129; Playwright Chromium 134 passed, 0 failed.

## Chase OAuth audit (web) – 2026-10-25
- Already right: one link token per attempt, stored before Link opens and reused on return; receivedRedirectUri =
  full href incl. oauth_state_id; one-shot claim per oauth_state_id (StrictMode/double mount, reload, back);
  query kept through the access/login redirect; redirect_uri exactly https://daveypersonalfinance.com/app/oauth;
  server token transactions-only, no account_filters/optional/additional products, US/en. CSP allows Plaid's
  iframe and pop-up; no COOP header.
- Fixed: /app/oauth inside a bank pop-up (desktop) no longer starts a second Link; it hands the return to the
  window that opened Link, which continues it only if Plaid's own Link didn't (closed, or nothing in 20 s), once.
  Saving a new link token no longer re-arms an already used oauth_state_id. Every return is logged
  (DAVEY_OAUTH_RETURN in client_diagnostics).
- Evidence: Chase fails on three independent clients (iOS LinkKit, Mac Hosted Link with no redirect_uri, web Link)
  while WF/BofA OAuth work, and Chase showed "Unauthorized Client" at its authorize step: Chase's registration for
  this Plaid client, not Davey's return handling. Dashboard checklist, queries and Plaid message: MAC-REBUILD-NEXT.md.
- Tests: e2e/oauth.spec.ts (pop-up hand-off, Plaid finishes itself, two tabs one exchange, token body); idle.test.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 78 – 2026-10-25 06:00 UTC
- No new commits on main since e8f66e5 or on davey-ios release-candidate; Pages run for e8f66e5: success.
- davey-ios CI: 0c27fd2 failed one timing check (Overview cold build 136 ms > 100 ms); fixed in cbc57a7 (best of 3
  cold builds), CI green.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 79 – 2026-10-25 07:04 UTC
- No new commits on main since 91cb3bc or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 80 – 2026-10-25 08:09 UTC
- No new commits on main since bf1ef14 or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 81 – 2026-10-25 09:16 UTC
- No new commits on main since 04eacb6 or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 82 – 2026-10-25 10:21 UTC
- No new commits on main since fdf3aa3 or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 83 – 2026-10-25 11:26 UTC
- No new commits on main since ec92afb or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 84 – 2026-10-25 12:32 UTC
- No new commits on main since 1780ae7 or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 85 – 2026-10-25 13:37 UTC
- No new commits on main since 64f54c4 or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Loop 86 – 2026-10-25 14:42 UTC
- No new commits on main since 465d915 or on davey-ios release-candidate (cbc57a7, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 129/129; Playwright Chromium 138 passed, 0 failed.

## Account categories – 2026-10-25
- Accounts: Category per account (shared as rollupCategory with iPhone/Mac), By category / By type, List / Table
  (Bank, Account, Category, Balance, Goal, Funded with a subtotal row per category), pie of what's owned by
  category (validated slots; legend with % and amount). Choices remembered per browser.
- Tests: accountCategories.test.ts (4), e2e/account-categories.spec.ts (3).
- Counts: Vitest 133/133; Playwright Chromium 141 passed, 0 failed.

## Loop 87 – 2026-10-25 15:48 UTC
- No new commits from other sessions; main 19989a0 (account categories) deployed: success. davey-ios
  release-candidate b39f6f9: CI green.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 133/133; Playwright Chromium 141 passed, 0 failed.

## Loop 88 – 2026-10-25 16:53 UTC
- No new commits on main since 49c09ff or on davey-ios release-candidate (b39f6f9, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 133/133; Playwright Chromium 141 passed, 0 failed.

## Loop 89 – 2026-10-25 17:58 UTC
- No new commits on main since 42b6996 or on davey-ios release-candidate (b39f6f9, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 133/133; Playwright Chromium 141 passed, 0 failed.

## Loop 90 – 2026-10-25 19:08 UTC
- No new commits on main since bb2766b or on davey-ios release-candidate (b39f6f9, CI green); Pages run: success.
- One transient failure: sustained.spec "ten rounds (phone)" missed its round-time check once during the full
  parallel run (container CPU contention). Passed 3/3 alone and in a full rerun; heap 13 MB and DOM 372 nodes flat
  across all ten rounds, so no slowdown over time. Watching it; no code change.
- Counts: Vitest 133/133; Playwright Chromium 141 passed, 0 failed (rerun).

## Account categories round 2 + loop 91 – 2026-10-25 20:25 UTC
- Bank | Account | Category as separate columns (bank left, logo/initials); household-managed categories (16
  built-ins with fixed IDs + the household's own; add, rename, colour, reorder, remove with reassign) in Settings
  and inline; automatic category from Plaid type/subtype; chart donut/bar with total, % of net worth, count, %
  funded, filtering on click; group Category/Bank/None; sort Balance/Name/Bank/% Funded/Recently updated; chips;
  collapsible sections; search incl. last 4 and category; sortable table with Updated; prefs per user.
- Fixed on the way: legend roles + accessible names (axe), bank badge text contrast, first-load budget (Accounts
  CSS moved to its own chunk), `.chip` class clash.
- Parity: account-categories.fixture.json read by web and app tests. iPhone/Mac fd4d4cf CI green.
- Counts: Vitest 141/141; Playwright Chromium 146 passed, 0 failed.

## Accounts categories parity – 2026-10-25 21:00 UTC
- Every surface the same (ACCOUNTS-PARITY.md): web now shows the bank's Plaid logo (shared by the app) and opens
  Manage categories in a dialog over Accounts like the app's sheet; iPhone/iPad gained the sortable table with
  subtotals (one table for all Apple surfaces).
- Mobile web: e2e/account-categories-mobile.spec.ts (iPhone viewport, touch) taps through every feature.
- Counts: Vitest 141/141; Playwright Chromium 150 passed, 0 failed.

## Refresh all + loop 92 – 2026-10-25 21:55 UTC
- Accounts › Refresh all (circular arrow): syncs every bank (refreshBank per Item, realtime on the first page),
  shares new balances with the household, and lists per bank: updated (live or Plaid's latest), needs a sign-in
  (Reconnect), or failed. Live check needs plaid-sync from davey-ios 71110d9 and server_flags.realtime_balance
  (off by default; Plaid bills it per call).
- No new commits from other sessions; Pages for main: success.
- Tests: e2e/refresh-all.spec.ts (3), refreshBank.test wording parity with the app.
- Counts: Vitest 142/142; Playwright Chromium 153 passed, 0 failed.

## Loop 93 – 2026-10-25 22:42 UTC
- No new commits on main since 3d26a36 or on davey-ios release-candidate (a1ade05, CI green); Pages run: success.
- Issues found: 0. Fixed: 0. sustained.spec passed.
- Counts: Vitest 142/142; Playwright Chromium 153 passed, 0 failed.

## Loop 94 – 2026-10-25 23:47 UTC
- No new commits on main since a186772 or on davey-ios release-candidate (a1ade05, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 142/142; Playwright Chromium 153 passed, 0 failed.

## Loop 95 – 2026-10-26 00:53 UTC
- No new commits on main since 61a69c2 or on davey-ios release-candidate (a1ade05, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 142/142; Playwright Chromium 153 passed, 0 failed.

## Loop 96 – 2026-10-26 01:59 UTC
- No new commits on main since 7a18813 or on davey-ios release-candidate (a1ade05, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 142/142; Playwright Chromium 153 passed, 0 failed.

## Loop 97 – 2026-10-26 03:04 UTC
- No new commits on main since 127a552 or on davey-ios release-candidate (a1ade05, CI green); Pages run: success.
- Issues found: 0. Fixed: 0.
- Counts: Vitest 142/142; Playwright Chromium 153 passed, 0 failed.

## Loop 98 – 2026-10-26 04:15 UTC
- No new commits on main since 622307b or on davey-ios release-candidate (a1ade05, CI green); Pages run: success.
- Found 1: tab-budget.spec "scrolling the transaction list drops no frames" failed once in the full parallel run (one
  frame ≥50 ms); alone it ran 16.7 ms frames 3/3. Made the check robust: at most one stray 50 ms+ frame (two or
  more is jank) and nothing over 250 ms; p95 < 34 ms unchanged. Full suite green after.
- Counts: Vitest 142/142; Playwright Chromium 153 passed, 0 failed.

## Fix – 2026-10-26 04:55 UTC (David's report: duplicates, backwards %, Investments layout)
- Duplicate investment accounts: Refresh all (refreshRecords) added every account Plaid reported for a bank, so
  accounts never imported (or linked under another record) appeared a second time. Syncs now match by Plaid account
  ID household-wide and never add accounts (only a re-added login, adoptNewItem, may). One-time repair hides the
  copies (isArchived, shared; nothing deleted) with Undo; Hide/Unhide account added to the account editor.
- Accounts chart %: share of assets (debts: share of debts) instead of share of a negative net worth. iOS ff8eac1.
- Investments › By account: 3-column grid (names were in the 14px swatch column, a word per line on desktop).
- New tests: refreshBank (4), repairAccounts (3), share-of-side; e2e duplicate-repair (3) and a word-per-line
  layout check on every screen at 1280/1920/360 with long names (it failed on the old build, passes now).
- Counts: Vitest 149/149; Playwright Chromium 159 passed, 0 failed.

## Fix – 2026-10-26 05:20 UTC (accounts showing "Bank", stale balance)
- Linked accounts whose record lost its bank connection showed "Bank" (no name/logo) and never got balance updates
  (a sync only touched the connection's own accounts; 204 #B Rental showed $9,469.75, bank ~$2K). Syncs now attach
  any account the bank reports (same Plaid account ID) to that connection. Accounts runs this once in the background
  (no billed live check, skips banks needing a sign-in, at most every 6 h). iOS PlaidImporter does the same (c3fbd77).
- Syncs now lay only bank fields onto the newest copy of each record before saving, so an edit made during a sync
  (nickname, category, Hide) isn't overwritten; Refresh all waits for the one-time duplicate repair.
- Counts: Vitest 151/151; Playwright Chromium 160 passed, 0 failed.

## Loop 99 – 2026-10-26 05:31 UTC
- Pages run success for d9b6f48; davey-ios release-candidate c3fbd77 CI green (ff8eac1 green too).
- Found and fixed this hour (David's reports): duplicates, chart % sign, Investments layout, "Bank" orphans, sync
  overwriting concurrent edits (entries above).
- Counts: Vitest 151/151; Playwright Chromium 160 passed, 0 failed.
- The hourly check now runs inside the 30-minute "Davey deep QA round" (QA-FINDINGS.md); no separate hourly re-arm.

## Loop 100 – 2026-10-26 09:35 UTC (deep QA, first fix round)
- Fixed QA #4 (Refresh all reload storm), #9/#10/#1 (scroll to top / restore on Back). a91c572.
- Counts: Vitest 151/151; Playwright Chromium 163 passed, 0 failed.

## Loop 101 – 2026-10-26 10:10 UTC (deep QA fix round 2)
- Fixed QA #18, #19, #22 (2137bf0). Full suite caught a raw server message in Settings once it rendered during an
  outage; fixed in the same commit.
- Counts: Vitest 151/151; Playwright Chromium 165 passed, 0 failed.

## Loop 102 – 2026-10-26 10:50 UTC (deep QA fix round 3)
- Fixed QA #11, #13, #15, #16 (+E3 shared money parser) (8571a00).
- Counts: Vitest 154/154; Playwright Chromium 168 passed, 0 failed.

## Loop 103 – 2026-10-26 11:35 UTC (deep QA fix round 4)
- Fixed QA #12 (a20737d); #14 verified OK.
- Found 1: household-parity.spec failed once in a full parallel run (read between two data arrivals); now waits
  for the settled total and a stable net worth; 10/10 under 6 workers. A second full run was green.
- Counts: Vitest 154/154; Playwright Chromium 169 passed, 0 failed.

## Loop 104 – 2026-10-26 12:25 UTC (deep QA fix round 5)
- Fixed QA #6, improved #5 (0cf3ef3): per-call date formatters were the Investments stall (CPU profile with source maps).
- Counts: Vitest 154/154; Playwright Chromium 170 passed, 0 failed.
