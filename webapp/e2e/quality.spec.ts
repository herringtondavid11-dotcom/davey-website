import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

async function box(page: import('@playwright/test').Page, selector: string) {
  const r = await page.locator(selector).first().boundingBox()
  expect(r, selector).not.toBeNull()
  return r!
}

test('a 1920px window uses the wide column and gives net worth two of three columns', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  const pageBox = await box(page, '.page')
  const main = await box(page, '.main')
  const net = await box(page, '.nw-trend')
  const week = await box(page, 'section:has(#week)')
  expect(pageBox.width).toBeGreaterThanOrEqual(1500)
  expect(pageBox.width).toBeLessThanOrEqual(main.width)
  expect(net.width).toBeGreaterThan(week.width * 1.5)
  expect(net.width).toBeLessThan(pageBox.width * 0.85)
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed').length)
  expect(overflow).toBe(0)
})

test('a 1440px laptop keeps the net worth chart on its own row', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible()
  const pageBox = await box(page, '.page')
  const net = await box(page, '.nw-trend')
  expect(net.width).toBeGreaterThan(pageBox.width * 0.9)
})

test('overview section links are at least 44px tall', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  const link = page.getByRole('link', { name: 'Details' })
  await expect(link).toBeVisible()
  const r = await link.boundingBox()
  expect(r!.height).toBeGreaterThanOrEqual(44)
  await expect(page.locator('.ai-fab')).toBeHidden()
  await expect(page.locator('.tabbar').getByRole('button', { name: 'Ask' })).toBeVisible()
})

test('transactions say to choose a row, on desktop and on a phone', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/app/transactions')
    await expect(page.getByRole('heading', { name: 'Transactions' })).toBeVisible()
    await expect(page.getByText('Choose a transaction to change its category, notes, or Business/Personal.')).toBeVisible()
  }
})
