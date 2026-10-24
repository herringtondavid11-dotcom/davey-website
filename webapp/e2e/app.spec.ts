import { expect, test } from '@playwright/test'
import { pushedPayloads, mockBackend, watchConsole } from './mock'

test('overview: net worth trend, this week, cash flow, categories, budget, goals and the 5 latest transactions', async ({ page }) => {
  const problems = watchConsole(page)
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  // Assets 8,420.17 + 25,000 + 512,640.55 + 12,800 + the home 690,000 (its own Real Estate account in Davey);
  // debts 1,875.42 + 3,400 + 412,300 + 18,250.
  await expect(page).toHaveTitle('Overview – Davey')
  await expect(page.getByTestId('net-worth')).toHaveText('$813,035.30')
  for (const h of ['This week', 'Cash flow', 'Spending by category', 'Monthly budget', 'Goals', 'Recent transactions']) {
    await expect(page.getByRole('heading', { name: h, exact: true })).toBeVisible()
  }
  await expect(page.getByTestId('net-worth-change')).toContainText('6M')
  await page.getByRole('group', { name: 'Net worth range' }).getByRole('button', { name: '1Y' }).click()
  await expect(page.getByTestId('net-worth-change')).toContainText('1Y')
  await expect(page.getByRole('img', { name: /Net worth, 1Y/ }).first()).toBeVisible()
  await expect(page.getByTestId('net-savings')).toContainText('Net savings, 6 months')
  await expect(page.locator('.recent-card .list > li')).toHaveCount(5)
  // The account list moved to the Accounts tab.
  await expect(page.getByText('Chase · •••• 0000')).toHaveCount(0)
  await page.getByTestId('goals-open').click()
  await expect(page).toHaveURL(/\/app\/accounts$/)
  await expect(page).toHaveTitle('Accounts – Davey')
  expect(problems).toEqual([])
})

test('transactions: search, filter, and edit category, notes and Business/Personal', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/transactions')
  await expect(page.getByRole('status').filter({ hasText: 'transactions' })).toContainText('62 transactions')

  await page.getByLabel('Search transactions').fill('coffee')
  await expect(page.getByRole('status').filter({ hasText: 'transaction' })).toContainText('1 transaction')
  await page.getByRole('button', { name: 'Clear filters' }).click()

  // In Davey, Business or Personal belongs to the account (Studio is the business account).
  await page.getByLabel('Business / Personal').selectOption('business')
  await expect(page.getByRole('status').filter({ hasText: 'transactions' })).toContainText('12 transactions')
  await page.getByLabel('Business / Personal').selectOption('')

  await page.getByRole('button', { name: /Whole Foods Market/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('Notes')).toHaveValue('Weekly shop')
  await dialog.getByLabel('Category').selectOption('Business Expenses')
  await dialog.getByLabel('Notes').fill('Team lunch supplies')
  await dialog.getByRole('button', { name: 'Save' }).click()
  await expect(dialog).toBeHidden()

  const [pushed] = pushedPayloads(state, 'transaction', (id) => id === 'txn-1')
  expect(pushed).toMatchObject({ categoryID: 'cat-business-expenses', note: 'Team lunch supplies', payee: 'Whole Foods Market', amount: -8420 })
})

test('connect an account: one web link token, Plaid opened from the click, exchange, then Name Your Accounts', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/connect')
  await expect(page.getByRole('button', { name: 'Connect a Mortgage or Loan' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Connect investments/i })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Add a manual account instead' })).toBeVisible()
  await page.getByRole('button', { name: 'Connect an account' }).click()
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  expect(state.linkTokenBody).toEqual({ platform: 'web', redirect_uri: 'https://daveypersonalfinance.com/app/oauth', mode: 'account' })
  await expect.poll(() => state.diagnostics.length).toBeGreaterThan(0)
  const linkEvent = state.diagnostics.find((d) => d.kind === 'link_event')
  expect(linkEvent).toMatchObject({
    kind: 'link_event',
    app_version: 'web',
    payload: { event: 'TRANSITION_VIEW', view_name: 'SELECT_INSTITUTION', institution_name: 'First Platypus Bank', link_session_id: 'ls-1' },
  })
  expect(JSON.stringify(linkEvent)).not.toContain('link-production')
  expect(String((linkEvent?.payload as { user_agent?: string } | undefined)?.user_agent || '')).not.toBe('')
  expect(await page.evaluate(() => (window as unknown as { __plaidOpenGestures: boolean[] }).__plaidOpenGestures)).toEqual([true])
  expect(state.exchangeBody).toMatchObject({ public_token: 'public-production-abc', platform: 'web' })
  expect(state.syncBodies).toEqual([{ item_id: 'item-new' }])
  // The new bank is shared with the household the way the app imports one, so the iPhone and Mac get it too.
  const bank = pushedPayloads(state, 'bankConnection', () => true)
  expect(bank).toEqual([expect.objectContaining({ itemID: 'item-new', institutionName: 'First Platypus Bank', cursor: 'cursor-new', status: 'ok' })])
  const [account] = pushedPayloads(state, 'account', (_, p) => p.externalID === 'p-new-1')
  expect(account).toMatchObject({ type: 'checking', source: 'plaid', startingBalance: 150000 + 1250 })
  expect(pushedPayloads(state, 'transaction', (_, p) => p.externalID === 'ptx-1')[0]).toMatchObject({ amount: -1250, payee: 'Platypus Coffee' })

  await page.getByLabel(/Platypus Checking/).fill('Emergency fund')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  // Accounts are listed on the Accounts tab. Force the desktop sidebar; a phone uses the tab bar.
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.locator('.sidebar').getByRole('link', { name: 'Accounts' }).click()
  await expect(page.getByText('Emergency fund', { exact: true })).toBeVisible()
  expect(pushedPayloads(state, 'account', (_, p) => p.externalID === 'p-new-1').at(-1)).toMatchObject({ nickname: 'Emergency fund' })
  expect(problems).toEqual([])
})

