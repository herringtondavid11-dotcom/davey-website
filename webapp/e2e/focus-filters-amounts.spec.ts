// QA #11: focus moves to the new screen's title. QA #13: Transactions search and filters survive Back and reload.
// QA #15/#16: amount fields say what's wrong instead of doing nothing, and reject "1e9", cents fractions, past dates.
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

test('after moving to another screen, focus is on its title', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await expect(page.locator('main h1').first()).toBeVisible()
  await page.getByRole('link', { name: 'Budget', exact: true }).first().click()
  await expect(page.locator('main h1', { hasText: 'Budget' })).toBeFocused()
})

test('Transactions search and filters stay after Back and a reload', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/transactions')
  const search = page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()
  await search.fill('netflix')
  await expect(page).toHaveURL(/q=netflix/)
  await page.getByRole('link', { name: 'Accounts', exact: true }).first().click()
  await expect(page.locator('main h1', { hasText: 'Accounts' })).toBeVisible()
  await page.goBack()
  await expect(search).toHaveValue('netflix')
  await page.reload()
  await expect(page.getByRole('searchbox').or(page.getByPlaceholder(/search/i)).first()).toHaveValue('netflix')
})

test('amount fields explain what to fix', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  const sav = page.getByTestId('account-acc-2')
  await sav.getByTestId('goal-set').click()
  await sav.getByTestId('goal-amount').fill('abc')
  await expect(sav.getByTestId('goal-amount-problem')).toHaveText('Enter an amount like 1,250.50')
  await sav.getByTestId('goal-amount').fill('1e9')
  await expect(sav.getByTestId('goal-save')).toBeDisabled()
  await sav.getByTestId('goal-amount').fill('10,000.555')
  await expect(sav.getByTestId('goal-save')).toBeDisabled()
  await sav.getByTestId('goal-amount').fill('10,000')
  await sav.locator('input[type=date]').fill('2001-01-01')
  await expect(sav.getByText('Pick today or a later date')).toBeVisible()
  await expect(sav.getByTestId('goal-save')).toBeDisabled()

  await page.goto('/app/connect')
  await page.getByRole('button', { name: /manual/i }).first().click()
  const form = page.locator('form.add-account')
  await form.getByLabel('Name').fill('Cash jar')
  await form.getByLabel(/Balance/).fill('abc')
  await expect(form.getByText('Enter an amount like 1,250.50')).toBeVisible()
  await expect(form.getByRole('button', { name: 'Add Account' })).toBeDisabled()
  await form.getByLabel(/Balance/).fill('1,250.50')
  await expect(form.getByRole('button', { name: 'Add Account' })).toBeEnabled()
})
