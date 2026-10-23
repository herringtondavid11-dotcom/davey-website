import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'
import { PAGES } from './pages'

// Responsive range 360–1920: nothing may stick out past the viewport on any screen.
const ALL = ['/app/', '/app/transactions', '/app/connect', '/app/settings', ...PAGES.map((p) => p.path)]

for (const width of [320, 360, 768, 1280, 1920]) {
  test(`no element overflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockBackend(page, { signedIn: true })
    for (const path of ALL) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed')
          .slice(0, 3)
          .map((e) => `${e.tagName.toLowerCase()}.${e.className}`),
      )
      expect(wide, `${path} at ${width}px`).toEqual([])
    }
  })
}

for (const width of [320, 360, 768, 1280, 1920]) {
  test(`signed-out screens fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await mockBackend(page)
    for (const path of ['/app/access', '/app/login', '/app/signup', '/app/forgot']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length)
      expect(wide, `${path} at ${width}px`).toBe(0)
    }
  })
}

test('card titles stay on one line at 360px (Budgets vs actual)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/budget')
  const title = page.locator('#bva')
  await expect(title).toBeVisible()
  const lines = await title.evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '24')))
  expect(lines).toBe(1)
})

test('sidebar fits a short laptop window: Settings and Sign out visible without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  const sidebar = page.locator('.sidebar')
  for (const name of ['Settings', 'Sign out']) {
    const box = await sidebar.getByRole(name === 'Sign out' ? 'button' : 'link', { name, exact: true }).boundingBox()
    expect(box, name).not.toBeNull()
    expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(700)
  }
})
