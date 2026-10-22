import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('overview shows net worth, accounts with nickname and last 4, recent transactions', async ({ page }) => {
  const problems = watchConsole(page)
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  // Assets 8,420.17 + 25,000 + 512,640.55 + 12,800; debts 1,875.42 + 412,300.
  await expect(page.getByTestId('net-worth')).toHaveText('$144,685.30')
  await expect(page.getByText('Joint checking', { exact: true })).toBeVisible()
  await expect(page.getByText('Chase · •••• 0000')).toBeVisible()
  await expect(page.getByText('Plaid Saving', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Recent transactions' })).toBeVisible()
  await expect(page.getByText('Whole Foods Market').first()).toBeVisible()
  expect(problems).toEqual([])
})

test('transactions: search, filter, and edit category, notes and Business/Personal', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/transactions')
  await expect(page.getByRole('status').filter({ hasText: 'transactions' })).toContainText('55 transactions')

  await page.getByLabel('Search transactions').fill('coffee')
  await expect(page.getByRole('status').filter({ hasText: 'transaction' })).toContainText('1 transaction')
  await page.getByRole('button', { name: 'Clear filters' }).click()

  await page.getByLabel('Business / Personal').selectOption('business')
  await expect(page.getByRole('status').filter({ hasText: 'transactions' })).toContainText('9 transactions')
  await page.getByLabel('Business / Personal').selectOption('')

  await page.getByRole('button', { name: /Whole Foods Market/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Notes')).toHaveValue('Weekly shop')
  await dialog.getByLabel('Category').selectOption('Business Expenses')
  await dialog.getByLabel('Notes').fill('Team lunch supplies')
  await dialog.getByRole('button', { name: 'Business' }).click()
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  const patch = state.calls.find((c) => c.method === 'PATCH' && c.path.startsWith('/rest/v1/transactions'))
  expect(patch?.path).toContain('id=eq.txn-1')
  expect(patch?.body).toEqual({ category: 'Business Expenses', notes: 'Team lunch supplies', is_business: true })
  await expect(page.getByRole('button', { name: /Whole Foods Market/ })).toContainText('Business')
})

test('connect a bank: web link token, Plaid Link, exchange, then Name Your Accounts', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/connect')
  await page.getByRole('button', { name: 'Connect a Bank' }).last().click()
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  expect(state.linkTokenBody).toEqual({ platform: 'web', redirect_uri: 'https://daveypersonalfinance.com/app/oauth' })
  expect(state.exchangeBody).toMatchObject({ public_token: 'public-production-abc', platform: 'web' })
  expect(state.calls.some((c) => c.path === '/functions/v1/plaid-sync')).toBe(true)

  await page.getByLabel(/Platypus Checking/).fill('Emergency fund')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  await expect(page.getByText('Emergency fund', { exact: true })).toBeVisible()
  expect(state.calls.find((c) => c.method === 'PATCH' && c.path.includes('acc-new'))?.body).toEqual({ nickname: 'Emergency fund' })
  expect(problems).toEqual([])
})

test('/oauth resumes Plaid Link with receivedRedirectUri exactly once', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.addInitScript(() => {
    if (!localStorage.getItem('davey.plaid.oauth')) {
      localStorage.setItem('davey.plaid.oauth', JSON.stringify({ linkToken: 'link-production-web-123', startedAt: new Date().toISOString() }))
    }
  })
  await page.goto('/app/oauth?oauth_state_id=state-42')
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  const creates = await page.evaluate(() => (window as unknown as { __plaidCreates: unknown[] }).__plaidCreates)
  expect(creates).toEqual([{ token: 'link-production-web-123', receivedRedirectUri: 'http://localhost:4173/app/oauth?oauth_state_id=state-42' }])
  await expect(page).toHaveURL(/\/app\/oauth$/)

  // Going back to the same redirect URL must not reopen Link.
  await page.goto('/app/oauth?oauth_state_id=state-42')
  await expect(page).toHaveURL(/\/app\/connect$/)
  const after = await page.evaluate(() => (window as unknown as { __plaidCreates?: unknown[] }).__plaidCreates ?? [])
  expect(after).toEqual([])
})

test('settings: rename an account, switch theme', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  const field = page.getByRole('textbox', { name: /Plaid Saving/ })
  await field.fill('Rainy day')
  await field.locator('xpath=..').getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(state.calls.find((c) => c.method === 'PATCH' && c.path.includes('acc-2'))?.body).toEqual({ nickname: 'Rainy day' })
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('marketing site links to the app, and unknown /app paths fall back into it', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Log in' }).first()).toHaveAttribute('href', '/app/login')
  await expect(page.getByRole('link', { name: 'Get started' }).first()).toHaveAttribute('href', '/app/')
  await mockBackend(page)
  await page.goto('/app/does/not/exist')
  await expect(page).toHaveURL(/\/app\/login$/)
})

test('the app refuses to render inside a frame', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/')
  await page.setContent('<iframe src="http://localhost:4173/app/login" width="400" height="300"></iframe>')
  const frame = page.frameLocator('iframe')
  await expect(frame.locator('body')).toContainText('can only be opened directly')
})
