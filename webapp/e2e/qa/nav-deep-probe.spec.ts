// Deep QA probe, round 3: deep links, unknown routes, focus after navigation, dialogs vs Back, state kept on Back.
import { test } from '@playwright/test'
import { mockBackend } from '../mock'
import { PAGES } from '../pages'

const ALL = ['/app/', '/app/transactions', '/app/connect', '/app/settings', '/app/profile', ...PAGES.map((p) => p.path)]

for (const size of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`navigation deep probe (${size.name})`, async ({ page }) => {
    test.setTimeout(240_000)
    await page.setViewportSize(size)
    await mockBackend(page, { signedIn: true })
    const out: string[] = []
    // 1. Deep link (fresh load) to every screen.
    for (const path of ALL) {
      await page.goto(path)
      const h1 = await page.locator('main h1').first().textContent({ timeout: 8000 }).catch(() => null)
      const at = new URL(page.url()).pathname
      if (!h1 || at !== path) out.push(`DEEPLINK ${path} → ${at} h1=${h1}`)
    }
    // 2. Unknown route and query/hash survival.
    await page.goto('/app/does-not-exist')
    out.push(`unknown route → ${new URL(page.url()).pathname} (${await page.locator('main h1').first().textContent().catch(() => '?')})`)
    await page.goto('/app/transactions?q=netflix')
    await page.locator('main h1').first().waitFor()
    const q = await page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first().inputValue().catch(() => 'n/a')
    out.push(`/transactions?q=netflix → search box "${q}"`)
    // 3. Focus after in-app navigation (screen readers need it on the new screen).
    await page.goto('/app/')
    await page.locator('main h1').first().waitFor()
    const nav = page.getByRole('link', { name: 'Budget', exact: true }).first()
    if (await nav.isVisible().catch(() => false)) {
      await nav.click()
      await page.locator('main h1', { hasText: 'Budget' }).waitFor()
      out.push(`focus after nav click: ${await page.evaluate(() => { const e = document.activeElement; return e ? `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${(e.textContent ?? '').trim().slice(0, 30)}"` : 'none' })}`)
      out.push(`scroll after nav: ${await page.evaluate(() => scrollY)}`)
    } else out.push('Budget nav link not visible (phone tab bar?)')
    // 4. Dialog vs Back: open Manage categories, press Back.
    await page.goto('/app/accounts')
    await page.locator('main h1').first().waitFor()
    const manage = page.getByRole('button', { name: /Manage categories/i }).first()
    if (await manage.count()) {
      await manage.click()
      await page.getByRole('dialog').waitFor({ timeout: 5000 }).catch(() => undefined)
      await page.goBack()
      await page.waitForTimeout(400)
      out.push(`Back with Manage categories open → ${new URL(page.url()).pathname}, dialog open: ${await page.getByRole('dialog').isVisible().catch(() => false)}`)
    }
    // 5. State on Back: Accounts group/sort/filter and an expanded account.
    await page.goto('/app/accounts')
    await page.locator('main h1').first().waitFor()
    const chip = page.locator('.cat-legend-row').first()
    if (await chip.count()) await chip.click()
    const filtered = await page.locator('.goal-row').count()
    await page.goto('/app/budget')
    await page.goBack()
    await page.locator('main h1').first().waitFor()
    await page.waitForTimeout(300)
    out.push(`Accounts chart filter kept on Back: rows ${filtered} → ${await page.locator('.goal-row').count()}`)
    // 6. Transactions filter/search kept on Back.
    await page.goto('/app/transactions')
    await page.locator('main h1').first().waitFor()
    const search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()
    await search.fill('netflix')
    await page.waitForTimeout(300)
    await page.goto('/app/budget')
    await page.goBack()
    await page.locator('main h1').first().waitFor()
    out.push(`Transactions search kept on Back: "${await search.inputValue().catch(() => 'n/a')}", url ${page.url().replace(/.*\/app/, '/app')}`)
    // 7. Scroll restore with main-container scroll on desktop.
    await page.goto('/app/transactions')
    await page.locator('main h1').first().waitFor()
    await page.evaluate(() => { const m = document.scrollingElement!; m.scrollTo(0, 1200); for (const e of document.querySelectorAll<HTMLElement>('main, .content, .main')) e.scrollTop = 1200 })
    await page.waitForTimeout(200)
    const before = await page.evaluate(() => Math.max(scrollY, ...[...document.querySelectorAll<HTMLElement>('main, .content, .main')].map((e) => e.scrollTop)))
    await page.goto('/app/budget')
    await page.goBack()
    await page.locator('main h1').first().waitFor()
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => Math.max(scrollY, ...[...document.querySelectorAll<HTMLElement>('main, .content, .main')].map((e) => e.scrollTop)))
    out.push(`scroll restore Transactions: ${Math.round(before)} → ${Math.round(after)}`)
    // 8. Signed-out deep link → login → back to the deep link?
    console.log(`\n== ${size.name} ==\n` + out.join('\n'))
  })
}

test('signed-out deep link returns to the screen after sign-in', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/app/budget')
  await page.waitForTimeout(800)
  console.log(`\nsigned-out /app/budget → ${new URL(page.url()).pathname}${new URL(page.url()).search}`)
})
