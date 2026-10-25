// Account categories, round 2 (2026-10-25): Bank | Account | Category in their own columns, household-managed
// categories (add, rename, recolour, reorder, remove with reassign), a chart by category that filters the list,
// grouping, sorting, chips, collapsible sections, a sortable table, and each person's choices remembered.
import { expect, test, type Page } from '@playwright/test'
import { mockBackend, pushedPayloads, watchConsole } from './mock'

const SAVINGS = 'acc0ca7e-0000-4000-8000-000000000002'
const OPS_CASH = 'acc0ca7e-0000-4000-8000-000000000003'
const EMERGENCY = 'acc0ca7e-0000-4000-8000-000000000004'

type State = Awaited<ReturnType<typeof mockBackend>>
const categoryPushes = (state: State) =>
  state.pushes.flatMap((p) => p.p_records as { entity: string; id: string; payload: Record<string, unknown> }[]).filter((r) => r.entity === 'accountCategory')

const row = (page: Page, name: string) => page.locator('.goal-row').filter({ has: page.locator('.acct-name', { hasText: name }) })

test('every row shows Bank, Account and Category separately, bank on the left; automatic categories come from the type', async ({ page }) => {
  const problems = watchConsole(page)
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  const saving = row(page, 'Plaid Saving')
  await expect(saving.locator('.acct-bank-name')).toHaveText('Chase')
  await expect(saving.locator('.acct-name')).toHaveText(/^Plaid Saving\s*••1111$/)
  await expect(saving.getByLabel('Category for Plaid Saving')).toHaveValue('')
  await expect(saving.getByLabel('Category for Plaid Saving').locator('option:checked')).toHaveText('Savings (auto)')
  // Order in the row: bank, then account, then category.
  const xs = await saving.evaluate((el) => ['.acct-bank', '.acct-name', '.acct-cat'].map((s) => el.querySelector(s)!.getBoundingClientRect().left))
  expect(xs[0]).toBeLessThan(xs[1])
  expect(xs[1]).toBeLessThan(xs[2])
  // The mortgage and the car loan are filed by type, the rental home under Real Estate/Rental.
  await expect(page.getByRole('region', { name: 'Mortgage', exact: true })).toContainText('Home Mortgage')
  await expect(page.getByRole('region', { name: 'Loans', exact: true })).toContainText('Car')
  await expect(page.getByRole('region', { name: 'Real Estate/Rental', exact: true })).toContainText('Home')
  expect(problems).toEqual([])
})

test('pick a category inline, or make a new one from the picker; shared as accountCategoryID', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByLabel('Category for Plaid Saving').selectOption({ label: 'Emergency Fund' })
  await expect(page.getByRole('region', { name: 'Emergency Fund', exact: true })).toContainText('Plaid Saving')
  expect(pushedPayloads(state, 'account', (id) => id === 'acc-2').at(-1)).toMatchObject({ accountCategoryID: EMERGENCY, rollupCategory: null, name: 'Plaid Saving' })

  await page.getByLabel('Category for Joint checking').selectOption({ label: 'New category…' })
  await page.getByLabel('New category for Joint checking').fill('House Fund')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByRole('region', { name: 'House Fund', exact: true })).toContainText('Joint checking')
  const made = categoryPushes(state).find((r) => r.payload.name === 'House Fund')!
  expect(made.payload).toMatchObject({ removed: false, sortOrder: 160 })
  expect(pushedPayloads(state, 'account', (id) => id === 'acc-1').at(-1)!.accountCategoryID).toBe(made.id)

  // Back to automatic.
  await page.getByLabel('Category for Plaid Saving').selectOption({ label: 'Savings (auto)' })
  await expect(page.getByRole('region', { name: 'Savings', exact: true })).toContainText('Plaid Saving')
  expect(pushedPayloads(state, 'account', (id) => id === 'acc-2').at(-1)!.accountCategoryID).toBeNull()
})

