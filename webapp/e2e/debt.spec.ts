import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('credit cards: utilization per card and overall, avalanche plan', async ({ page }) => {
  const problems = watchConsole(page)
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/credit-cards')
  // 5,275.42 of 21,000 = 25%.
  await expect(page.locator('.util-hero')).toContainText('25%')
  await expect(page.locator('.util-hero')).toContainText('Good (under 30%)')
  const amex = page.locator('.card-line').filter({ hasText: 'Blue Cash Everyday' })
  await expect(amex).toContainText('57%')
  await expect(amex).toContainText('27.24%')
  await page.getByLabel('Monthly amount for cards').fill('1000')
  await expect(page.locator('.plan-stats')).toContainText('Blue Cash Everyday')
  await page.getByLabel('Monthly amount for cards').fill('50')
  await expect(page.getByRole('alert')).toContainText('less than the minimums')
  expect(problems).toEqual([])
})

test('loans: payoff with extra payments, refinance, equity and LTV', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/loans')
  const mortgage = page.getByRole('region', { name: 'Home Mortgage' })
  await expect(mortgage.getByLabel('Interest rate')).toHaveValue('6.25')
  await mortgage.getByLabel('Extra each month').fill('500')
  await expect(mortgage.getByText('Extra saves')).toBeVisible()
  await expect(mortgage.getByText('Loan-to-value')).toBeVisible()
  await expect(mortgage).toContainText('59.8%')
  await expect(mortgage).toContainText('no PMI needed')
  await mortgage.getByLabel('New rate').fill('5.25')
  await expect(mortgage.getByText('Break-even')).toBeVisible()
  await mortgage.getByRole('button', { name: 'Show amortization by year' }).click()
  await expect(mortgage.locator('.data-table tbody tr').first()).toBeVisible()
  // Auto loan has no equity block.
  await expect(page.getByRole('region', { name: 'Car' }).getByText('Home value')).toHaveCount(0)
})

test('investments: holdings, gain/loss and allocation', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/investments')
  await expect(page.getByRole('row', { name: /VTI/ })).toContainText('+$55,668')
  await expect(page.locator('.alloc-legend')).toContainText('ETFs')
  await expect(page.locator('.alloc-legend')).toContainText('Bonds')
})

test('investments: performance (estimated history), growth, forecast and finish-setup banner', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true, investmentsConsent: true })
  await page.goto('/app/investments')
  // Finish setting up opens update mode with Investments consent (no new connection).
  const banner = page.getByRole('region', { name: 'Finish setup' })
  await expect(banner).toContainText('Finish setting up Fidelity Investments to see holdings & history')
  await expect(banner.getByRole('link', { name: 'Finish setup' })).toHaveAttribute('href', '/app/connect?reconnect=item-fid&consent=investments')
  await expect(page.getByText('Estimated history')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Portfolio value, 1Y' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Growth' })).toBeVisible()
  // Forecast: from today's value at 6% for 10 years, then live as the inputs change.
  const value = page.getByTestId('forecast-value')
  const total = 512_640.55
  const fmt = (n: number) => '$' + Math.round(n).toLocaleString('en-US')
  await expect(value).toHaveText(fmt(total * Math.pow(1.005, 120)))
  await page.getByRole('spinbutton', { name: 'Time horizon' }).fill('15')
  await expect(value).toHaveText(fmt(total * Math.pow(1.005, 180)))
  await page.getByRole('slider', { name: 'Monthly contribution' }).fill('500')
  await expect(value).toHaveText(fmt(total * Math.pow(1.005, 180) + 500 * ((Math.pow(1.005, 180) - 1) / 0.005)))
  await expect(page.getByRole('table', { name: 'At 6%, no contributions' })).toContainText('5 years')
  await expect(page.getByText('Projection for planning only, not a guarantee.')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => state.investmentsBodies).toEqual([{ item_id: 'item-fid', refresh: true }])
})
