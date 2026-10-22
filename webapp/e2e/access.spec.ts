import { expect, test } from '@playwright/test'
import { EMAIL, PASSWORD, TEST_PASS, TEST_PIN, mockBackend, watchConsole } from './mock'

test('sign-in, sign-up and forgot password all need the company access code first', async ({ page }) => {
  await mockBackend(page, { accessPass: false })
  for (const path of ['/app/', '/app/login', '/app/signup', '/app/forgot']) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: 'Company access code' })).toBeVisible()
    await expect(page.getByLabel('Password')).toHaveCount(0)
  }
})

test('the right code opens sign-in and is remembered on this device', async ({ page }) => {
  const problems = watchConsole(page)
  await mockBackend(page, { accessPass: false })
  await page.goto('/app/login')
  await expect(page).toHaveURL(/\/app\/access\?next=%2Flogin$/)
  await page.getByLabel('Access code').fill('111111')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toHaveText("That code isn't right. 4 tries left before a 15-minute pause.")
  await page.getByLabel('Access code').fill(TEST_PIN)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(problems).toEqual([])
})

test('five wrong codes pause entry for 15 minutes', async ({ page }) => {
  await mockBackend(page, { accessPass: false })
  await page.goto('/app/access')
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('Access code').fill('000000')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
  }
  await expect(page.getByRole('alert')).toHaveText(/Too many wrong codes. Try again in 15 minutes./)
  await expect(page.getByLabel('Access code')).toBeDisabled()
})

test('when access codes are not deployed yet, nothing gets through', async ({ page }) => {
  await mockBackend(page, { accessPass: false, accessPinDown: true })
  await page.goto('/app/access')
  await page.getByLabel('Access code').fill(TEST_PIN)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toHaveText(/Couldn't check the code/)
  await expect(page.getByRole('heading', { name: 'Company access code' })).toBeVisible()
})

test('sign-up sends the access pass and asks to confirm the email', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/app/login')
  await page.getByRole('link', { name: 'New to Davey? Create an account' }).click()
  await page.getByLabel('First name').fill('Alex')
  await page.getByLabel('Last name').fill('Rivera')
  await page.getByLabel('Email').fill('alex@example.com')
  await page.getByLabel('Password', { exact: true }).fill('short')
  await expect(page.getByRole('alert')).toHaveText('Use at least 10 characters.')
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery')
  await page.getByLabel('Confirm password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  expect((state.signUpBody?.data as Record<string, unknown>).access_pass).toBe(TEST_PASS)
  expect(state.signUpBody?.email).toBe('alex@example.com')
})

test('sign-up shows a clear message when the email limit is hit', async ({ page }) => {
  await mockBackend(page, { emailRateLimited: true })
  await page.goto('/app/signup')
  await page.getByLabel('First name').fill('Alex')
  await page.getByLabel('Email').fill('alex@example.com')
  await page.getByLabel('Password', { exact: true }).fill('correct horse battery')
  await page.getByLabel('Confirm password').fill('correct horse battery')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('alert')).toHaveText('Too many emails, try again in a few minutes.')
})

test('an existing account signs in with its password and 2-step code (no sign-up)', async ({ page }) => {
  const state = await mockBackend(page)
  await page.goto('/app/login')
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2-step verification' })).toBeVisible()
  expect(state.calls.some((c) => c.path.startsWith('/auth/v1/signup'))).toBe(false)
})
