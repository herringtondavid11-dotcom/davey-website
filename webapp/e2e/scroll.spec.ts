// QA #9/#10 (2026-10-26): a new screen starts at the top (Budget used to open 685 px down on a phone), and Back
// returns to where you were (it went to the top).
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

for (const size of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 700 }]) {
  test(`new screens open at the top; Back restores the position (${size.name})`, async ({ page }) => {
    await page.setViewportSize(size)
    await mockBackend(page, { signedIn: true, bulkTransactions: 300 })
    await page.goto('/app/')
    await expect(page.locator('main h1').first()).toBeVisible()
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    const link = page.locator('main a[href="/app/budget"], main a[href="/app/transactions"]').last()
    await link.click()
    await expect(page.locator('main h1').first()).toBeVisible()
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)

    await page.goto('/app/transactions')
    await expect(page.locator('main h1').first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => scrollTo(0, 900))
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(900)
    await page.getByRole('link', { name: 'Accounts', exact: true }).first().click()
    await expect(page.locator('main h1', { hasText: 'Accounts' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(0)
    await page.goBack()
    await expect(page.locator('main h1', { hasText: 'Transactions' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => Math.round(scrollY))).toBe(900)
  })
}
