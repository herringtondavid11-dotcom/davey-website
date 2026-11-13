import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

async function addIncome(page: import('@playwright/test').Page, name: string, perMonth: string) {
  await page.getByRole('button', { name: 'Add income' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill(name)
  await dialog.getByLabel('Per month').fill(perMonth)
  const saved = page.waitForResponse((r) => r.url().includes('/rest/v1/income_sources') && r.request().method() === 'POST')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await saved
  await expect(dialog).toHaveCount(0)
}

test('income: save, edit, cancel, and delete from the sorted list', async ({ page }) => {
  const problems = watchConsole(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/income')
  await expect(page.getByText('No income sources yet.')).toBeVisible()

  await page.getByRole('button', { name: 'Add income' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Person')).toHaveValue('user-1')
  await dialog.getByLabel('Name').fill('Rent')
  await dialog.getByLabel('Per month').fill('9000')
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('No income sources yet.')).toBeVisible()

  await addIncome(page, 'Acme salary', '8000')
  const table = page.getByRole('table', { name: 'All income' })
  await expect(table.getByRole('row', { name: /Acme salary/ })).toContainText('W-2')
  await expect(table.getByRole('row', { name: /Acme salary/ })).toContainText('$8,000.00')
  await expect(table.getByRole('row', { name: /Acme salary/ })).toContainText('$96,000.00')
  await expect(page.getByRole('region', { name: 'Income summary' })).toContainText('$96,000.00')
  await expect(page.getByRole('table', { name: 'Income forecast' }).getByRole('row', { name: /January/ })).toContainText('$8,000')

  await addIncome(page, 'Side stipend', '2000')
  const rows = table.getByRole('row')
  await expect(rows.nth(1)).toContainText('Acme salary')
  await expect(rows.nth(2)).toContainText('Side stipend')
  await page.setViewportSize({ width: 1440, height: 1700 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: '/tmp/income-save-desktop.png' })
  await page.setViewportSize({ width: 1280, height: 900 })

  await table.getByRole('row', { name: /Acme salary/ }).click()
  const edit = page.getByRole('dialog')
  await edit.getByLabel('Per month').fill('1000')
  await edit.getByLabel('Person').selectOption({ label: 'Other' })
  await edit.getByLabel('Other name').fill('Aunt May')
  const patched = page.waitForResponse((r) => r.url().includes('/rest/v1/income_sources') && r.request().method() === 'PATCH')
  await edit.getByRole('button', { name: 'Save' }).click()
  await patched
  await expect(rows.nth(1)).toContainText('Side stipend')
  await expect(table.getByRole('row', { name: /Acme salary/ })).toContainText('Aunt May')

  await page.locator('.sidebar').getByRole('link', { name: 'Overview', exact: true }).click()
  await page.locator('.sidebar').getByRole('link', { name: 'Income', exact: true }).click()
  await expect(page.getByRole('table', { name: 'All income' }).getByRole('row', { name: /Aunt May/ })).toBeVisible()

  await page.getByRole('table', { name: 'All income' }).getByRole('row', { name: /Acme salary/ }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click()
  const removed = page.waitForResponse((r) => r.url().includes('/rest/v1/income_sources') && r.request().method() === 'DELETE')
  await page.getByRole('dialog').getByRole('button', { name: 'Confirm delete' }).click()
  await removed
  await expect(page.getByRole('row', { name: /Acme salary/ })).toHaveCount(0)
  expect(problems).toEqual([])
})

test('income on a phone: list, save, and edit', async ({ page }) => {
  const problems = watchConsole(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/income')
  await expect(page.locator('.tabbar').getByRole('link', { name: 'Income' })).toHaveCount(0)
  await expect(page.getByRole('img', { name: /By type/ })).toBeVisible()

  await page.getByRole('button', { name: 'Add income' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Person')).toHaveValue('user-1')
  await dialog.getByLabel('Name').fill('Allie bonus')
  await dialog.getByLabel('Category').selectOption({ label: 'W-2' })
  await dialog.getByLabel('Per month').fill('1500')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const line = page.locator('.income-line', { hasText: 'Allie bonus' })
  await expect(line).toBeVisible()
  await expect(line).toContainText('$1,500.00')
  await line.evaluate((el) => el.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: '/tmp/income-save-phone.png' })

  await line.click()
  await page.getByRole('dialog').getByLabel('Status').selectOption('Planned')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('.income-line', { hasText: 'Allie bonus' })).toContainText('Planned')
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  expect(wide).toBe(true)
  expect(problems).toEqual([])
})
