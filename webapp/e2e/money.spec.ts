import { expect, test } from '@playwright/test'
import { mockBackend, pushedPayloads, watchConsole } from './mock'

test('budget: income vs spent, budgets vs actual, edit a budget', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/budget')
  await expect(page.getByRole('heading', { name: 'Budgets vs actual' })).toBeVisible()
  // Travel (Delta $412.30) is over its $300 budget and sorts first.
  const first = page.locator('.budget-line').first()
  await expect(first).toContainText('Travel')
  await expect(first).toContainText('$112.30 over')
  await first.getByRole('button', { name: 'Edit' }).click()
  await first.getByLabel('Monthly budget for Travel').fill('500')
  await first.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.budget-line').filter({ hasText: 'Travel' })).toContainText('$87.70 left')
  expect(pushedPayloads(state, 'budget', (id) => id === 'b4')[0]).toMatchObject({ limit: 50000, categoryID: 'cat-travel' })
  // Business filter narrows to business spending.
  await page.getByRole('button', { name: 'Business', exact: true }).click()
  await expect(page.locator('.budget-line').filter({ hasText: 'Dining' })).toContainText('$0.00')
  expect(problems).toEqual([])
})

test('budget without a household explains and still shows spending', async ({ page }) => {
  await mockBackend(page, { signedIn: true, noHousehold: true })
  await page.goto('/app/budget')
  await expect(page.getByText('Budgets you set in the Davey app will appear here')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set budget' })).toHaveCount(0)
})

test('budget: set a new budget for this month (shared like the app, in All Accounts)', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/budget')
  const line = page.locator('.budget-line, .unbudgeted, li').filter({ hasText: 'Home' }).filter({ has: page.getByRole('button', { name: 'Set budget' }) }).first()
  await line.getByRole('button', { name: 'Set budget' }).click()
  await page.getByLabel(/Monthly budget for Home/).fill('250')
  await page.getByRole('button', { name: 'Save' }).first().click()
  await expect.poll(() => pushedPayloads(state, 'budget', () => true).find((p) => p.categoryID === 'cat-home')).toMatchObject({ limit: 25000, lensID: 'c1ec84cb-2a5b-465a-88dc-943539790645' })
})

test('cash flow: chart with tooltip and month table', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/cash-flow')
  await expect(page.getByRole('img', { name: /Income and spending, last 6 months/ })).toBeVisible()
  const rows = page.locator('.data-table tbody tr')
  await expect(rows).toHaveCount(6)
  await expect(rows.nth(1)).toContainText('$7,700')
  await page.locator('.chart .hit').nth(4).hover()
  await expect(page.locator('.tooltip')).toContainText('Income')
  await page.getByRole('button', { name: '12 months' }).click()
  await expect(rows).toHaveCount(12)
})

test('recurring: subscriptions, bills, income and a calendar', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/recurring')
  const list = page.locator('section').filter({ has: page.getByRole('group', { name: 'Type' }) })
  await expect(list.getByText('Netflix')).toBeVisible()
  await expect(list.getByText('Spotify')).toBeVisible()
  await page.getByRole('button', { name: 'Bills' }).click()
  await expect(list.getByText('Greystar Rent')).toBeVisible()
  // A rule entered in the app shows too (household_records entity "recurring"); a paused one doesn't.
  await expect(list.getByText('Summit Home Insurance')).toBeVisible()
  await expect(page.getByText('Paused Gym')).toHaveCount(0)
  await page.getByRole('button', { name: 'Income', exact: true }).click()
  await expect(list.getByText('Payroll – Acme Corp')).toBeVisible()
  // Next month's calendar shows the projected Netflix charge on the 9th.
  await page.getByRole('button', { name: 'Next month' }).isDisabled()
  const cell = page.getByRole('gridcell', { name: /Netflix/ }).first()
  await cell.click()
  await expect(page.locator('.day-detail')).toContainText('Netflix')
})

for (const [scheme, spend, over] of [['light', 'rgb(50, 109, 162)', 'rgb(180, 90, 67)'], ['dark', 'rgb(86, 145, 201)', 'rgb(217, 128, 106)']] as const) {
  test(`charts use the app's colors: spending slate, overspend terracotta (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await mockBackend(page, { signedIn: true })
    await page.goto('/app/cash-flow')
    await expect(page.locator('.s-spend').first()).toHaveCSS('background-color', spend)
    await page.goto('/app/budget')
    await expect(page.locator('.meter.over > span').first()).toHaveCSS('background-color', over)
  })
}
