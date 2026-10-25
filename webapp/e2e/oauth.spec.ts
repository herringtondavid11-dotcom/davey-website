// OAuth banks (Chase) on the web: the return is used exactly once, by exactly one Link (2026-10-25 Chase audit).
// A second Link continuing the same oauth_state_id is how a bank's authorization code gets redeemed twice, which
// Plaid reports as invalid_grant.
import { expect, test, type Page } from '@playwright/test'
import { mockBackend } from './mock'

type W = { __plaidCreates: { token: string; receivedRedirectUri: string | null }[]; __plaidClose: () => void; __plaidSucceed: () => void }
const creates = (page: Page) => page.evaluate(() => (window as unknown as W).__plaidCreates)

async function openHeldLink(page: Page) {
  await page.goto('/app/connect')
  await page.getByRole('button', { name: /Connect an account/ }).first().click()
  await expect.poll(() => creates(page)).toHaveLength(1)
}

async function bankPopup(page: Page, query: string) {
  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.evaluate((q) => { window.open(`/app/oauth${q}`, 'bank') }, query),
  ])
  await popup.waitForLoadState()
  return popup
}

test('desktop pop-up return: the pop-up never starts Link; the opener continues once after Link closes', async ({ page }) => {
  await mockBackend(page, { signedIn: true, plaidHold: true })
  await openHeldLink(page)
  const query = '?oauth_state_id=st-pop-1&extra=a%2Bb'
  const popup = await bankPopup(page, query)
  await expect(popup.locator('body')).toContainText('finishing in your other window')
  expect(await popup.evaluate(() => typeof (window as unknown as { Plaid?: unknown }).Plaid)).toBe('undefined')
  expect(new URL(popup.url()).search).toBe('') // the state id is gone from the pop-up's address bar

  // Plaid's Link is still open, so it gets the first chance; only when it closes does Davey continue the return.
  expect(await creates(page)).toHaveLength(1)
  await page.evaluate(() => (window as unknown as W).__plaidClose())
  await expect.poll(() => creates(page)).toHaveLength(2)
  const [first, second] = await creates(page)
  expect(second).toEqual({ token: first.token, receivedRedirectUri: `http://localhost:4173/app/oauth${query}` })

  // Closing again (or the same return arriving twice) never continues it a second time.
  await page.evaluate(() => (window as unknown as W).__plaidClose())
  await page.evaluate((q) => window.postMessage({ type: 'davey.oauth-return', href: `http://localhost:4173/app/oauth${q}` }, window.location.origin), query)
  await page.waitForTimeout(300)
  expect(await creates(page)).toHaveLength(2)
})

test('desktop pop-up return: when Plaid finishes by itself, the handed-over return is never used', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, plaidHold: true })
  await openHeldLink(page)
  await bankPopup(page, '?oauth_state_id=st-pop-2')
  await page.evaluate(() => (window as unknown as W).__plaidSucceed())
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  expect(state.calls.filter((c) => c.path === '/functions/v1/plaid-exchange')).toHaveLength(1)
  await page.waitForTimeout(300)
  expect(await creates(page)).toHaveLength(1)
})

test('same-tab return opened in two tabs continues in one only (one exchange)', async ({ page, context }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.addInitScript(() => {
    if (!localStorage.getItem('davey.plaid.oauth')) {
      localStorage.setItem('davey.plaid.oauth', JSON.stringify({ linkToken: 'link-production-web-123', startedAt: new Date().toISOString(), userId: 'user-1' }))
    }
  })
  await page.goto('/app/oauth?oauth_state_id=st-tab-1')
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  const other = await context.newPage()
  const otherState = await mockBackend(other, { signedIn: true })
  await other.goto('/app/oauth?oauth_state_id=st-tab-1')
  await expect(other).toHaveURL(/\/app\/connect$/)
  expect(await other.evaluate(() => (window as unknown as { __plaidCreates?: unknown[] }).__plaidCreates?.filter((c) => (c as { receivedRedirectUri: string | null }).receivedRedirectUri) ?? [])).toEqual([])
  expect([...state.calls, ...otherState.calls].filter((c) => c.path === '/functions/v1/plaid-exchange')).toHaveLength(1)
})

test('the link token for a new connection asks only for what Chase allows', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/connect')
  await expect.poll(() => state.linkTokenBody).not.toBeNull()
  // Exactly the Dashboard URI (no trailing slash); products and filters are decided by the server (transactions only).
  expect(state.linkTokenBody).toEqual({ platform: 'web', redirect_uri: 'https://daveypersonalfinance.com/app/oauth', mode: 'account' })
})
