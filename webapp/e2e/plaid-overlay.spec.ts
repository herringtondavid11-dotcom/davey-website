// Plaid Link must cover the whole screen above the app's bars (David, iPhone Safari, 2026-10-22: it showed as a small
// box at the bottom-left, under the tab bar, because the CSP strips Plaid's inline iframe styles).
import { devices, expect, test, type Page } from '@playwright/test'
import { mockBackend } from './mock'

const { defaultBrowserType: _iphoneBrowser, ...iPhone14 } = devices['iPhone 14']
const { defaultBrowserType: _ipadBrowser, ...iPad } = devices['iPad (gen 7)']

async function openLink(page: Page) {
  await page.goto('/app/connect')
  await page.getByRole('button', { name: 'Connect an account' }).click()
  await expect(page.getByText('Plaid is open…')).toBeVisible()
}

for (const [name, device] of [['iPhone 14', iPhone14], ['iPad', iPad]] as const) {
  test.describe(name, () => {
    test.use(device)

    test(`Plaid Link covers the whole viewport above the nav, and the bars step aside (${name})`, async ({ page }) => {
      await mockBackend(page, { signedIn: true, plaidHold: true })
      await openLink(page)
      const frame = page.locator('iframe[id^="plaid-link-iframe"]')
      await expect(frame).toBeVisible()
      const box = (await frame.boundingBox())!
      const vp = page.viewportSize()!
      expect(box.x).toBe(0)
      expect(box.y).toBe(0)
      expect(Math.round(box.width)).toBe(vp.width)
      expect(Math.round(box.height)).toBe(vp.height)
      // On top of everything: the topmost element at the center and at the bottom edge (where the tab bar is) is Plaid.
      const topmost = await page.evaluate(() => [
        document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id,
        document.elementFromPoint(innerWidth / 2, innerHeight - 10)?.id,
        document.elementFromPoint(10, 10)?.id,
      ])
      expect(topmost.every((id) => id?.startsWith('plaid-link-iframe'))).toBe(true)
      await expect(page.locator('.tabbar')).toBeHidden()
      await expect(page.locator('.ai-fab')).toBeHidden()
      // Closing Link hides the frame and brings the app back.
      await page.evaluate(() => (window as unknown as { __plaidClose: () => void }).__plaidClose())
      await expect(frame).toBeHidden()
      if (name === 'iPhone 14') await expect(page.locator('.tabbar')).toBeVisible()
    })
  })
}

test('desktop: Plaid Link full screen above the sidebar, hidden before opening', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockBackend(page, { signedIn: true, plaidHold: true })
  await page.goto('/app/connect')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('iframe[id^="plaid-link-iframe"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Connect an account' }).click()
  const frame = page.locator('iframe[id^="plaid-link-iframe"]')
  await expect(frame).toBeVisible()
  expect(await frame.boundingBox()).toEqual({ x: 0, y: 0, width: 1280, height: 800 })
  expect(await page.evaluate(() => document.elementFromPoint(100, 400)?.id)).toMatch(/^plaid-link-iframe/)
})
