import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('household: members with roles, change a role, invite link', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true, inviteFunction: true })
  await page.goto('/app/household')
  await expect(page.locator('.member-row').first()).toContainText('AlexYou')
  await expect(page.locator('.member-row').first()).toContainText('Owner')
  await page.getByLabel('Role for Jordan').selectOption('viewer')
  await expect.poll(() => state.calls.find((c) => c.method === 'PATCH' && c.path.startsWith('/rest/v1/household_members'))?.body).toEqual({ role: 'viewer' })
  await expect(page.getByRole('heading', { name: 'Pending invites' })).toBeVisible()
  await page.getByLabel('First name').fill('Riley')
  await page.getByRole('radio', { name: /View only/ }).check()
  await page.getByRole('button', { name: 'Create invite link' }).click()
  await expect(page.getByLabel('Invite link')).toHaveValue('https://daveypersonalfinance.com/join?t=tok-new-123')
  expect(state.inviteBody).toMatchObject({ platform: 'web', first_name: 'Riley', role: 'viewer' })
  expect(problems).toEqual([])
})

test('household: invite explains when the server function is missing', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/household')
  await page.getByRole('button', { name: 'Create invite link' }).click()
  await expect(page.getByRole('alert')).toContainText('needs a server update')
})

test('settings: profile name, login activity, connection issues', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, activityFunction: true })
  await page.goto('/app/settings')
  await page.getByLabel('Name').fill('Alex Rivera')
  await page.getByRole('button', { name: 'Save name' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(state.calls.find((c) => c.method === 'PUT' && c.path === '/auth/v1/user')?.body).toMatchObject({ data: { full_name: 'Alex Rivera' } })
  await expect(page.getByText('Davey app on iPhone')).toBeVisible()
  await expect(page.getByText('Password changed', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Connections' }).getByText('Wells Fargo', { exact: true })).toBeVisible()
})

test('settings: sign out everywhere uses global scope after confirming', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect(page).toHaveURL(/\/app\/login/)
  expect(state.calls.some((c) => c.path.startsWith('/auth/v1/logout') && c.path.includes('scope=global'))).toBe(true)
})
