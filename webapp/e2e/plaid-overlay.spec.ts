// Plaid Link must fill the page WITHOUT covering navigation. David, iPhone Safari, 2026-10-22: Link showed as a
// small box under the tab bar because the CSP strips Plaid's inline iframe styles. A later full-viewport transparent
// frame froze the app: Plaid's page stays invisible until its script fades an overlay in, but the iframe still
// swallows every tap, so the tabs and sidebar could not be clicked.
import { devices, expect, test, type Page } from '@playwright/test'
import { mockBackend } from './mock'

const { defaultBrowserType: _iphoneBrowser, ...iPhone14 } = devices['iPhone 14']
const { defaultBrowserType: _ipadBrowser, ...iPad } = devices['iPad (gen 7)']

async function openLink(page: Page) {
  await page.goto('/app/connect')
  await page.getByRole('button', { name: 'Connect an account' }).click()
  await expect(page.getByText('Plaid is open…')).toBeVisible()
}

async function bars(page: Page) {
  return page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel)
      if (!el || getComputedStyle(el).display === 'none') return { x: 0, y: 0, w: 0, h: 0 }
      const r = el.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height }
    }
    return { tab: box('.tabbar'), mobile: box('.mobile-bar'), side: box('.sidebar') }
  })
}

for (const [name, device] of [['iPhone 14', iPhone14], ['iPad', iPad]] as const) {
  test.describe(name, () => {
    test.use(device)

    test(`Plaid Link fills the screen between the bars, and the bars still switch sections (${name})`, async ({ page }) => {
      await mockBackend(page, { signedIn: true, plaidHold: true })
      await openLink(page)
      const frame = page.locator('iframe[id^="plaid-link-iframe"]')
      await expect(frame).toBeVisible()
      const box = (await frame.boundingBox())!
      const vp = page.viewportSize()!
      const nav = await bars(page)
      expect(nav.tab.h).toBeGreaterThan(0)
      expect(nav.mobile.h).toBeGreaterThan(0)
      expect(Math.round(box.x)).toBe(0)
      expect(Math.round(box.y)).toBe(Math.round(nav.mobile.h))
      expect(Math.round(box.width)).toBe(vp.width)
      expect(Math.round(box.height)).toBe(vp.height - Math.round(nav.mobile.h) - Math.round(nav.tab.h))
      const topmost = await page.evaluate(() => ({
        center: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id ?? '',
        bottom: document.elementFromPoint(innerWidth / 2, innerHeight - 8)?.closest('.tab, .tabbar') ? 'tab' : (document.elementFromPoint(innerWidth / 2, innerHeight - 8)?.id ?? ''),
        top: document.elementFromPoint(innerWidth / 2, 8)?.closest('.mobile-bar') ? 'bar' : (document.elementFromPoint(innerWidth / 2, 8)?.id ?? ''),
      }))
      expect(topmost.center).toMatch(/^plaid-link-iframe/)
      expect(topmost.bottom).toBe('tab')
      expect(topmost.top).toBe('bar')
      await expect(page.locator('.tabbar')).toBeVisible()
      await expect(page.locator('.ai-fab')).toBeHidden()
      await page.locator('.tabbar').getByRole('link', { name: 'Budget', exact: true }).click()
      await expect(page).toHaveURL(/\/app\/budget$/)
      await expect(page.getByRole('heading', { name: 'Budget', level: 1 })).toBeVisible()
      await expect(frame).toBeHidden()
      await page.evaluate(() => (window as unknown as { __plaidClose?: () => void }).__plaidClose?.())
    })
  })
}

test('desktop: Plaid Link sits beside the sidebar, and the sidebar still switches sections', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await mockBackend(page, { signedIn: true, plaidHold: true })
  await page.goto('/app/connect')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('iframe[id^="plaid-link-iframe"]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Connect an account' }).click()
  const frame = page.locator('iframe[id^="plaid-link-iframe"]')
  await expect(frame).toBeVisible()
  const nav = await bars(page)
  expect(nav.side.w).toBeGreaterThan(0)
  expect(await frame.boundingBox()).toEqual({ x: nav.side.w, y: 0, width: 1280 - nav.side.w, height: 800 })
  const hit = await page.evaluate(() => ({
    side: document.elementFromPoint(24, 400)?.closest('.sidebar') ? 'sidebar' : (document.elementFromPoint(24, 400)?.id ?? ''),
    main: document.elementFromPoint(400, 400)?.id ?? '',
  }))
  expect(hit.side).toBe('sidebar')
  expect(hit.main).toMatch(/^plaid-link-iframe/)
  await expect(page.locator('.ai-fab')).toBeHidden()
  await page.locator('.sidebar').getByRole('link', { name: 'Accounts', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/accounts$/)
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible()
  await expect(frame).toBeHidden()
})
