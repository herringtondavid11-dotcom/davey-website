import { expect, test, type Page } from '@playwright/test'
import { EMAIL, PASSWORD, mockBackend } from './mock'
import { PAGES } from './pages'

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
]
const THEMES = ['light', 'dark'] as const


async function noHorizontalOverflow(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
  expect(scroll, 'page scrolls sideways').toBeLessThanOrEqual(inner)
}

for (const vp of VIEWPORTS) {
  for (const theme of THEMES) {
    test(`screens ${vp.width} ${theme}`, async ({ page, browserName }, info) => {
      await page.setViewportSize(vp)
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' })
      const shot = async (name: string) => {
        await noHorizontalOverflow(page)
        await page.screenshot({ path: `screenshots/${browserName}-${vp.width}-${theme}-${name}.png`, fullPage: true, animations: 'disabled' })
      }
      const phone = vp.width < 900

      // Sign in + 2-step
      await mockBackend(page)
      await page.goto('/app/login')
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await shot('01-login')
      await page.getByLabel('Email').fill(EMAIL)
      await page.getByLabel('Password').fill(PASSWORD)
      await page.getByRole('button', { name: 'Sign in' }).click()
      await expect(page.getByRole('heading', { name: '2-step verification' })).toBeVisible()
      await page.getByLabel('Code').fill('123456')
      await shot('02-two-step')
      await page.getByRole('button', { name: 'Verify' }).click()

      // Overview
      await expect(page.getByTestId('net-worth')).toBeVisible()
      await expect(page.locator(phone ? '.tabbar' : '.sidebar')).toBeVisible()
      await expect(page.locator(phone ? '.sidebar' : '.tabbar')).toBeHidden()
      await shot('03-overview')

      // Transactions + edit sheet
      await page.getByRole('link', { name: phone ? 'Activity' : 'Transactions' }).first().click()
      await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
      await shot('04-transactions')
      await page.getByRole('button', { name: /Adobe/ }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      const box = await page.getByRole('dialog').boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1)
      await page.screenshot({ path: `screenshots/${browserName}-${vp.width}-${theme}-05-edit-transaction.png`, animations: 'disabled' })
      await page.getByRole('button', { name: 'Cancel' }).click()

      // Connect a Bank → Name your accounts
      await page.getByRole('link', { name: phone ? 'More' : 'Connect a Bank' }).first().click()
      if (phone) await page.getByRole('link', { name: 'Connect a Bank' }).click()
      await expect(page.getByRole('heading', { name: 'Connect your bank securely' })).toBeVisible()
      await shot('06-connect')
      await page.getByRole('button', { name: 'Connect a Bank' }).click()
      await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
      await shot('07-name-accounts')

      // Settings
      await page.goto('/app/settings')
      await expect(page.getByRole('heading', { name: 'Security' })).toBeVisible()
      await shot('08-settings')
      for (const p of PAGES) {
        if (p.phoneOnly && !phone) continue
        await page.goto(p.path)
        await expect(page.getByRole('heading', { level: 1, name: p.heading })).toBeVisible()
        await page.waitForLoadState('networkidle')
        await shot(p.name)
      }
      info.annotations.push({ type: 'screenshots', description: `${browserName}-${vp.width}-${theme}` })
    })
  }
}
