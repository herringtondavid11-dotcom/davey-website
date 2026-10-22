import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole, webEdits } from './mock'

test('accounts: banks from plaid-item-status, nickname + Business per account saved in this browser', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await expect(page.getByRole('heading', { name: '1 connection needs attention' })).toBeVisible()
  await expect(page.getByText('Needs you to sign in again').first()).toBeVisible()
  // Every Item was synced from the start with platform=web.
  expect(state.syncBodies.filter((b) => b.cursor === null).map((b) => b.item_id).sort()).toEqual(['item-amex', 'item-boa', 'item-capone', 'item-chase', 'item-fidelity', 'item-rocket', 'item-wf'])
  expect(state.syncBodies.every((b) => b.platform === 'web')).toBe(true)

  const saving = page.getByRole('region', { name: 'Chase' }).locator('.account-editor').filter({ hasText: 'Plaid Saving' })
  await saving.getByRole('textbox').fill('Rainy day')
  await saving.getByRole('button', { name: 'Save' }).click()
  await expect(saving.getByRole('status')).toHaveText('Saved')
  await saving.getByRole('button', { name: 'Business' }).click()
  await expect(saving.getByRole('button', { name: 'Business' })).toHaveAttribute('aria-pressed', 'true')
  expect((await webEdits(page)).accounts['p-2']).toEqual({ nickname: 'Rainy day', usage: 'business' })
  // No direct table reads: everything goes through Edge Functions.
  expect(state.calls.some((c) => c.path.startsWith('/rest/v1/'))).toBe(false)
  expect(problems).toEqual([])
})

test('a bank that fails to sync shows a banner with a fix link', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await expect(page.locator('.sync-banner')).toContainText("Wells Fargo didn't update")
})

test('Tax shows in the sidebar only when something is Business', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await expect(page.locator('.sidebar').getByRole('link', { name: 'Tax' })).toBeVisible()
})

test('reconnect uses update mode and re-syncs without a new exchange', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('link', { name: 'Reconnect' }).first().click()
  await expect(page.getByRole('heading', { name: /is reconnected/ })).toBeVisible()
  expect(state.linkTokenBody).toMatchObject({ platform: 'web', item_id: 'item-wf', mode: 'update' })
  expect(state.calls.some((c) => c.path === '/functions/v1/plaid-exchange')).toBe(false)
})

test('reconnect stops safely when the server has no update mode', async ({ page }) => {
  await mockBackend(page, { signedIn: true, noUpdateMode: true })
  await page.goto('/app/connect?reconnect=item-wf')
  await expect(page.getByRole('alert')).toContainText('needs a server update')
})

test('connection help: Report to Plaid via link-support', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/help?institution=Wells%20Fargo')
  await page.getByText('My bank opens a new window').click()
  await expect(page.getByText('Allow pop-ups')).toBeVisible()
  await expect(page.getByLabel('Bank', { exact: true })).toHaveValue('Wells Fargo')
  await page.getByLabel('What happened').selectOption('Missing transactions')
  await page.getByLabel('Details').fill('Nothing since Monday')
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByRole('status')).toContainText('your report was sent')
  expect(state.reportBody).toMatchObject({ action: 'report', institution_name: 'Wells Fargo', issue: 'Missing transactions: Nothing since Monday', app_version: 'web' })
})

test('connection help: falls back to email when link-support is unreachable', async ({ page }) => {
  await mockBackend(page, { signedIn: true, reportDown: true })
  await page.goto('/app/help')
  await page.getByLabel('Bank', { exact: true }).fill('Ally')
  await page.route('mailto:*', (r) => r.abort())
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByText('Your email app should open')).toBeVisible()
  const mailto = (await page.getByRole('link', { name: 'open it here' }).getAttribute('href')) ?? ''
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
