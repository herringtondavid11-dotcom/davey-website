// Deep QA probe (not part of the default run): back/forward across every screen, timings, and what's restored.
import { expect, test } from '@playwright/test'
import { mockBackend } from '../mock'
import { PAGES } from '../pages'

const SCREENS = ['/app/', '/app/transactions', ...PAGES.filter((p) => !p.phoneOnly).map((p) => p.path), '/app/settings']

for (const size of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`back/forward and timing probe (${size.name})`, async ({ page }) => {
    test.setTimeout(180_000)
    await page.setViewportSize(size)
    await mockBackend(page, { signedIn: true })
    const report: string[] = []
    await page.goto('/app/')
    await page.locator('h1').first().waitFor()
    for (const path of SCREENS.slice(1)) {
      const t0 = Date.now()
      await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path)
      await page.locator('main h1').first().waitFor({ timeout: 10_000 }).catch(() => report.push(`NO H1 ${path}`))
      report.push(`${path} ${Date.now() - t0}ms`)
    }
    // Back through everything: each step must show the right screen.
    for (const path of [...SCREENS].reverse().slice(1)) {
      await page.goBack()
      await page.waitForTimeout(150)
      const url = new URL(page.url()).pathname
      if (url !== path) report.push(`BACK expected ${path} got ${url}`)
      const h1 = await page.locator('main h1').first().textContent({ timeout: 5000 }).catch(() => null)
      if (!h1) report.push(`BACK no heading at ${path}`)
    }
    // Scroll restore: scroll Transactions, open a screen, go back.
    await page.goto('/app/transactions')
    await page.locator('main h1').first().waitFor()
    await page.mouse.wheel(0, 1500)
    await page.waitForTimeout(300)
    const y = await page.evaluate(() => scrollY || document.querySelector('main')?.scrollTop || 0)
    await page.goto('/app/budget')
    await page.goBack()
    await page.waitForTimeout(600)
    const y2 = await page.evaluate(() => scrollY || document.querySelector('main')?.scrollTop || 0)
    report.push(`scroll before ${Math.round(y)} after back ${Math.round(y2)}`)
    // Document title per screen.
    for (const path of SCREENS) {
      await page.goto(path)
      await page.locator('main h1').first().waitFor()
      report.push(`title ${path}: ${await page.title()}`)
    }
    console.log(`\n== ${size.name} ==\n` + report.join('\n'))
    expect(true).toBe(true)
  })
}
