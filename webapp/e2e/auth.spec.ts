import { expect, test } from '@playwright/test'
import { EMAIL, mockBackend } from './mock'

test('wrong password shows an error', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('nope')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match.")
})

test('the home page itself is not redirected', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/localhost:4173\/$/)
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
