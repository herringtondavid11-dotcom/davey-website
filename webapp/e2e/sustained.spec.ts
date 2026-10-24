// David (2026-10-24): fast at first, slower after jumping between tabs, opening Ask AI, or leaving and coming back.
// Ten rounds of every tab, Ask AI open/close, the transaction list, and a hide/show of the page. Each round's time,
// the JS heap (Chromium) and the DOM size must not grow round over round.
import { expect, test, type Page } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

const TABS: [string, string][] = [['Overview', 'Overview'], ['Budget', 'Budget'], ['Accounts', 'Accounts'], ['Investments', 'Investments']]

async function go(page: Page, label: string, heading: string) {
  await page.locator('.sidebar a:visible, .tabbar a:visible').filter({ hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click()
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
}

async function hideAndShow(page: Page) {
  // What leaving the app and coming back does to the page: hidden, then visible again.
  await page.evaluate(() => {
    const set = (state: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    }
    set('hidden')
    set('visible')
  })
}

for (const [name, viewport] of [['desktop', { width: 1280, height: 800 }], ['phone', { width: 390, height: 844 }]] as const) {
  test(`ten rounds stay as fast as the first (${name})`, async ({ page }) => {
    test.setTimeout(120_000)
    const problems = watchConsole(page)
    await page.setViewportSize(viewport)
    await mockBackend(page, { signedIn: true })
    await page.goto('/app/')
    await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
    const rounds: { ms: number; heap: number; nodes: number }[] = []
    for (let round = 0; round < 10; round++) {
      const start = Date.now()
      for (const [label, heading] of TABS) {
        await go(page, label, heading)
        await page.mouse.wheel(0, 1200)
        await page.mouse.wheel(0, -1200)
      }
      // Desktop: the floating Ask AI button; phone: the Ask tab.
      await page.locator('.ai-fab:visible, .tabbar button.tab:visible').filter({ hasText: /Ask/ }).or(page.locator('.ai-fab:visible')).first().click()
      await page.getByRole('button', { name: 'Close Ask AI' }).click()
      await page.goto('/app/transactions')
      await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible()
      await hideAndShow(page)
      await go(page, 'Overview', 'Overview')
      const stats = await page.evaluate(() => ({
        heap: (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0,
        nodes: document.getElementsByTagName('*').length,
      }))
      rounds.push({ ms: Date.now() - start, ...stats })
    }
    console.log(`PERF-WEB ${name} rounds: ${rounds.map((r) => `${r.ms}ms/${Math.round(r.heap / 1e6)}MB/${r.nodes}n`).join(' ')}`)
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
    const early = rounds.slice(1, 4), late = rounds.slice(-3)
    expect(median(late.map((r) => r.ms))).toBeLessThan(median(early.map((r) => r.ms)) * 1.25 + 300)
    expect(median(late.map((r) => r.nodes))).toBeLessThan(median(early.map((r) => r.nodes)) * 1.1 + 50)
    if (early[0].heap > 0) expect(median(late.map((r) => r.heap))).toBeLessThan(median(early.map((r) => r.heap)) * 1.5)
    expect(problems).toEqual([])
  })
}
