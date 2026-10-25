// Account categories (2026-10-25): Bank / Account / Category / Balance / Goal / Funded, rolled up by category with a
// pie, and the category shared with the iPhone and Mac (household record field rollupCategory).
import { expect, test } from '@playwright/test'
import { mockBackend, pushedPayloads, watchConsole } from './mock'

test('set a category in the table; accounts roll up by category with subtotals and a pie', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Table' }).click()
  const table = page.getByRole('table')
  await expect(table.getByRole('columnheader')).toHaveText(['Bank', 'Account', 'Category', 'Balance', 'Goal', 'Funded'])

  // Uncategorized accounts roll up by type until given a category.
  await expect(table.getByRole('rowheader', { name: 'Cash', exact: true })).toBeVisible()
  const studio = page.getByLabel('Category for Studio')
  await studio.fill('Ops Cash')
  await studio.press('Enter')
  await expect.poll(() => pushedPayloads(state, 'account', (id) => id === 'acc-6').at(-1)?.rollupCategory).toBe('Ops Cash')
  // The rest of the record goes back unchanged (the app's fields stay intact).
  expect(pushedPayloads(state, 'account', (id) => id === 'acc-6').at(-1)).toMatchObject({ nickname: 'Studio', type: 'checking', isBusiness: true })

  const joint = page.getByLabel('Category for Joint checking')
  await joint.fill('ops cash') // same category, any case
  await joint.press('Enter')
  await expect(table.getByRole('rowheader', { name: 'Ops Cash', exact: true })).toBeVisible()
  const subtotal = table.locator('tr.subtotal', { has: page.getByRole('rowheader', { name: 'Ops Cash', exact: true }) })
  await expect(subtotal).toContainText('$21,220.17') // $12,800.00 + $8,420.17
  // Typed in another case, saved with the spelling already in use.
  await expect.poll(() => pushedPayloads(state, 'account', (id) => id === 'acc-1').at(-1)?.rollupCategory).toBe('Ops Cash')

  // Remembered across visits; the pie shows the category with its share.
  await page.reload()
  await expect(page.getByRole('table')).toBeVisible()
  const pie = page.getByRole('region', { name: 'By category' })
  await expect(pie.getByRole('img')).toHaveAttribute('aria-label', /Ops Cash \d+%/)
  await expect(pie.getByRole('list', { name: 'Balances by category' })).toContainText('Ops Cash')
  expect(problems).toEqual([])
})

test('list view: sections by category with totals; By type restores the type groups', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('button', { name: /Studio/ }).click()
  const field = page.getByLabel('Category for Studio')
  await field.fill('Business')
  await field.blur()
  await expect(page.getByRole('region', { name: 'Business' })).toContainText('Studio')
  await expect(page.getByRole('region', { name: 'Business' }).locator('.group-total')).toContainText('$12,800.00')
  await page.getByRole('group', { name: 'Group by' }).getByRole('button', { name: 'By type' }).click()
  await expect(page.getByRole('region', { name: 'Business' })).toHaveCount(0)
  await expect(page.getByRole('region', { name: 'Cash' })).toContainText('Studio')
})

test('phone width: the table scrolls inside its card, the page does not', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/accounts')
  await page.getByRole('group', { name: 'Layout' }).getByRole('button', { name: 'Table' }).click()
  await expect(page.getByRole('table')).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