test('Settings: add, rename, recolour, reorder and remove with reassign (built-ins keep their fixed IDs)', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true, accountFields: { 'acc-2': { account_category_id: EMERGENCY } } })
  await page.goto('/app/settings#account-categories')
  const manager = page.getByRole('region', { name: 'Account categories' })
  await expect(manager.getByLabel('Name of Checking')).toBeVisible()

  await manager.getByLabel('New category name').fill('Kids 529')
  await manager.getByRole('button', { name: 'Add category' }).click()
  await expect(manager.getByLabel('Name of Kids 529')).toBeVisible()

  const ops = manager.getByLabel('Name of Ops Cash')
  await ops.fill('Operating Cash')
  await ops.press('Enter')
  await expect(manager.getByLabel('Name of Operating Cash')).toBeVisible()
  expect(categoryPushes(state).find((r) => r.id === OPS_CASH)!.payload).toMatchObject({ name: 'Operating Cash', removed: false })

  await manager.getByLabel('Colour for Operating Cash').selectOption('gold')
  await expect.poll(() => categoryPushes(state).filter((r) => r.id === OPS_CASH).at(-1)!.payload.colorName).toBe('gold')

  await manager.getByRole('button', { name: 'Move Savings up' }).click()
  await expect(manager.locator('.cat-item input.grow').nth(0)).toHaveValue('Savings')

  // Emergency Fund holds Plaid Saving: removing it asks where that account goes.
  await manager.locator('.cat-item').filter({ has: page.getByLabel('Name of Emergency Fund') }).getByRole('button', { name: 'Remove' }).click()
  await expect(manager.getByText('Move its 1 account to:')).toBeVisible()
  await manager.getByLabel('Move its accounts to').selectOption({ label: 'Operating Cash' })
  await manager.getByRole('button', { name: 'Remove Emergency Fund' }).click()
  await expect(manager.getByLabel('Name of Emergency Fund')).toHaveCount(0)
  expect(categoryPushes(state).filter((r) => r.id === EMERGENCY).at(-1)!.payload.removed).toBe(true)
  expect(pushedPayloads(state, 'account', (id) => id === 'acc-2').at(-1)).toMatchObject({ accountCategoryID: OPS_CASH, name: 'Plaid Saving' })

  await page.goto('/app/accounts')
  await expect(page.getByRole('region', { name: 'Operating Cash', exact: true })).toContainText('Plaid Saving')
  expect(problems).toEqual([])
})

test('household parity: a category renamed on another device shows here, and accounts follow it by ID', async ({ page }) => {
  await mockBackend(page, {
    signedIn: true,
    accountCategories: [{ id: SAVINGS, payload: { name: 'Reserve', colorName: 'teal', sortOrder: 10, removed: false } }],
    accountFields: { 'acc-6': { account_category_id: SAVINGS } },
  })
  await page.goto('/app/accounts')
  const reserve = page.getByRole('region', { name: 'Reserve', exact: true })
  await expect(reserve).toContainText('Plaid Saving') // automatic: savings → the built-in, now called Reserve
  await expect(reserve).toContainText('Studio') // picked by ID
  await expect(page.getByRole('region', { name: 'Savings', exact: true })).toHaveCount(0)
})

