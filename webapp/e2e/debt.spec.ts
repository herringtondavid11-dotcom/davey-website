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
  await expect(page.getByRole('alert').filter({ hasText: 'less than the minimums' })).toBeVisible()
  expect(problems).toEqual([])
})

test('loans: payoff with extra payments, refinance, equity and LTV', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/loans')
  const mortgage = page.getByRole('region', { name: 'Home Mortgage' })
  await expect(mortgage.getByLabel('Interest rate')).toHaveValue('6.25')
  await mortgage.getByLabel('Extra each month').fill('500')
  await mortgage.getByLabel('Home value').fill('690000')
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

test('investments: account balances; holdings explained as app-only for now', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/investments')
  await expect(page.locator('.stats')).toContainText('$512,640.55')
  await expect(page.getByText('Holdings (shares and prices) show in the Davey app').first()).toBeVisible()
})
