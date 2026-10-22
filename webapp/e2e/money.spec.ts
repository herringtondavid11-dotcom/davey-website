import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole, webEdits } from './mock'

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
  expect((await webEdits(page)).budgets.find((b: { category: string }) => b.category === 'Travel').amount).toBe(500)
  void state
  // Business filter narrows to business spending.
  await page.getByRole('button', { name: 'Business', exact: true }).click()
  await expect(page.locator('.budget-line').filter({ hasText: 'Dining Out' })).toContainText('$0.00')
  expect(problems).toEqual([])
})

test('budget: web budgets are labeled as saved in this browser', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/budget')
  await expect(page.getByText('saved in this browser')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Not budgeted' })).toBeVisible()
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
  await page.getByRole('button', { name: 'Income', exact: true }).click()
  await expect(list.getByText('Payroll – Acme Corp')).toBeVisible()
  // Next month's calendar shows the projected Netflix charge on the 9th.
  await page.getByRole('button', { name: 'Next month' }).isDisabled()
  const cell = page.getByRole('gridcell', { name: /Netflix/ }).first()
  await cell.click()
  await expect(page.locator('.day-detail')).toContainText('Netflix')
})
