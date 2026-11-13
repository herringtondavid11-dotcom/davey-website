import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('income: frequency, short-term, and planned stay in the saved list', async ({ page }) => {
  const problems = watchConsole(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/income')
  await page.getByRole('button', { name: 'Add income' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Name').fill('Consulting')
  await dialog.getByLabel('Pay frequency').selectOption({ label: 'Every two weeks (26 a year)' })
  await dialog.getByLabel('Amount each time').fill('2000')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Income summary' })).toContainText('$52,000.00')
  await expect(page.getByRole('img', { name: /By type/ })).toHaveAttribute('aria-label', /W-2/)
  await expect(page.getByRole('figure', { name: 'Each month' })).toBeVisible()
  await expect(page.getByRole('figure', { name: 'Full year' })).toBeVisible()

  await page.getByRole('table', { name: 'All income' }).getByRole('row', { name: /Consulting/ }).click()
  await page.getByRole('dialog').getByLabel('Term').selectOption({ label: 'One-time' })
  await page.getByRole('dialog').getByLabel('Starts', { exact: true }).fill('2026-06')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('table', { name: 'Income forecast' }).getByRole('row', { name: /June/ })).toContainText('$2,000')
  await expect(page.getByRole('table', { name: 'Income forecast' }).getByRole('row', { name: /January/ })).toContainText('$0')

  await page.getByRole('button', { name: 'Add planned' }).click()
  await page.getByRole('dialog').getByLabel('Name').fill('Bonus')
  await page.getByRole('dialog').getByLabel('Per month').fill('500')
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('table', { name: 'All income' }).getByRole('row', { name: /Bonus/ })).toContainText('Planned')
  expect(problems).toEqual([])
})
