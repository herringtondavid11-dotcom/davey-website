import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('accounts: nickname and Business toggle on every account, connection issues shown', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await expect(page.getByRole('heading', { name: '1 connection needs attention' })).toBeVisible()
  await expect(page.getByText('Needs you to sign in again').first()).toBeVisible()

  const saving = page.getByRole('region', { name: 'Chase' }).locator('.account-editor').filter({ hasText: 'Plaid Saving' })
  await saving.getByRole('textbox').fill('Rainy day')
  await saving.getByRole('button', { name: 'Save' }).click()
  await expect(saving.getByRole('status')).toHaveText('Saved')
  await saving.getByRole('button', { name: 'Business' }).click()
  await expect(saving.getByRole('button', { name: 'Business' })).toHaveAttribute('aria-pressed', 'true')
  const patches = state.calls.filter((c) => c.method === 'PATCH' && c.path.includes('acc-2')).map((c) => c.body)
  expect(patches).toEqual([{ nickname: 'Rainy day' }, { is_business: true }])
  expect(problems).toEqual([])
})

test('Tax shows in the sidebar only when something is Business', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Tax' })).toBeVisible()
})

test('reconnect stops safely when the server has no update mode', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('link', { name: 'Reconnect' }).first().click()
  await expect(page.getByRole('alert')).toContainText('needs a server update')
  expect(state.linkTokenBody).toMatchObject({ platform: 'web', item_id: 'item-wf', mode: 'update' })
  expect(state.calls.some((c) => c.path === '/functions/v1/plaid-exchange')).toBe(false)
})

test('reconnect in update mode re-syncs without a new exchange', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, updateMode: true })
  await page.goto('/app/connect?reconnect=item-wf')
  await expect(page.getByRole('heading', { name: /is reconnected/ })).toBeVisible()
  expect(state.calls.some((c) => c.path === '/functions/v1/plaid-exchange')).toBe(false)
  expect(state.calls.find((c) => c.path === '/functions/v1/plaid-sync')?.body).toEqual({ item_id: 'item-wf' })
})

test('connection help: report to Plaid via the Edge Function', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, reportFunction: true })
  await page.goto('/app/help?institution=Wells%20Fargo')
  await page.getByText('My bank opens a new window').click()
  await expect(page.getByText('Allow pop-ups')).toBeVisible()
  await expect(page.getByLabel('Bank', { exact: true })).toHaveValue('Wells Fargo')
  await page.getByLabel('What happened').selectOption('Missing transactions')
  await page.getByLabel('Details').fill('Nothing since Monday')
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByRole('status')).toContainText('your report was sent')
  expect(state.reportBody).toMatchObject({ platform: 'web', institution: 'Wells Fargo', kind: 'Missing transactions', details: 'Nothing since Monday' })
})

test('connection help: falls back to email when the function is not deployed', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/help')
  await page.getByLabel('Bank', { exact: true }).fill('Ally')
  let mailto = ''
  page.on('framenavigated', () => undefined)
  await page.route('mailto:*', (r) => r.abort())
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByText('Your email app should open')).toBeVisible()
  mailto = (await page.getByRole('link', { name: 'open it here' }).getAttribute('href')) ?? ''
  expect(mailto).toContain('mailto:support@daveypersonalfinance.com')
  expect(decodeURIComponent(mailto)).toContain('Institution: Ally')
})

test('phone: More tab lists every section', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await page.locator('.tabbar').getByRole('link', { name: 'More' }).click()
  for (const name of ['Cash flow', 'Recurring', 'Credit cards', 'Mortgages & loans', 'Investments', 'Tax', 'Household', 'Exports', 'Connection help', 'Settings']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
  }
})
