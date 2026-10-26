// Deep QA probe: screen and interaction speed with a heavy household (10,000 transactions), desktop and phone.
import { test } from '@playwright/test'
import { mockBackend } from '../mock'

const SCREENS = ['/app/', '/app/transactions', '/app/accounts', '/app/budget', '/app/cash-flow', '/app/recurring', '/app/credit-cards', '/app/investments', '/app/tax', '/app/exports']

for (const size of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`speed probe, 10k transactions (${size.name})`, async ({ page }) => {
    test.setTimeout(300_000)
    await page.setViewportSize(size)
    await mockBackend(page, { signedIn: true, bulkTransactions: 10_000 })
    await page.addInitScript(() => {
      (window as unknown as { __long: number[] }).__long = []
      new PerformanceObserver((l) => { for (const e of l.getEntries()) (window as unknown as { __long: number[] }).__long.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
    })
    const out: string[] = []
    const longs = async () => page.evaluate(() => { const w = window as unknown as { __long: number[] }; const l = w.__long; w.__long = []; return l })
    let t = Date.now()
    await page.goto('/app/')
    await page.locator('main h1').first().waitFor()
    await page.waitForLoadState('networkidle')
    out.push(`cold load to settled: ${Date.now() - t}ms, long tasks ${JSON.stringify(await longs())}`)
    for (const path of SCREENS.slice(1)) {
      t = Date.now()
      await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, path)
      await page.locator('main h1').first().waitFor()
      await page.waitForLoadState('networkidle')
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      out.push(`${path}: ${Date.now() - t}ms, long tasks ${JSON.stringify(await longs())}`)
    }
    // Search on Transactions: type and measure until the list reflects it.
    await page.goto('/app/transactions')
    await page.locator('main h1').first().waitFor()
    await longs()
    const search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()
    if (await search.count()) {
      t = Date.now()
      await search.pressSequentially('netflix', { delay: 30 })
      await page.waitForTimeout(400)
      out.push(`search "netflix" typed+settled: ${Date.now() - t}ms, long tasks ${JSON.stringify(await longs())}`)
    } else out.push('search: no search box found on Transactions')
    // Accounts: Refresh all and a chart tap.
    await page.goto('/app/accounts')
    await page.locator('main h1').first().waitFor()
    await longs()
    const legend = page.locator('.cat-legend-row').first()
    if (await legend.count()) { t = Date.now(); await legend.click(); await page.waitForTimeout(100); out.push(`chart tap filter: ${Date.now() - t}ms, long ${JSON.stringify(await longs())}`) }
    t = Date.now()
    await page.getByRole('button', { name: 'Refresh all accounts' }).click()
    await page.getByRole('region', { name: /^Refreshed/ }).waitFor({ timeout: 30_000 })
    out.push(`Refresh all (3 banks, mock): ${Date.now() - t}ms, long ${JSON.stringify(await longs())}`)
    // Heap.
    const heap = await page.evaluate(() => (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0)
    out.push(`JS heap: ${Math.round(heap / 1e6)} MB`)
    console.log(`\n== ${size.name} ==\n` + out.join('\n'))
  })
}
