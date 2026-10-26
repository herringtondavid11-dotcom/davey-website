// Accounts › Refresh all (2026-10-25): the circular arrow syncs every bank now and says what happened per bank:
// updated (live or Plaid's latest), needs a sign-in (Reconnect), or failed. The app has the same button.
import { expect, test } from '@playwright/test'
import { mockBackend, pushedPayloads, watchConsole } from './mock'

test('Refresh all syncs every bank, shares new balances, and flags the one that needs a sign-in', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  const joint = page.locator('.goal-row').filter({ has: page.locator('.acct-name', { hasText: 'Joint checking' }) })
  await expect(joint.locator('.acct-amount')).toHaveText('$8,420.17')

  await page.getByRole('button', { name: 'Refresh all accounts' }).click()
  const results = page.getByRole('region', { name: /^Refreshed/ })
  await expect(results).toBeVisible()
  await expect(results.locator('.refresh-row')).toHaveCount(3)
  await expect(results.locator('.refresh-row', { hasText: 'Chase' })).toContainText("Updated · Plaid's latest balance (live checks are off)")
  await expect(results.locator('.refresh-row', { hasText: 'Fidelity' })).toContainText('Updated')
  const wf = results.locator('.refresh-row', { hasText: 'Wells Fargo' })
  await expect(wf).toContainText('Needs you to sign in again')
  await expect(wf.getByRole('link', { name: 'Reconnect' })).toHaveAttribute('href', '/app/connect?reconnect=item-wf')

  // Every bank was asked, with the live check requested on the first page.
  const asked = state.syncBodies.map((b) => [b.item_id, b.realtime === true])
  expect(asked).toEqual(expect.arrayContaining([['item-chase', true], ['item-fid', true], ['item-wf', true]]))
  // The new Chase balance is shared with the household (the app reads the same record) and shown.
  const pushed = pushedPayloads(state, 'account', (id) => id === 'acc-1').at(-1)!
  expect(pushed.startingBalance).toBeDefined()
  expect(pushedPayloads(state, 'bankConnection', (id) => id === 'bank-chase').at(-1)).toMatchObject({ status: 'ok', cursor: 'cursor-item-chase-2' })
  await results.getByRole('button', { name: 'Done' }).click()
  await expect(results).toHaveCount(0)
  expect(problems.filter((p) => !/409/.test(p))).toEqual([])
})

test('with live checks switched on, the results say the balance came from the bank just now', async ({ page }) => {
  await mockBackend(page, { signedIn: true, realtimeBalance: true })
  await page.goto('/app/accounts')
  await page.getByRole('button', { name: 'Refresh all accounts' }).click()
  await expect(page.getByRole('region', { name: /^Refreshed/ }).locator('.refresh-row', { hasText: 'Chase' })).toContainText('Updated · Live balance from the bank')
})

test('phone: the refresh button is in reach and the results fit', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('button', { name: 'Refresh all accounts' }).click()
  await expect(page.getByRole('region', { name: /^Refreshed/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

// QA #4 (2026-10-26): Refresh all reloaded the whole household before and after every bank (7 reloads for 3 banks).
// Now one load for all banks, saves merge onto just the records they touch, and the screen reloads once.
test('Refresh all loads the household at most twice, however many banks', async ({ page }) => {
  await mockBackend(page, { signedIn: true, bulkTransactions: 2_000 })
  await page.goto('/app/accounts')
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible()
  await page.waitForLoadState('networkidle')
  const fullLoads: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    if (u.pathname === '/rest/v1/household_records' && u.searchParams.get('entity') === 'eq.bankConnection') fullLoads.push(u.search)
  })
  await page.getByRole('button', { name: 'Refresh all accounts' }).click()
  await expect(page.getByRole('region', { name: /^Refreshed/ })).toBeVisible()
  await page.waitForLoadState('networkidle')
  expect(fullLoads.length).toBeLessThanOrEqual(2)
})
