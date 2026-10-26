// QA #6 (2026-10-26): opening Investments stalled 150-250 ms because every chart label built a new date formatter
// (toLocaleDateString with options). Counting formatters is deterministic, unlike timing on a busy test machine.
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

test('screens reuse date formatters instead of building one per row or point', async ({ page }) => {
  await mockBackend(page, { signedIn: true, bulkTransactions: 2_000 })
  await page.addInitScript(() => {
    const w = window as unknown as { __fmt: number }
    w.__fmt = 0
    const Original = Intl.DateTimeFormat
    const Counting = function (this: unknown, ...args: ConstructorParameters<typeof Intl.DateTimeFormat>) { w.__fmt++; return new Original(...args) } as unknown as typeof Intl.DateTimeFormat
    Counting.prototype = Original.prototype
    Counting.supportedLocalesOf = Original.supportedLocalesOf
    Intl.DateTimeFormat = Counting
    const toLocale = Date.prototype.toLocaleDateString
    Date.prototype.toLocaleDateString = function (...args: Parameters<Date['toLocaleDateString']>) { w.__fmt++; return toLocale.apply(this, args) }
  })
  for (const path of ['/app/investments', '/app/transactions', '/app/']) {
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    const made = await page.evaluate(() => (window as unknown as { __fmt: number }).__fmt)
    expect(made, path).toBeLessThan(60)
  }
})
