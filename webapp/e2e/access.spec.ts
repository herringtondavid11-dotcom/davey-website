import { expect, test } from '@playwright/test'
import { EMAIL, EMAIL_CODE, PASSWORD, TEST_PASS, TEST_PIN, mockBackend, watchConsole } from './mock'

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
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  expect(state.calls.some((c) => c.path.startsWith('/auth/v1/signup'))).toBe(false)
})

test('a deep link survives the access code, sign-in and 2-step code', async ({ page }) => {
  await mockBackend(page, { accessPass: false })
  await page.goto('/app/budget')
  await expect(page.getByRole('heading', { name: 'Company access code' })).toBeVisible()
  await page.getByLabel('Access code').fill(TEST_PIN)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/app\/login\?next=%2Fbudget$/)
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Code from the email').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/app\/budget$/)
  await expect(page.getByRole('heading', { name: 'Budget', level: 1 })).toBeVisible()
})

test('after the first sign-in, the access pass is cleared from the account metadata', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, passInMetadata: true })
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect.poll(() => state.metadata.access_pass).toBeUndefined()
  expect(state.metadata.first_name).toBe('Alex')
})

test('a Plaid OAuth return keeps its full query through the access code, sign-in and 2-step code, then resumes Link', async ({ page }) => {
  await mockBackend(page, { accessPass: false })
  // Link was started on this browser before the bank's OAuth page (the pending token survives the trip).
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('davey.plaid.oauth', JSON.stringify({ linkToken: 'link-production-web-123', startedAt: new Date().toISOString() }))
    }
  })
  const query = '?oauth_state_id=state-77&extra=a%2Bb'
  await page.goto(`/app/oauth${query}`)
  await expect(page.getByRole('heading', { name: 'Company access code' })).toBeVisible()
  const accessUrl = new URL(page.url())
  expect(accessUrl.pathname).toBe('/app/access')
  expect(accessUrl.searchParams.get('next')).toBe(`/login?next=${encodeURIComponent(`/oauth${query}`)}`)

  await page.getByLabel('Access code').fill(TEST_PIN)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(new URL(page.url()).searchParams.get('next')).toBe(`/oauth${query}`)

  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Code from the email').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()

  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  const creates = await page.evaluate(() => (window as unknown as { __plaidCreates: unknown[] }).__plaidCreates)
  expect(creates).toEqual([{ token: 'link-production-web-123', receivedRedirectUri: `http://localhost:4173/app/oauth${query}` }])
})

test('signed out for inactivity while at the bank: after signing back in, the OAuth return still resumes Link', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1')
      // 40 minutes at the bank: the 30-minute idle limit has passed.
      localStorage.setItem('davey.lastActive', String(Date.now() - 40 * 60_000))
      localStorage.setItem('davey.plaid.oauth', JSON.stringify({ linkToken: 'link-production-web-123', startedAt: new Date(Date.now() - 41 * 60_000).toISOString(), userId: 'user-1' }))
    }
  })
  await page.goto('/app/oauth?oauth_state_id=state-88')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('You were signed out after 30 minutes without activity.')).toBeVisible()
  await page.getByLabel('Email').fill(EMAIL)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.getByLabel('Code from the email').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  const creates = await page.evaluate(() => (window as unknown as { __plaidCreates: unknown[] }).__plaidCreates)
  expect(creates).toEqual([{ token: 'link-production-web-123', receivedRedirectUri: 'http://localhost:4173/app/oauth?oauth_state_id=state-88' }])
})

test("an OAuth return never resumes another user's bank connection", async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      sessionStorage.setItem('seeded', '1')
      localStorage.setItem('davey.plaid.oauth', JSON.stringify({ linkToken: 'link-someone-else', startedAt: new Date().toISOString(), userId: 'user-2' }))
    }
  })
  await page.goto('/app/oauth?oauth_state_id=state-99')
  await expect(page.getByText('This bank connection session expired. Start again from Connect a Bank.')).toBeVisible()
  const creates = await page.evaluate(() => (window as unknown as { __plaidCreates?: unknown[] }).__plaidCreates ?? [])
  expect(creates).toEqual([])
})
