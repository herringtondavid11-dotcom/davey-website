// QA #17: going offline shows a banner (saves fail with a clear reason), and it goes away when back online.
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

test('offline banner appears and clears', async ({ page, context }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await expect(page.locator('main h1').first()).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByText("You're offline. Changes can't be saved until you're back online.")).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText("You're offline.")).toHaveCount(0)
})
