# Davey web quality assessment — 2026-10-23

Live app: https://daveypersonalfinance.com/app/ (bundle `index-BlGuWywR.js` at the start of this pass).
Reviewed in headed and headless Desktop Chrome, Desktop Safari (WebKit), Pixel 5 (Chrome), and iPhone 14 (WebKit), against the same shell GitHub Pages serves. Signed-in screens used the local test double, because production has no QA account and the company access code is not in this repo. Plaid’s click-to-open gesture was not changed. No paywall. No server or secret changes.

## What was measured

- Every signed-in section in those four browser profiles: Overview, Transactions, Budget, Cash flow, Recurring, Credit cards, Mortgages & loans, Investments, Accounts, Household, Settings, Exports, Tax, Connect, Connection help, and More.
- axe-core WCAG 2.1 A/AA on each of those screens (light). No serious, critical, or moderate violations.
- Horizontal overflow on those screens. None.
- Progress meters, goal bars, and the investment allocation bar: the widths on screen match the percentages in the markup in Chrome and WebKit. The strict `style-src 'self'` policy does not strip them.
- Lighthouse 12 on the production access page (mobile, headless Chrome): performance 96, accessibility 100, best practices 100, SEO 66. First contentful paint 2.0 s, largest contentful paint 2.3 s, total blocking time 70 ms, cumulative layout shift 0, speed index 2.0 s.
- Layout math at 390, 1280, 1440, and 1920.

## Ranked findings

1. **Wide monitors did not get a wide layout. Shipped.** The content column stopped at 1240px. At 1920px the area beside the sidebar is about 1560px, so roughly 320px sat empty. At the same time the overview switched to three columns at a 1400px *viewport*, while the sidebar still occupied 248px, so the side cards were only about 350px wide. Laptop-sized desktops got a cramped overview; large desktops got empty margin.
2. **Section links were too small to tap. Shipped.** “Details”, “Budget”, “Open”, “Open Accounts”, and “See all” measured 22–23px tall on phones and desktops. That is under the 24px WCAG 2.2 minimum and well under a comfortable phone target.
3. **“Tap a transaction” on a desktop. Shipped.** The transactions subtitle used phone wording on every window.
4. **Phone and desktop navigation already match the apps.** Tabs are Overview, Budget, Accounts, Investments, and Ask, in that order. Ask is a tab on phones (the floating button is hidden). Desktop keeps the sidebar groups plus the Ask AI button. More holds Transactions, Cash flow, Recurring, Credit cards, Mortgages & loans, Household, Profile, Exports, Connection help, and Settings. No change.
5. **Charts and figures are readable and labeled.** Overview leads with net worth, the range, assets, and debts, then this week, cash flow, category changes, the monthly budget, goals, and the latest transactions. Cash flow leads with average income, spending, and savings rate, then the chart, then the month table. Credit cards lead with balance, limit, and utilization. Investments lead with value, gain, and today’s change, then the chart and allocation. Meters expose the same percentage as text. No change.
6. **Accessibility of the current screens is in good shape.** axe found nothing at serious, critical, or moderate on the pass above. The repo’s light and dark axe suite remains the regression check. WebKit logs a Content-Security-Policy refusal for a stylesheet hash; the same screens still paint, and the measured bar widths still match. No change.
7. **Performance of the public shell is already strong.** Lighthouse 96 / 100 / 100 on the access page, with no layout shift. SEO scores 66 because `robots` is `noindex`. That is intentional for a signed-in finance app. Lighthouse also flags unused JavaScript in the shell and GitHub Pages’ cache lifetime. The shell is already code-split (signed-in screens are separate files; the first gzipped download stays under 170 kB). Not worth a riskier split for the unused-JS warning.
8. **Production Chase connect still cannot be finished here.** There is no test Davey login. That is an account limitation, not a layout bug. The link-token request from this client sends `mode: "account"` and `redirect_uri: https://daveypersonalfinance.com/app/oauth`.

## What shipped

- At 1680px and wider, the page uses up to 1560px beside the sidebar.
- The three-column overview, with net worth spanning two columns, starts at 1680px. From 1000px to 1679px the net worth chart stays on its own row and the other cards sit in two columns.
- Links in a card header are at least 44px tall.
- The transactions subtitle says “Choose a transaction…”.
- Playwright coverage in `webapp/e2e/quality.spec.ts` for the wide column, the laptop net-worth row, the 44px links, and the transactions wording.

Nothing in this list needs a server change.
