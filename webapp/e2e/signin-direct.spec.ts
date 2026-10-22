// Web 2-step off (EMAIL_2FA_ENABLED=false, David 2026-10-22 4:22 PM PT): access code → email + password → Overview.
// No sign-in email is ever requested.
import { expect, test } from '@playwright/test'
import { EMAIL, EMAIL_2FA_ENABLED, PASSWORD, TEST_PIN, mockBackend, watchConsole } from './mock'

test.skip(EMAIL_2FA_ENABLED, 'web 2-step is on; see signin-proof.spec.ts')

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

test('Settings says web 2-step is off for now', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  await expect(page.getByText('Off on the web for now. Sign-in is protected by the company access code and your password.')).toBeVisible()
})
