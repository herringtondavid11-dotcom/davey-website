// David's sign-in, end to end (2026-10-22): password → "Check your email" → 6-digit code OR the emailed link.
import { expect, test, type Page } from '@playwright/test'
import { EMAIL, EMAIL_2FA_ENABLED, EMAIL_CODE, PASSWORD, TEST_PIN, mockBackend, watchConsole } from './mock'

test.skip(!EMAIL_2FA_ENABLED, 'web 2-step is off (EMAIL_2FA_ENABLED=false); see signin-direct.spec.ts')

async function passwordStep(page: Page, state: { otpSends: unknown[] }) {
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  // The email (and this browser's PKCE verifier) goes out right after the screen appears.
  await expect.poll(() => state.otpSends.length).toBeGreaterThan(0)
}

test('(a) password → Check your email → type the 6-digit code → signed in on Overview', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page)
  await passwordStep(page, state)
  await page.getByLabel('6-digit code').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  expect(state.otpSends).toHaveLength(1)
  expect(state.verifyCalls).toBe(1)
  expect(problems).toEqual([])
})

test('(b) tapping the emailed link on the same device → /app/auth/callback → signed in, one exchange, no extra verify', async ({ page }) => {
  const state = await mockBackend(page)
  await passwordStep(page, state)
  // The email asks Supabase to send the link to /app/auth/callback; this browser holds the PKCE verifier.
  await expect.poll(() => state.calls.some((c) => c.path.startsWith('/auth/v1/otp'))).toBe(true)
  const otp = state.calls.find((c) => c.path.startsWith('/auth/v1/otp'))!
  expect(decodeURIComponent(otp.path)).toContain('redirect_to=https://daveypersonalfinance.com/app/auth/callback')
  expect(otp.body).toMatchObject({ code_challenge_method: 's256' })
  // Supabase's verify page redirects the tapped link here with ?code=.
  await page.goto('/app/auth/callback?code=pkce-good')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page).toHaveURL(/\/app\/?$/)
  expect(state.pkceExchanges).toHaveLength(1)
  expect(state.pkceExchanges[0]).toMatchObject({ auth_code: 'pkce-good' })
  expect(state.verifyCalls).toBe(0)
  // Reloading the app afterwards stays signed in and never exchanges again.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  expect(state.pkceExchanges).toHaveLength(1)
})

test('(b2) a token_hash link is verified exactly once, even if the callback loads twice', async ({ page }) => {
  const state = await mockBackend(page)
  await passwordStep(page, state)
  await page.goto('/app/auth/callback?token_hash=link-hash-good&type=magiclink')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.goto('/app/auth/callback?token_hash=link-hash-good&type=magiclink')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  expect(state.verifyCalls).toBe(1)
})

test('(b3) a link that went to the home page (redirect not allowed) still signs in through the forwarder', async ({ page }) => {
  const state = await mockBackend(page)
  await passwordStep(page, state)
  await page.goto('/?code=pkce-good')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  expect(state.pkceExchanges).toHaveLength(1)
})

test('(c) an old or expired link → the code screen with a clear message, never the start', async ({ page }) => {
  const state = await mockBackend(page)
  await passwordStep(page, state)
  for (const link of [
    '/app/auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    '/app/auth/callback?code=pkce-used-already',
    '/app/auth/callback?token_hash=old-hash&type=magiclink',
    '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
  ]) {
    await page.goto(link)
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
    await expect(page.getByRole('alert')).toHaveText(/That sign-in link has expired or was already used\. Enter the 6-digit code/)
    await expect(page).toHaveURL(/\/app\/?$/)
  }
})

test('(c2) an expired link with no session → sign in, with the message', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/app/auth/callback#error=access_denied&error_code=otp_expired')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText(/That sign-in link has expired or was already used\. Sign in again/)).toBeVisible()
})

test('(d) wrong code, expired code, resend after 60 s, and the email limit message', async ({ page }) => {
  await page.clock.install()
  const state = await mockBackend(page)
  await passwordStep(page, state)
  await page.getByLabel('6-digit code').fill('111111')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toHaveText("That code didn't work or has expired. Check the newest email, or send a new code.")
  const resend = page.getByRole('button', { name: /Send a new code/ })
  await expect(resend).toBeDisabled()
  await page.clock.fastForward('01:01')
  await expect(page.getByRole('button', { name: 'Send a new code' })).toBeEnabled()
  await page.getByRole('button', { name: 'Send a new code' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'New code sent' })).toBeVisible()
  expect(state.otpSends).toHaveLength(2)
  await page.getByLabel('6-digit code').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
})

test('(d2) the email limit gets a clear message', async ({ page }) => {
  const state = await mockBackend(page, { emailRateLimited: true })
  await passwordStep(page, state)
  await expect(page.getByRole('alert')).toHaveText('Too many emails, try again in a few minutes.')
})

test('(e) PIN pass and the code step both survive a page refresh', async ({ page }) => {
  const state = await mockBackend(page, { accessPass: false })
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'Company access code' })).toBeVisible()
  await page.getByLabel('Access code').fill(TEST_PIN)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect.poll(() => state.otpSends.length).toBe(1)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  expect(state.otpSends).toHaveLength(1)
  await page.getByLabel('6-digit code').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Company access code' })).toHaveCount(0)
})
