// Household parity (David, 2026-10-24): Allie's iPhone showed $0 and a flat line on Investments while David's showed
// real holdings. Every household member must see exactly what the owner sees. The web reads the same household rows
// for both (RLS), so the owner and the member render the same totals, holdings, history and net worth, including a
// manual investment account shared from the app (holding and daily-value records).
import { expect, test, type Page } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

async function capture(page: Page, asMember: boolean) {
  await mockBackend(page, { signedIn: true, manualInvestments: true, asMember })
  await page.goto('/app/investments')
  const value = page.locator('.stat').filter({ hasText: 'Portfolio value' }).locator('.stat-value')
  await expect(value).toBeVisible()
  await expect(page.getByText('GOLD', { exact: true }).first()).toBeVisible()
  // Server holdings and shared records arrive separately; under a busy test machine the screen can be read between
  // them. Wait for the settled total (failed once in a full parallel run, 2026-10-26).
  await expect(value).toHaveText('$518,640.55')
  const portfolio = await value.innerText()
  const holdings = await page.locator('section[aria-labelledby="holdings"]').innerText()
  const chart = await page.getByRole('img', { name: /Portfolio value, 1Y/ }).first().getAttribute('aria-label').catch(() => null)
  await page.goto('/app/')
  const netWorth = page.locator('[aria-labelledby="nw"], .hero').filter({ hasText: 'Net worth' }).first()
  await expect(netWorth).toBeVisible()
  // Same for the net worth: read it once it stops changing.
  let overview = ''
  await expect.poll(async () => { const now = await netWorth.innerText(); const same = now === overview; overview = now; return same }, { intervals: [300] }).toBe(true)
  return { portfolio, holdings, chart, overview }
}

test('owner and household member see the same investments and net worth', async ({ browser }) => {
  const ownerPage = await browser.newPage()
  const ownerProblems = watchConsole(ownerPage)
  const owner = await capture(ownerPage, false)
  const memberPage = await browser.newPage()
  const memberProblems = watchConsole(memberPage)
  const member = await capture(memberPage, true)

  // Brokerage holdings $512,640.55 (server rows) + Gold & Coins $6,000 (shared holding record).
  expect(owner.portfolio).toBe('$518,640.55')
  expect(member).toEqual(owner)
  // The manual Gold & Coins account ($6,000) counts in the portfolio on both.
  expect(owner.holdings).toContain('GOLD')
  expect(ownerProblems).toEqual([])
  expect(memberProblems).toEqual([])
})
