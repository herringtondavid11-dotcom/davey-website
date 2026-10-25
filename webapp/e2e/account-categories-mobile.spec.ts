// Mobile web (iPhone Safari/Chrome size, touch): every Accounts categories feature works by tapping, the same as on
// desktop and in the app. Chromium with iPhone viewport, touch and mobile emulation (WebKit isn't installed here).
import { expect, test } from '@playwright/test'
import { CHASE_LOGO, mockBackend, pushedPayloads } from './mock'

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

const EMERGENCY = 'acc0ca7e-0000-4000-8000-000000000004'

test('phone: columns, logo, chart tap filter, chips, group, sort, collapse, search', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  const saving = page.locator('.goal-row').filter({ has: page.locator('.acct-name', { hasText: 'Plaid Saving' }) })
  // Bank first (with Plaid's logo), then the account, then the category; never merged.
  await expect(saving.locator('.acct-bank-name')).toHaveText('Chase')
  await expect(saving.locator('img.bank-logo')).toHaveAttribute('src', `data:image/png;base64,${CHASE_LOGO}`)
  await expect(saving.locator('.acct-name .row-title')).toHaveText('Plaid Saving')
  const box = async (sel: string) => (await saving.locator(sel).boundingBox())!
  expect((await box('.acct-bank')).y).toBeLessThan((await box('.acct-name')).y)
  expect((await box('.acct-name')).y).toBeLessThan((await box('.acct-cat')).y)

  await page.getByTestId('slice-Savings').tap()
  await expect(page.locator('.goal-row')).toHaveCount(1)
  await page.getByRole('group', { name: 'Filter accounts' }).getByRole('button', { name: 'Clear filters' }).tap()
  await page.getByRole('group', { name: 'Chart' }).getByRole('button', { name: 'Bar' }).tap()
  await page.getByTestId('bar-Investments').tap()
  await expect(page.locator('.goal-row')).toHaveCount(1)
  await page.getByTestId('bar-Investments').tap()

  await page.getByRole('group', { name: 'Filter accounts' }).getByRole('button', { name: 'Fidelity', exact: true }).tap()
  await expect(page.locator('.goal-row .row-title')).toHaveText(['Brokerage'])
  await page.getByRole('group', { name: 'Filter accounts' }).getByRole('button', { name: 'Fidelity', exact: true }).tap()

  await page.getByLabel('Group by').selectOption('bank')
  await page.getByLabel('Sort by').selectOption('updated')
  await page.locator('.group-toggle', { hasText: 'Chase' }).tap()
  await expect(page.locator('.group-toggle', { hasText: 'Chase' })).toHaveAttribute('aria-expanded', 'false')
  await page.getByLabel('Search accounts').fill('1111')
  await expect(page.locator('.goal-row')).toHaveCount(0) // Chase is collapsed
  await page.locator('.group-toggle', { hasText: 'Chase' }).tap()
  await expect(page.locator('.goal-row .row-title')).toHaveText(['Plaid Saving'])
})

test('phone: inline picker, new category, table scrolls inside its card with sortable headers', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByLabel('Category for Plaid Saving').selectOption({ label: 'Emergency Fund' })
  await expect(page.getByRole('region', { name: 'Emergency Fund', exact: true })).toContainText('Plaid Saving')
  expect(pushedPayloads(state, 'account', (id) => id === 'acc-2').at(-1)!.accountCategoryID).toBe(EMERGENCY)
  await page.getByLabel('Category for Car').selectOption({ label: 'New category…' })
  await page.getByLabel('New category for Car').fill('Vehicles')
  await page.getByRole('button', { name: 'Add', exact: true }).tap()
  await expect(page.getByRole('region', { name: 'Vehicles', exact: true })).toContainText('Car')

  await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Table' }).tap()
  const scroller = page.locator('.table-scroll')
  const widths = await scroller.evaluate((el) => [el.scrollWidth, el.clientWidth])
  expect(widths[0]).toBeGreaterThan(widths[1]) // the table scrolls sideways inside its card
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
  await page.getByRole('table').getByRole('button', { name: 'Updated' }).tap()
  await expect(page.getByRole('table').getByRole('columnheader', { name: /Updated/ })).toHaveAttribute('aria-sort', 'descending')
})

test('phone: Settings › Account categories — add, rename, colour, reorder, remove with reassign', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, accountFields: { 'acc-2': { account_category_id: EMERGENCY } } })
  await page.goto('/app/more')
  await page.getByRole('link', { name: 'Settings' }).tap()
  const manager = page.getByRole('region', { name: 'Account categories' })
  await manager.getByLabel('New category name').fill('Kids 529')
  await manager.getByRole('button', { name: 'Add category' }).tap()
  await expect(manager.getByLabel('Name of Kids 529')).toBeVisible()
  await manager.getByLabel('Name of Giving').fill('Tithe')
  await manager.getByLabel('Name of Giving').press('Enter')
  await expect(manager.getByLabel('Name of Tithe')).toBeVisible()
  await manager.getByLabel('Colour for Tithe').selectOption('gold')
  await manager.getByRole('button', { name: 'Move Tithe up' }).tap()
  await manager.locator('.cat-item').filter({ has: page.getByLabel('Name of Emergency Fund') }).getByRole('button', { name: 'Remove' }).tap()
  await manager.getByLabel('Move its accounts to').selectOption({ label: 'Savings' })
  await manager.getByRole('button', { name: 'Remove Emergency Fund' }).tap()
  await expect(manager.getByLabel('Name of Emergency Fund')).toHaveCount(0)
  expect(pushedPayloads(state, 'account', (id) => id === 'acc-2').at(-1)!.accountCategoryID).toBe('acc0ca7e-0000-4000-8000-000000000002')
})
