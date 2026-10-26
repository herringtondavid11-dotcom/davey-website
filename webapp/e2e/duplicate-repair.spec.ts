// Duplicate accounts after Refresh all (David, Raymond James, 2026-10-26): a web sync added every account Plaid
// reported, so a brokerage showed up twice and Investments doubled. Syncs no longer add accounts, and the copies an
// earlier sync left are hidden once (never deleted), with Undo.
import { expect, test } from '@playwright/test'
import { mockBackend, pushedPayloads, watchConsole } from './mock'

test('the copies an earlier sync added are hidden everywhere, with Undo', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true, strayCopies: true })
  await page.goto('/app/accounts')
  const notice = page.getByRole('status').filter({ hasText: 'Hid 2 duplicate accounts' })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText('Brokerage ••4444, Fidelity 401(k) Plan ••9401')
  // Hidden on every device (the app reads isArchived), not deleted.
  for (const id of ['acc-copy', 'acc-401k']) await expect.poll(() => pushedPayloads(state, 'account', (x) => x === id).at(-1)).toMatchObject({ isArchived: true })
  expect(state.pushes.flatMap((p) => p.p_records as { deleted: boolean }[]).some((r) => r.deleted)).toBe(false)
  await expect(page.locator('.acct-name', { hasText: /^Brokerage/ })).toHaveCount(1)
  await expect(page.locator('.acct-name', { hasText: '401(k)' })).toHaveCount(0)

  // Investments: one Brokerage, and the notice there too.
  await page.getByRole('link', { name: 'Investments' }).first().click()
  await expect(page.getByRole('heading', { name: 'Investments', level: 1 })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Hid 2 duplicate accounts' })).toBeVisible()

  // Undo brings them back and they're never hidden again.
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Hid 2 duplicate' })).toHaveCount(0)
  for (const id of ['acc-copy', 'acc-401k']) await expect.poll(() => pushedPayloads(state, 'account', (x) => x === id).at(-1)).toMatchObject({ isArchived: false, repairKept: true })
  await page.goto('/app/accounts')
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible()
  await expect(page.locator('.acct-name', { hasText: '401(k)' })).toHaveCount(1)
  await expect(page.getByRole('status').filter({ hasText: 'duplicate' })).toHaveCount(0)
  expect(problems).toEqual([])
})

test('Refresh all adds no account the household never picked', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('button', { name: 'Refresh all accounts' }).click()
  await expect(page.getByRole('region', { name: /^Refreshed/ })).toBeVisible()
  // Fidelity reports a 401(k) nobody imported: no record for it, and the brokerage it has is updated in place.
  const accountIds = state.pushes.flatMap((p) => (p.p_records as { entity: string; id: string; payload: Record<string, unknown> }[]))
    .filter((r) => r.entity === 'account').map((r) => [r.id, r.payload.externalID])
  expect(accountIds.some(([, ext]) => ext === 'p-401k')).toBe(false)
  expect(accountIds.every(([id]) => String(id).startsWith('acc-'))).toBe(true)
  await expect(page.locator('.acct-name', { hasText: '401(k)' })).toHaveCount(0)
})

test('Hide account and Unhide from the account editor, shared with the app', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  const row = page.locator('.goal-row').filter({ has: page.locator('.acct-name', { hasText: 'Travel card' }) })
  await row.locator('.acct-name').click()
  await row.getByRole('button', { name: 'Hide account' }).click()
  await expect(page.locator('.acct-name', { hasText: 'Travel card' })).toHaveCount(0)
  await expect.poll(() => pushedPayloads(state, 'account', (x) => x === 'acc-3').at(-1)?.isArchived).toBe(true)
  await page.getByRole('button', { name: /Show 1 hidden account/ }).click()
  const hidden = page.locator('.goal-row').filter({ has: page.locator('.acct-name', { hasText: 'Travel card' }) })
  await hidden.locator('.acct-name').click()
  await hidden.getByRole('button', { name: 'Unhide account' }).click()
  await expect.poll(() => pushedPayloads(state, 'account', (x) => x === 'acc-3').at(-1)?.isArchived).toBe(false)
  await expect(hidden.getByRole('button', { name: 'Hide account' })).toBeVisible()
})

// "Bank" with no name or logo (David, 2026-10-26): linked accounts whose record lost its bank connection. Opening
// Accounts syncs the banks once in the background (no billed live check) and Plaid's answer attaches them again.
test('linked accounts that lost their bank get its name and logo back without pressing anything', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, orphans: ['acc-1', 'acc-2'] })
  await page.goto('/app/accounts')
  const joint = page.locator('.goal-row').filter({ has: page.locator('.acct-name', { hasText: 'Joint checking' }) })
  await expect(joint.locator('.acct-bank-name')).toHaveText('Chase')
  await expect(joint.locator('.acct-bank img')).toBeVisible() // Chase's logo
  for (const id of ['acc-1', 'acc-2']) expect(pushedPayloads(state, 'account', (x) => x === id).at(-1)).toMatchObject({ bankConnectionID: 'bank-chase' })
  // Plaid's latest balances only: the relink never asks for a live (billed) check.
  expect(state.syncBodies.some((b) => b.realtime === true)).toBe(false)
  const saving = page.locator('.goal-row').filter({ has: page.locator('.acct-name', { hasText: 'Plaid Saving' }) })
  await expect(saving.locator('.acct-bank-name')).toHaveText('Chase')
})

// QA #3: an account whose bank connection isn't shared with the household says so, and the details say how to fix it.
test('an account from an unshared bank connection says so and how to fix it', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  const row = page.getByTestId('account-acc-7') // Blue Cash Everyday: linked on a device that never shared its bank
  await expect(row.locator('.acct-bank-name')).toHaveText('Bank not shared')
  await row.locator('.acct-name').click()
  await expect(row.getByTestId('bank-not-shared')).toContainText('Refresh all')
  await expect(row.getByRole('link', { name: 'Connect an account' })).toHaveAttribute('href', '/app/connect')
})
