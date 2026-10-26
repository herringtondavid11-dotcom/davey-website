// QA #12: Back closes an open dialog or sheet instead of leaving the screen; closing it normally leaves history as it was.
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

test('Back closes Manage categories and the transaction sheet, and stays on the screen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/budget')
  await page.goto('/app/accounts')
  await expect(page.locator('main h1', { hasText: 'Accounts' })).toBeVisible()
  await page.getByRole('button', { name: /Manage categories/i }).first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/app\/accounts$/)
  // Closed with Done: one Back still goes to the previous screen.
  await page.getByRole('button', { name: /Manage categories/i }).first().click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.goBack()
  await expect(page).toHaveURL(/\/app\/budget$/)

  await page.goto('/app/transactions')
  await page.locator('.txn-row, [data-testid^="txn-"], main li button').first().click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page).toHaveURL(/\/app\/transactions/)
})