test('chart: donut or bar, totals per category; choosing one filters the list; chips, bank grouping, sort, search, collapse; remembered', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  const legend = page.getByRole('list', { name: 'Categories' })
  const savingsRow = legend.getByRole('button', { name: /^Savings \$/ })
  await expect(savingsRow).toContainText('$25,000.00')
  await expect(savingsRow).toHaveAccessibleName(/^Savings \$25,000\.00 \d+% of net worth, 1 account, — funded$/)

  await page.getByTestId('slice-Savings').click({ force: true })
  await expect(page.locator('.goal-row')).toHaveCount(1)
  await expect(page.locator('.goal-row')).toContainText('Plaid Saving')
  await page.getByRole('group', { name: 'Filter accounts' }).getByRole('button', { name: 'Clear filters' }).click()

  await page.getByRole('group', { name: 'Chart' }).getByRole('button', { name: 'Bar' }).click()
  await page.getByTestId('bar-Investments').click()
  await expect(page.locator('.goal-row')).toHaveCount(1)
  await page.getByTestId('bar-Investments').click()

  // Bank chip + group by bank.
  await page.getByRole('group', { name: 'Filter accounts' }).getByRole('button', { name: 'Chase', exact: true }).click()
  await page.getByLabel('Group by').selectOption('bank')
  await expect(page.locator('main section[aria-label]').filter({ has: page.locator('.goal-row') })).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Chase', exact: true }).locator('.goal-row')).toHaveCount(3)

  // Sort by name, collapse the section, then reload: everything is remembered.
  await page.getByLabel('Sort by').selectOption('name')
  await expect(page.locator('.goal-row .acct-name .row-title')).toHaveText(['Joint checking', 'Plaid Saving', 'Travel card'])
  await page.locator('.group-toggle', { hasText: 'Chase' }).click()
  await expect(page.locator('.goal-row')).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('Group by')).toHaveValue('bank')
  await expect(page.getByLabel('Sort by')).toHaveValue('name')
  await expect(page.getByRole('group', { name: 'Chart' }).getByRole('button', { name: 'Bar' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.group-toggle', { hasText: 'Chase' })).toHaveAttribute('aria-expanded', 'false')
  await page.locator('.group-toggle', { hasText: 'Chase' }).click()

  // Search covers last 4 and category names.
  await page.getByRole('group', { name: 'Filter accounts' }).getByRole('button', { name: 'Chase', exact: true }).click()
  await page.getByLabel('Search accounts').fill('3333')
  await expect(page.locator('.goal-row')).toHaveCount(1)
  await page.getByLabel('Search accounts').fill('mortgage')
  await expect(page.locator('.goal-row .row-title')).toHaveText(['Home Mortgage'])
})

test('table: sortable Bank | Account | Category | Balance | Goal | % Funded | Updated with an inline picker', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Table' }).click()
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['Bank', 'Account', 'Category', 'Balance ↓', 'Goal', '% Funded', 'Updated'])
  await table.getByRole('button', { name: 'Bank' }).click()
  await expect(table.getByRole('columnheader', { name: /Bank/ })).toHaveAttribute('aria-sort', 'descending')
  await table.getByRole('button', { name: /Bank/ }).click()
  await expect(table.getByRole('columnheader', { name: /Bank/ })).toHaveAttribute('aria-sort', 'ascending')
  // Bank and account are separate cells.
  const studio = table.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /Studio/ }) })
  await expect(studio.getByRole('cell').first().locator('.acct-bank-name')).toHaveText('Wells Fargo')
  await studio.getByLabel('Category for Studio').selectOption({ label: 'Business' })
  await expect.poll(() => pushedPayloads(state, 'account', (id) => id === 'acc-6').at(-1)?.accountCategoryID).toBe('acc0ca7e-0000-4000-8000-000000000012')
  await expect(table.getByRole('rowheader', { name: /^Business/ })).toBeVisible()
})

for (const theme of ['light', 'dark'] as const) {
  test(`${theme}: Accounts and Settings fit 360–1920 px without sideways scrolling`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('davey.theme', t), theme)
    await mockBackend(page, { signedIn: true })
    for (const width of [360, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 })
      for (const path of ['/app/accounts', '/app/settings']) {
        await page.goto(path)
        await expect(page.locator('main h1')).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow, `${path} at ${width}px`).toBeLessThanOrEqual(0)
      }
      await page.goto('/app/accounts')
      await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Table' }).click()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `table at ${width}px`).toBeLessThanOrEqual(0)
      await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'List' }).click()
    }
  })
}
