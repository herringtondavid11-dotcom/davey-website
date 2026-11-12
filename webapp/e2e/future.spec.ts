import { expect, test, type Page } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

const netWorth = (page: Page) => page.getByTestId('future-net').locator('.stat-value')

async function changeNet(page: Page, label: string, value: string) {
  const before = await netWorth(page).innerText()
  const input = page.getByLabel(label, { exact: true })
  await input.fill(value)
  await input.blur()
  await expect(netWorth(page)).not.toHaveText(before)
}

test('future: project, adjust every control, and keep it after leaving', async ({ page }) => {
  const problems = watchConsole(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await expect(page.locator('.tabbar').getByRole('link', { name: 'Future' })).toHaveCount(0)
  const money = page.locator('.sidebar .nav-group').nth(1).locator('.nav-link')
  await expect(money.nth(0)).toHaveText('Income')
  await expect(money.nth(1)).toHaveText('Future')
  await money.nth(1).click()
  await expect(page).toHaveURL(/\/app\/future$/)
  await expect(page).toHaveTitle('Future – Davey')
  await expect(page.getByRole('heading', { level: 1, name: 'Future' })).toBeVisible()
  await expect(page.getByRole('figure', { name: 'Net worth projection' })).toBeVisible()
  await expect(page.getByTestId('future-net')).toContainText('$')
  await expect(page.getByTestId('future-year-5')).toContainText('$')
  await expect(page.getByTestId('future-year-40')).toContainText('$')

  const nominal = await netWorth(page).innerText()
  await page.getByLabel("Today's dollars").click()
  await expect(netWorth(page)).not.toHaveText(nominal)
  await page.getByLabel("Today's dollars").click()
  await expect(netWorth(page)).toHaveText(nominal)

  await changeNet(page, 'Investment return', '0')
  await changeNet(page, 'Cash yield', '0')
  await changeNet(page, 'Inflation', '0')
  await changeNet(page, 'Income growth', '0')
  await changeNet(page, 'Monthly to investments', '0')
  await changeNet(page, 'Monthly to cash', '2500')
  await changeNet(page, 'Savings rate', '0')

  await page.getByRole('button', { name: '5', exact: true }).click()
  const debts = await page.getByTestId('future-debts').locator('.stat-value').innerText()
  await page.getByLabel('Debt paydown', { exact: true }).fill('0')
  await expect(page.getByTestId('future-debts').locator('.stat-value')).not.toHaveText(debts)

  const beforeSlider = await netWorth(page).innerText()
  await page.getByRole('slider', { name: 'Investment return slider' }).fill('8')
  await expect(netWorth(page)).not.toHaveText(beforeSlider)

  await page.getByRole('button', { name: 'Add event' }).click()
  const beforeEvent = await netWorth(page).innerText()
  await page.getByLabel('Event 1 kind').selectOption({ label: 'Expense' })
  await page.getByLabel('Event 1 year').selectOption('5')
  await page.getByLabel('Event 1 amount').fill('250000')
  await expect(netWorth(page)).not.toHaveText(beforeEvent)
  await page.getByRole('button', { name: 'Remove event 1' }).click()
  await expect(page.getByLabel('Event 1 amount')).toHaveCount(0)

  await page.getByRole('button', { name: 'Reset' }).click()
  await expect(page.getByLabel('Investment return', { exact: true })).toHaveValue('7')

  await page.getByTestId('future-year-40').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('future-year-40')).toBeVisible()
  await page.getByRole('button', { name: '10', exact: true }).click()
  await expect(page.getByTestId('future-net')).toContainText('10 years')

  const chart = page.getByRole('slider', { name: 'Net worth by year' })
  await chart.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: '15', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const saved = page.waitForResponse((r) => {
    if (!r.url().includes('/rest/v1/future_settings')) return false
    const method = r.request().method()
    if (method !== 'POST' && method !== 'PATCH') return false
    return (r.request().postData() ?? '').includes('"investment_return_percent":9')
  })
  await page.getByLabel('Investment return', { exact: true }).fill('9')
  await saved
  await page.locator('.sidebar').getByRole('link', { name: 'Overview', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  await page.locator('.sidebar').getByRole('link', { name: 'Future', exact: true }).click()
  await expect(page.getByLabel('Investment return', { exact: true })).toHaveValue('9')
  await expect(page.getByRole('table', { name: 'Net worth by year' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.locator('.tabbar').getByRole('link', { name: 'Future' })).toHaveCount(0)
  await page.getByRole('link', { name: 'More' }).click()
  await expect(page.getByRole('link', { name: 'Future', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Future', exact: true }).click()
  await expect(page).toHaveURL(/\/app\/future$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Future' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Net worth by year' })).toBeVisible()
  await page.getByTestId('future-year-40').scrollIntoViewIfNeeded()
  await expect(page.getByTestId('future-year-40')).toBeVisible()
  await expect(page.getByTestId('future-year-40')).toContainText('Net worth')
  expect(problems).toEqual([])
})

test('future keeps assumptions locally when the settings table is missing', async ({ page }) => {
  const problems = watchConsole(page)
  await page.setViewportSize({ width: 1280, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.route('**/rest/v1/future_settings**', (route) => route.fulfill({
    status: 404,
    contentType: 'application/json',
    body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.future_settings' in the schema cache" }),
  }))
  await page.goto('/app/future')
  await expect(page.getByRole('heading', { level: 1, name: 'Future' })).toBeVisible()
  await expect(page.getByTestId('future-year-20')).toContainText('$')
  await page.getByLabel('Investment return', { exact: true }).fill('4')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('davey.future.hh-1') ?? '')).toContain('"investmentReturnPercent":4')
  await page.reload()
  await expect(page.getByLabel('Investment return', { exact: true })).toHaveValue('4')
  expect(problems).toEqual([])
})
