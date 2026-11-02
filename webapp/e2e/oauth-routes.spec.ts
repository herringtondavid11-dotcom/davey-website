// /app/oauth is the Plaid redirect URI. /app/oauth/ must be the same page, not the site 404.
import { expect, test, type Page } from '@playwright/test'
import { mockBackend } from './mock'

type W = { __plaidCreates: { token: string; receivedRedirectUri: string | null }[]; __plaidOpenOAuth: () => void; __plaidFailOAuth: () => void }

test('oauth and oauth/ both load the app, and a trailing slash keeps the state id', async ({ page }) => {
  await mockBackend(page)
  for (const path of ['/app/oauth', '/app/oauth/']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(200)
    await expect(page.locator('body')).not.toContainText('Page not found')
    expect(page.url(), path).not.toMatch(/\/oauth\//)
  }
})

test('a trailing-slash OAuth return resumes the same link token', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.addInitScript(() => {
    localStorage.setItem('davey.plaid.oauth', JSON.stringify({ linkToken: 'link-production-web-123', startedAt: new Date().toISOString(), userId: 'user-1' }))
  })
  const response = await page.goto('/app/oauth/?oauth_state_id=st-slash-1')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  expect(page.url()).not.toMatch(/\/oauth\//)
  const creates = await page.evaluate(() => (window as unknown as W).__plaidCreates)
  expect(creates).toEqual([{ token: 'link-production-web-123', receivedRedirectUri: 'http://localhost:4173/app/oauth?oauth_state_id=st-slash-1' }])
})

async function openHeld(page: Page) {
  await page.goto('/app/connect')
  await page.getByRole('button', { name: /Connect an account/ }).first().click()
  await expect.poll(() => page.evaluate(() => (window as unknown as W).__plaidCreates?.length ?? 0)).toBe(1)
}

test('Chase OAuth shows an in-app explanation while the bank window is open', async ({ page }) => {
  await mockBackend(page, { signedIn: true, plaidHold: true })
  await openHeld(page)
  await page.evaluate(() => (window as unknown as W).__plaidOpenOAuth())
  const banner = page.locator('.oauth-banner')
  await expect(banner).toContainText("Chase's sign-in is open")
  await expect(banner.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('a failed Chase OAuth tells the user the bank refused it and logs the request id', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, plaidHold: true })
  await openHeld(page)
  await page.evaluate(() => (window as unknown as W).__plaidFailOAuth())
  await expect(page.getByText('Chase refused the connection.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()
  await expect.poll(() => state.calls.filter((c) => c.path === '/functions/v1/client-diagnostics').map((c) => (c.body as { payload?: { event?: string; request_id?: string } }).payload)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ event: 'OPEN_OAUTH', request_id: 'req-chase' }),
      expect.objectContaining({ event: 'FAIL_OAUTH', request_id: 'req-chase-fail' }),
      expect.objectContaining({ event: 'ERROR', request_id: 'req-chase-err', error_code: 'INSUFFICIENT_CREDENTIALS' }),
      expect.objectContaining({ event: 'DAVEY_OAUTH_GAVE_UP', request_id: 'req-chase-fail' }),
    ]),
  )
})
