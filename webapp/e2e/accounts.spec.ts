import { expect, test } from '@playwright/test'
import { mockBackend, pushedPayloads, watchConsole } from './mock'

test('accounts: nickname and Business toggle on every account, connection issues shown', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await expect(page.getByRole('heading', { name: '1 connection needs attention' })).toBeVisible()
  await expect(page.getByText('Needs you to sign in again').first()).toBeVisible()

  const row = page.getByRole('region', { name: 'Savings' }).locator('.goal-row').filter({ hasText: 'Plaid Saving' })
  await row.locator('.goal-row-head').click()
  const saving = row.locator('.account-editor')
  await saving.getByRole('textbox').fill('Rainy day')
  await saving.getByRole('button', { name: 'Save' }).click()
  await expect(saving.getByRole('status')).toHaveText('Saved')
  await saving.getByRole('button', { name: 'Business' }).click()
  await expect(saving.getByRole('button', { name: 'Business' })).toHaveAttribute('aria-pressed', 'true')
  // Written the way the app shares edits: the whole record through push_household_records.
  const pushes = pushedPayloads(state, 'account', (id) => id === 'acc-2')
  expect(pushes.map((p) => [p.nickname, p.isBusiness])).toEqual([['Rainy day', false], ['Rainy day', true]])
  expect(pushes[1]).toMatchObject({ name: 'Plaid Saving', mask: '1111', type: 'savings' })
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
  await page.getByRole('button', { name: 'Reconnect' }).click()
  await expect(page.getByRole('heading', { name: /is reconnected/ })).toBeVisible()
  expect(state.calls.some((c) => c.path === '/functions/v1/plaid-exchange')).toBe(false)
  expect(state.calls.find((c) => c.path === '/functions/v1/plaid-sync')?.body).toEqual({ item_id: 'item-wf' })
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
  await expect(page.getByText('your report was sent')).toBeVisible()
  expect(state.reportBody).toMatchObject({ action: 'report', institution_name: 'Wells Fargo', issue: 'Missing transactions: Nothing since Monday', app_version: 'web' })
})

test('connection help: falls back to email while link-support is not web-enabled', async ({ page }) => {
  await mockBackend(page, { signedIn: true, reportDown: true })
  await page.goto('/app/help')
  await page.getByLabel('Bank', { exact: true }).fill('Ally')
  await page.route('mailto:*', (r) => r.abort())
  await page.getByRole('button', { name: 'Send report' }).click()
  await expect(page.getByText('Your email app should open')).toBeVisible()
  const mailto = (await page.getByRole('link', { name: 'open it here' }).getAttribute('href')) ?? ''
  expect(decodeURIComponent(mailto)).toContain('Institution: Ally')
})

