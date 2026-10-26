// Deep QA probe, round 5: empty, slow-loading and failed-loading states on every screen (desktop and phone).
import { test } from '@playwright/test'
import { mockBackend } from '../mock'
import { PAGES } from '../pages'

const SCREENS = ['/app/', '/app/transactions', ...PAGES.filter((p) => !p.phoneOnly).map((p) => p.path)]
const text = async (page: import('@playwright/test').Page) => ((await page.locator('main').innerText().catch(() => '')) || '').replace(/\s+/g, ' ').slice(0, 140)

for (const size of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
  test(`states probe (${size.name})`, async ({ browser }) => {
    test.setTimeout(400_000)
    const out: string[] = []
    // Empty household: nothing shared yet.
    {
      const page = await browser.newPage({ viewport: size })
      await mockBackend(page, { signedIn: true, noHousehold: true })
      for (const path of SCREENS) {
        await page.goto(path)
        await page.waitForLoadState('networkidle')
        out.push(`EMPTY ${path}: ${await text(page)}`)
      }
      await page.close()
    }
    // Slow: every backend call takes 4 s. What shows at 300 ms and at 2 s?
    {
      const page = await browser.newPage({ viewport: size })
      await mockBackend(page, { signedIn: true })
      await page.route('**/rest/v1/**', async (r) => { await new Promise((x) => setTimeout(x, 4000)); await r.fallback() })
      for (const path of ['/app/', '/app/accounts', '/app/budget', '/app/investments']) {
        await page.goto(path)
        await page.waitForTimeout(300)
        const at300 = await text(page)
        const spin300 = await page.locator('[role=status], .spinner, [aria-busy=true]').count()
        await page.waitForTimeout(1700)
        out.push(`SLOW ${path} @300ms spinner=${spin300} "${at300.slice(0, 60)}" | @2s "${(await text(page)).slice(0, 60)}"`)
      }
      await page.close()
    }
    // Failed: household records answer 500.
    {
      const page = await browser.newPage({ viewport: size })
      await mockBackend(page, { signedIn: true })
      await page.route('**/rest/v1/household_records**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }))
      for (const path of SCREENS) {
        await page.goto(path)
        await page.waitForTimeout(1500)
        const retry = await page.getByRole('button', { name: /try again|retry|reload/i }).count()
        out.push(`ERROR ${path}: retry=${retry} "${(await text(page)).slice(0, 100)}"`)
      }
      await page.close()
    }
    console.log(`\n== ${size.name} ==\n` + out.join('\n'))
  })
}
