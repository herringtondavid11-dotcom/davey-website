// Sign-in is the company access code, then email and password. No emailed code is ever requested.
import { expect, test } from '@playwright/test'
import { EMAIL, PASSWORD, TEST_PIN, mockBackend, watchConsole } from './mock'

const otpCalls = (state: { calls: { path: string }[] }) => state.calls.filter((c) => c.path.startsWith('/auth/v1/otp') || c.path.startsWith('/auth/v1/verify'))

test('correct email + password → straight to Overview, no email code step, no sign-in email', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { mfa: 'none' })
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  expect(otpCalls(state)).toEqual([])
  expect(state.otpSends).toEqual([])
  expect(problems).toEqual([])
})

test('the company access code is still required before sign-in', async ({ page }) => {
  const state = await mockBackend(page, { accessPass: false })
  for (const path of ['/app/', '/app/login', '/app/signup', '/app/forgot']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Company access code' })).toBeVisible()
    await expect(page.getByLabel('Password')).toHaveCount(0)
  }
  await page.getByLabel('Access code').fill(TEST_PIN)
  await page.getByRole('button', { name: 'Continue' }).click()
  // The last gated page was forgot-password, so a successful code returns there. Wait for that
  // before opening sign-in: leaving early, before the pass is saved, lands back on the code screen.
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  expect(otpCalls(state)).toEqual([])
})

test('a wrong password still fails, and sends nothing', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill('not the password')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText("That email and password don't match.")
  await expect(page.getByRole('heading', { name: 'Overview' })).toHaveCount(0)
  expect(otpCalls(state)).toEqual([])
})

test('signed in stays signed in across a refresh, still without any email', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  expect(otpCalls(state)).toEqual([])
})

test('an old sign-in link email lands signed in (or at sign-in), never stuck on a code screen', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await page.goto('/#error=access_denied&error_code=otp_expired')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
})

test('Settings does not offer an emailed sign-in code', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  await expect(page.getByText('The company access code and your password. Davey does not email a sign-in code.')).toBeVisible()
  await expect(page.getByText(/6-digit code|emailed to/)).toHaveCount(0)
})