test('phone: five tabs in the app order, Ask opens Davey AI, More lists every other section', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  const bar = page.locator('.tabbar')
  await expect(bar.locator('.tab')).toHaveText(['Overview', 'Budget', 'Accounts', 'Investments', 'Ask'])
  for (const tab of await bar.locator('.tab').all()) {
    const box = (await tab.boundingBox())!
    expect(box.width).toBeGreaterThan(60)
    // The label fits its tab (no clipping at 360px).
    expect(await tab.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  }
  await bar.getByRole('link', { name: 'Accounts' }).click()
  await expect(page.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible()
  await bar.getByRole('button', { name: 'Ask' }).click()
  await expect(page.locator('#ask-ai')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('link', { name: 'More' }).click()
  for (const name of ['Transactions', 'Cash flow', 'Recurring', 'Credit cards', 'Mortgages & loans', 'Tax', 'Household', 'Exports', 'Connection help', 'Settings']) {
    await expect(page.getByRole('link', { name, exact: true })).toBeVisible()
  }
})

test('desktop sidebar: Overview, Budget, Accounts, Investments, Ask first', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await expect(page.locator('.sidebar .nav-group').first().locator('.nav-link')).toHaveText(['Overview', 'Budget', 'Accounts', 'Investments', 'Ask'])
})

test('goals: set a savings goal and a payoff goal inline; header totals % funded; synced as the app stores them', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await expect(page.getByText('Set a goal on any account')).toBeVisible()
  for (const g of ['Cash', 'Savings', 'Credit Cards', 'Loans & Mortgages', 'Investments']) await expect(page.getByRole('region', { name: g, exact: true })).toBeVisible()

  // Plaid Saving: 25,000 toward a 50,000 goal → 50% funded (Gold band).
  const saving = page.getByRole('region', { name: 'Savings' }).locator('.goal-row').filter({ hasText: 'Plaid Saving' })
  await saving.getByTestId('goal-set').click()
  await saving.getByTestId('goal-amount').fill('50,000')
  await saving.getByTestId('goal-save').click()
  await expect(saving.getByText('50% funded')).toBeVisible()
  await expect(saving.getByRole('progressbar')).toHaveClass(/band-mid/)
  await expect(page.getByTestId('goals-funded')).toHaveText('50% funded across 1 goal')

  // A card: payoff goal (0) starts at 0% paid off and remembers what's owed now.
  const card = page.getByRole('region', { name: 'Credit Cards' }).locator('.goal-row').first()
  await card.getByTestId('goal-set').click()
  await card.getByTestId('goal-save').click()
  await expect(card.getByText('0% paid off')).toBeVisible()
  await expect(card.getByTestId('goal-edit')).toHaveText('Goal: pay off')

  const pushes = pushedPayloads(state, 'account', (id) => id === 'acc-2')
  expect(pushes.at(-1)).toMatchObject({ goalTarget: 5_000_000, goalStart: null, goalTargetDate: null, name: 'Plaid Saving' })
  const cardPush = state.pushes.flatMap((p) => p.p_records as { entity: string; id: string; payload: Record<string, unknown> }[]).filter((r) => r.entity === 'account' && r.id !== 'acc-2').at(-1)!
  expect(cardPush.payload.goalTarget).toBe(0)
  expect(Number(cardPush.payload.goalStart)).toBeGreaterThan(0)

  // Remove the savings goal again.
  await saving.getByTestId('goal-edit').click()
  await saving.getByRole('button', { name: 'Remove goal' }).click()
  await expect(saving.getByTestId('goal-set')).toBeVisible()
  expect(problems).toEqual([])
})

test('accounts: sort and search', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'Name' }).click()
  await page.getByLabel('Search accounts').fill('saving')
  await expect(page.locator('.goal-row')).toHaveCount(1)
  await expect(page.locator('.goal-row')).toContainText('Plaid Saving')
})

test('Accounts tab: no Connect an account / Add Account card; the sort control is directly under the total (all widths)', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  for (const width of [360, 1280]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/accounts')
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: 'Accounts', level: 1 })).toBeVisible()
    await expect(main.getByRole('link', { name: 'Connect an account' })).toHaveCount(0)
    await expect(main.getByRole('button', { name: 'Add Account' })).toHaveCount(0)
    // The total card is followed immediately by search + the % Funded / Balance / Name sort.
    const next = await page.locator('section.goals-head').evaluate((el) => el.nextElementSibling?.className ?? '')
    expect(next).toContain('goals-tools')
    await expect(page.getByRole('group', { name: 'Sort' }).getByRole('button')).toHaveText(['% Funded', 'Balance', 'Name'])
  }
})

test('connecting and adding stay available elsewhere: sidebar, Overview, phone More, and manual add on Connect an account', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/app/accounts')
  await expect(page.locator('nav, aside').getByRole('link', { name: 'Connect an account' }).first()).toBeVisible()
  await page.goto('/app/')
  await expect(page.locator('main').getByRole('link', { name: 'Connect an account' })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/app/more')
  await expect(page.getByRole('link', { name: 'Connect an account' })).toBeVisible()
  await page.getByRole('link', { name: 'Connect an account' }).click()
  await page.getByRole('button', { name: 'Add a manual account instead' }).click()
  await page.getByLabel('Name').fill('Coin jar')
  await page.getByLabel('Balance').fill('125.50')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await expect(page.getByRole('button', { name: 'Add a manual account instead' })).toBeVisible()
  const pushed = state.pushes.flatMap((p) => p.p_records as { entity: string; payload: Record<string, unknown> }[])
  expect(pushed.some((r) => r.entity === 'account' && r.payload.name === 'Coin jar')).toBe(true)
})
