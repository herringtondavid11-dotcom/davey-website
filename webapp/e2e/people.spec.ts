import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('household: members read from the database, remove partner, invite by link and email', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/household')
  await expect(page.locator('.member-row').first()).toContainText('AlexYou')
  await expect(page.locator('.member-row').first()).toContainText('Owner')
  await expect(page.locator('.member-row').nth(1)).toContainText('Jordan')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.locator('.member-row')).toHaveCount(1)
  await page.getByLabel('First name').fill('Riley')
  await page.getByLabel('Email (optional)').fill('riley@example.com')
  await page.getByLabel('Relationship').selectOption('partner')
  await page.getByRole('button', { name: 'Create invite link' }).click()
  await expect(page.getByLabel('Invite link')).toHaveValue('https://daveypersonalfinance.com/join?t=tok-new-123')
  expect(state.inviteBody).toMatchObject({ action: 'create', first_name: 'Riley', email: 'riley@example.com', relationship: 'partner', role: 'member', send_email: true })
  await expect(page.getByRole('heading', { name: 'Pending invites' })).toBeVisible()
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: 'Pending invites' })).toHaveCount(0)
  expect(problems).toEqual([])
})

test('household actions explain when the functions are not web-enabled yet', async ({ page }) => {
  await mockBackend(page, { signedIn: true, householdActionsDown: true })
  await page.goto('/app/household')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByText('needs a server update')).toBeVisible()
})

test('household: no household yet explains how to start', async ({ page }) => {
  await mockBackend(page, { signedIn: true, noHousehold: true })
  await page.goto('/app/household')
  await expect(page.getByText("You haven't started Household Sharing yet")).toBeVisible()
})

test('settings: profile saved to profiles (RLS), login activity, connections', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, activityFunction: true })
  await page.goto('/app/settings')
  await expect(page.getByLabel('First name')).toHaveValue('Alex')
  await page.getByLabel('First name').fill('Alexandra')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('Saved', { exact: true })).toBeVisible()
  expect(state.calls.find((c) => c.method === 'PATCH' && c.path.startsWith('/rest/v1/profiles'))?.body).toMatchObject({ first_name: 'Alexandra', last_name: 'Rivera', display_name: 'Alexandra' })
  await expect(page.getByText('Davey app on iPhone')).toBeVisible()
})

test('settings: sign out everywhere uses global scope after confirming', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  page.once('dialog', (d) => d.accept())
  await page.getByRole('button', { name: 'Sign out everywhere' }).click()
  await expect(page).toHaveURL(/\/app\/login/)
  expect(state.calls.some((c) => c.path.startsWith('/auth/v1/logout') && c.path.includes('scope=global'))).toBe(true)
})
