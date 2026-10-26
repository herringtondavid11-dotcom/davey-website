# Accounts categories: parity on every surface (2026-10-25)

Davey ships the same Accounts features on iPhone, iPad, Mac, desktop web and mobile web.

- **iPad** runs the iPhone app: the target's device families are iPhone and Mac (`1,6`), so iPad shows the same
  screens.
- **iPhone, iPad and Mac** share one SwiftUI code base (davey-ios release-candidate).
- **Desktop and mobile web** are one responsive app (daveypersonalfinance.com/app).

✅ means the feature is built and covered by tests on that surface. How each surface was checked is listed under the
table.

| # | Feature | iPhone | iPad | Mac | Desktop web | Mobile web |
|---|---|---|---|---|---|---|
| 1 | Bank, Account and Category are separate columns, bank on the left, never merged into one string | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | Bank logo (Plaid), or initials on the brand colour | ✅ | ✅ | ✅ | ✅ (logo shared on the bank record) | ✅ |
| 3 | 16 built-in categories (defaults plus David's sheet), with the same fixed IDs everywhere | ✅ | ✅ | ✅ | ✅ | ✅ |
| 4 | Add a category: in Settings, and inline with "New category…" | ✅ | ✅ | ✅ | ✅ | ✅ |
| 5 | Rename | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | Remove, with a prompt for where its accounts go (or Automatic) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 7 | Reorder (drag on Apple devices, up/down arrows on the web) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 8 | Pick a colour | ✅ | ✅ | ✅ | ✅ | ✅ |
| 9 | Manage categories from any account, over the current screen (sheet or dialog) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 10 | One category per account; automatic suggestion from the Plaid type/subtype, always overridable | ✅ | ✅ | ✅ | ✅ | ✅ |
| 11 | Categories and assignments sync through household data (Allie sees the same) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 12 | Chart at the top: donut or stacked bar | ✅ | ✅ | ✅ | ✅ | ✅ |
| 13 | Each category's total, share of assets (debts: share of debts; never flips sign), account count and goal % funded | ✅ | ✅ | ✅ | ✅ | ✅ |
| 14 | Tapping a slice, bar segment or legend row filters the list | ✅ | ✅ | ✅ | ✅ | ✅ |
| 15 | Group by Category (default), Bank or None | ✅ | ✅ | ✅ | ✅ | ✅ |
| 16 | Sort by Balance, Name, Bank, % Funded or Recently updated | ✅ | ✅ | ✅ | ✅ | ✅ |
| 17 | Filter chips by category and by bank, plus Clear | ✅ | ✅ | ✅ | ✅ | ✅ |
| 18 | Collapsible sections with subtotals (total and % funded) | ✅ | ✅ | ✅ | ✅ | ✅ |
| 19 | Search covers bank, name, last 4 and category | ✅ | ✅ | ✅ | ✅ | ✅ |
| 20 | Table: Bank, Account, Category, Balance, Goal, % Funded and Updated, with sortable headers and a subtotal row per section | ✅ | ✅ | ✅ | ✅ | ✅ (scrolls sideways inside its card) |
| 21 | Category picker inside each table row | ✅ | ✅ | ✅ | ✅ | ✅ |
| 22 | Choices remembered: layout, chart, group, sort and direction, filters, collapsed sections | ✅ (per device) | ✅ (per device) | ✅ (per device) | ✅ (per person, per browser) | ✅ (per person, per browser) |
| 23 | Light and dark mode | ✅ | ✅ | ✅ | ✅ | ✅ |
| 24 | Sizes | ✅ all iPhone widths (adaptive row layout) | ✅ (iPhone layout) | ✅ resizable window | ✅ 768–1920 px | ✅ 360–430 px |
| 25 | Refresh all (circular arrow): sync every bank now, results per bank, Reconnect for sign-in problems, live balance when switched on | ✅ | ✅ | ✅ | ✅ | ✅ |

## How each surface was checked

- **iPhone, iPad, Mac**
  - Unit tests run in CI on every push, on both an iPhone simulator and Mac Catalyst:
    - AccountCategoriesTests reads the same fixture as the web tests.
    - The household round trip for categories, assignments and bank logos.
  - The UI tests (AccountsTabUITests, MacDesktopUITests) were updated for the new controls. They run on David's Mac
    (see MAC-REBUILD-NEXT.md).
  - iPad has no separate build. It is the iPhone app, so its features match the iPhone's.
- **Desktop web**
  - Playwright on Chromium at 768, 1280 and 1920 px, light and dark: e2e/account-categories.spec.ts.
  - Also covered: the axe accessibility checks and the bundle-size budget.
- **Mobile web**
  - Playwright on Chromium with iPhone emulation (390×844, touch, mobile): e2e/account-categories-mobile.spec.ts.
  - The 360 px light/dark sweep in account-categories.spec.ts also covers phone widths.
  - Safari's engine (WebKit) isn't installed in the test environment. David checks once on his iPhone in Safari and
    Chrome (the checklist in MAC-REBUILD-NEXT.md).