test('an unfinished bank sign-in explains itself and can be tried again', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, plaidHold: true })
  await page.goto('/app/connect')
  await page.getByRole('button', { name: 'Connect an account' }).click()
  await expect(page.getByText('Plaid is open…')).toBeVisible()

  await page.evaluate(() => (window as unknown as { __plaidClose: (status?: string | null, institution?: string) => void }).__plaidClose('requires_oauth', 'Chase'))
  const notice = page.locator('.connect-hero .notice')
  await expect(notice).toHaveText("Chase sign-in didn't finish. Make sure pop-ups are allowed for this site, then try again.")
  await expect(notice).toHaveAttribute('role', 'status')
  await expect(page.getByRole('button', { name: 'Try again' })).toBeEnabled()
  expect(state.calls.some((c) => c.path === '/functions/v1/plaid-exchange')).toBe(false)

  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Plaid is open…')).toBeVisible()
  await expect(page.locator('.connect-hero .notice')).toHaveCount(0)

  // A different unfinished step, still with no error, uses the same explanation.
  await page.evaluate(() => (window as unknown as { __plaidClose: (status?: string | null) => void }).__plaidClose('requires_credentials'))
  await expect(page.locator('.connect-hero .notice')).toHaveText("Bank sign-in didn't finish. Make sure pop-ups are allowed for this site, then try again.")

  // Closing Link with no status still returns to the idle screen.
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('Plaid is open…')).toBeVisible()
  await page.evaluate(() => (window as unknown as { __plaidClose: (status?: string | null) => void }).__plaidClose(null))
  await expect(page.getByRole('button', { name: 'Connect an account' })).toBeVisible()
  await expect(page.getByText("sign-in didn't finish")).toHaveCount(0)
})

test('without a household, Connect an account explains instead of creating an unreachable connection', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, noHousehold: true })
  await page.goto('/app/connect')
  await expect(page.getByText(/Turn on Household Sharing/)).toBeVisible()
  expect(state.linkTokenBody).toBeNull()
  await expect(page.getByRole('button', { name: 'Add a manual account instead' })).toBeVisible()
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

test('settings: switch theme', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/settings')
  await page.getByRole('button', { name: 'Dark' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('marketing site links to the app, and unknown /app paths fall back into it', async ({ page }) => {
  await page.goto('/')
  // On a phone the header links sit in the menu until it's opened.
  const menu = page.getByRole('button', { name: 'Open menu' })
  if (await menu.isVisible()) await menu.click()
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

test("the bank limit is the server's: its message (with the live number) is shown as is, no limit on the web itself", async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, bankLimit: 230 })
  await page.goto('/app/connect')
  await expect(page.getByText("You've connected 230 banks, Davey Premium's fair-use limit. Disconnect one you no longer use, or contact support and we'll help.")).toBeVisible()
  expect(state.linkTokenBodies).toHaveLength(1)
})

test('the web never caps banks itself: Connect an account always asks the server', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/connect')
  await page.getByRole('button', { name: 'Connect an account' }).click()
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  expect(state.linkTokenBodies).toHaveLength(1)
})

test('old connect modes redirect to the one account session', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/connect?mode=loans')
  await expect(page).toHaveURL(/\/app\/connect$/)
  await page.getByRole('button', { name: 'Connect an account' }).click()
  expect(state.linkTokenBody).toMatchObject({ mode: 'account' })
  expect(state.linkTokenBody).not.toHaveProperty('mode', 'loans')
})
