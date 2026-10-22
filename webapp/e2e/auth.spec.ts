import { expect, test } from '@playwright/test'
import { EMAIL, EMAIL_CODE, PASSWORD, mockBackend, watchConsole } from './mock'

async function signIn(page: import('@playwright/test').Page) {
  await page.goto('/app/')
  await expect(page).toHaveURL(/\/app\/login$/)
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
}

test('wrong password shows an error', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('nope')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match.")
})

test('sign in: password, then the code emailed to the account (no QR code, no authenticator app)', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { mfa: 'none' })
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await expect(page.getByText('a•••@example.com')).toBeVisible()
  await expect(page.getByAltText(/QR code/)).toHaveCount(0)
  // One code is sent, to the account's own address, without creating accounts.
  expect(state.otpSends).toEqual([expect.objectContaining({ email: EMAIL, create_user: false })])
  await page.getByLabel('Code from the email').fill('11111111')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toContainText("didn't work")
  await page.getByLabel('Code from the email').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  expect(state.factors.filter((f) => f.status === 'unverified')).toEqual([])
  expect(problems).toEqual([])
})

test('email code: reload does not send a second code; resend waits 60 seconds', async ({ page }) => {
  const state = await mockBackend(page)
  await signIn(page)
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  expect(state.otpSends).toHaveLength(1)
  await expect(page.getByRole('button', { name: /Send a new code in \d+s/ })).toBeDisabled()
})

test('email code: the email limit gets a clear message', async ({ page }) => {
  await mockBackend(page, { emailRateLimited: true })
  await signIn(page)
  await expect(page.getByRole('alert')).toHaveText('Too many emails, try again in a few minutes.')
})

test('Settings shows 2-step as an emailed code (no recovery key, no authenticator)', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  await expect(page.getByText(/a code is emailed to alex@example.com at each sign-in/)).toBeVisible()
  await expect(page.getByText(/Recovery key|authenticator app/)).toHaveCount(0)
})

test('sign out is local only and returns to sign in', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  await page.getByRole('button', { name: 'Sign out', exact: true }).last().click()
  await expect(page).toHaveURL(/\/app\/login/)
  const logout = state.calls.find((c) => c.path.startsWith('/auth/v1/logout'))
  expect(logout?.path).toContain('scope=local')
})

test('30 minutes idle signs out, with a warning first', async ({ page }) => {
  await page.clock.install()
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.clock.fastForward('28:30')
  await expect(page.getByRole('alertdialog')).toContainText('Still there?')
  await page.clock.fastForward('02:00')
  await expect(page.getByText('You were signed out after 30 minutes without activity.')).toBeVisible()
})

test('forgot password sends a reset link to /app/reset', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/app/login')
  await page.getByRole('link', { name: 'Forgot password?' }).click()
  // The reset screen is code-split: wait for it, or the email goes into the sign-in form being replaced.
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('reset link is on its way')
  const recover = state.calls.find((c) => c.path.startsWith('/auth/v1/recover'))
  expect(decodeURIComponent(recover!.path)).toContain('redirect_to=https://daveypersonalfinance.com/app/reset')
})

test('reset link with token_hash (it already proves the email) goes straight to a new password', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/app/reset?token_hash=good-hash&type=recovery')
  await page.getByLabel('New password', { exact: true }).fill('a much better password')
  await page.getByLabel('Confirm new password').fill('a much better password')
  await page.getByRole('button', { name: 'Save password' }).click()
  await expect(page.getByText('Password updated.')).toBeVisible()
  expect(state.calls.find((c) => c.method === 'PUT' && c.path === '/auth/v1/user')?.body).toMatchObject({ password: 'a much better password' })
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
})

test('an expired reset link says so', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/app/reset?token_hash=old&type=recovery')
  await expect(page.getByRole('heading', { name: 'This link was already used or has expired' })).toBeVisible()
})

const fakeJwt = (sub: string) => {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, email: EMAIL, role: 'authenticated', aal: 'aal1', amr: [{ method: 'recovery', timestamp: Math.floor(Date.now() / 1000) }], exp: Math.floor(Date.now() / 1000) + 3600, session_id: 'sess-r' })}.sig`
}

test('a reset link Supabase already verified (#access_token) goes straight to a new password, never verifying again', async ({ page }) => {
  const state = await mockBackend(page)
  // The marketing page receives Supabase's redirect and hands the session to Davey on the web.
  await page.goto(`/auth/reset#access_token=${fakeJwt('user-1')}&refresh_token=refresh-1&expires_in=3600&token_type=bearer&type=recovery`)
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  await expect(page).toHaveURL(/\/app\/reset$/)
  expect(state.calls.filter((c) => c.path.startsWith('/auth/v1/verify'))).toEqual([])
})

test('a used reset link explains why and offers a new one (no verify, no app hand-off)', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/auth/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByRole('heading', { name: 'This link was already used or has expired' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Send a new reset link' })).toHaveAttribute('href', '/app/forgot')
  expect(state.calls.filter((c) => c.path.startsWith('/auth/v1/verify'))).toEqual([])
})

test('a token_hash reset link is not verified again when a session already exists', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/reset?token_hash=good-hash&type=recovery')
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
  expect(state.calls.filter((c) => c.path.startsWith('/auth/v1/verify'))).toEqual([])
})

test('forgot password explains the email limit', async ({ page }) => {
  await mockBackend(page, { emailRateLimited: true })
  await page.goto('/app/forgot')
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('alert')).toHaveText('Too many emails, try again in a few minutes.')
})
