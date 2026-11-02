// Real Plaid sandbox OAuth. Not part of the mocked suite: it needs the sandbox test token or a signed-in
// session, and it talks to sandbox.plaid.com. Run with SANDBOX_OAUTH=1.
// DAVEY_SANDBOX_TEST_TOKEN is the X-Davey-Sandbox-Token secret (never printed).
// DAVEY_SANDBOX_BEARER is a user access token, the other way into plaid-link-token-sandbox.
import { expect, test, type Page } from '@playwright/test'

const enabled = process.env.SANDBOX_OAUTH === '1'
const header = process.env.DAVEY_SANDBOX_TEST_TOKEN
const bearer = process.env.DAVEY_SANDBOX_BEARER
const anon = 'sb_publishable_cJpaZife9jClSJVtv3tHtw_xganiB7L'
const fn = 'https://zvyargbnvccdqgmtytck.supabase.co/functions/v1/plaid-link-token-sandbox'

async function sandboxToken(institutionId: string): Promise<string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', apikey: anon }
  if (header) headers['X-Davey-Sandbox-Token'] = header
  if (bearer) headers.Authorization = `Bearer ${bearer}`
  const response = await fetch(fn, {
    method: 'POST',
    headers,
    body: JSON.stringify({ platform: 'web', redirect_uri: 'https://daveypersonalfinance.com/app/oauth', mode: 'account', institution_id: institutionId }),
  })
  const body = await response.json() as { link_token?: string; error?: string; message?: string }
  if (!response.ok || typeof body.link_token !== 'string') {
    throw new Error(`sandbox link token failed (${response.status} ${body.error ?? body.message ?? 'no token'})`)
  }
  return body.link_token
}

async function openLink(page: Page, token: string) {
  await page.goto('https://daveypersonalfinance.com/app/')
  await page.addScriptTag({ url: 'https://cdn.plaid.com/link/v2/stable/link-initialize.js' })
  await page.waitForFunction(() => typeof (window as unknown as { Plaid?: unknown }).Plaid !== 'undefined')
  await page.evaluate((linkToken) => {
    const w = window as unknown as { Plaid: { create: (opts: unknown) => { open: () => void } }; __sandboxResult?: string }
    const handler = w.Plaid.create({
      token: linkToken,
      onSuccess: () => { w.__sandboxResult = 'success' },
      onExit: (err: { error_code?: string } | null) => { w.__sandboxResult = err?.error_code ?? 'exit' },
      onEvent: (name: string) => { w.__sandboxResult = w.__sandboxResult && w.__sandboxResult !== 'success' ? w.__sandboxResult : name },
    })
    handler.open()
  }, token)
}

test.describe('Plaid sandbox', () => {
  test.skip(!enabled, 'set SANDBOX_OAUTH=1 to run against sandbox.plaid.com')
  test.skip(enabled && !header && !bearer, 'sandbox token header or bearer is not configured')

  test('non-OAuth First Platypus Bank gets as far as Link opening', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'one browser is enough for the live sandbox')
    const token = await sandboxToken('ins_109508')
    await openLink(page, token)
    const frame = page.frameLocator('iframe[id^="plaid-link-iframe"]')
    await expect(frame.getByText(/Platypus|First Platypus|Continue/i).first()).toBeVisible({ timeout: 30_000 })
  })

  test('Platypus OAuth Bank completes user_good / pass_good', async ({ page }) => {
    test.skip(test.info().project.name !== 'chromium', 'one browser is enough for the live sandbox')
    const token = await sandboxToken('ins_127287')
    await openLink(page, token)
    const frame = page.frameLocator('iframe[id^="plaid-link-iframe"]')
    const popupPromise = page.waitForEvent('popup', { timeout: 45_000 })
    const continueBtn = frame.getByRole('button', { name: /continue/i })
    if (await continueBtn.count()) await continueBtn.first().click()
    const popup = await popupPromise
    await popup.getByLabel(/username/i).fill('user_good')
    await popup.getByLabel(/password/i).fill('pass_good')
    await popup.getByRole('button', { name: /sign in|submit|continue/i }).click()
    await expect.poll(() => page.evaluate(() => (window as unknown as { __sandboxResult?: string }).__sandboxResult), { timeout: 60_000 }).toBe('success')
  })
})
