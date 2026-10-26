// QA #22: on phones every button has a 44 px hit area. QA #18: when the household's data can't load, Connection help
// and Settings still work (with a banner); data screens show the error with Try again.
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

test('buttons are at least 44 px tall on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockBackend(page, { signedIn: true })
  for (const path of ['/app/accounts', '/app/budget', '/app/settings', '/app/exports']) {
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    await page.waitForLoadState('networkidle')
    const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main button, main .btn')]
      .filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && b.height < 44 && !e.closest('.cal-grid, .calendar') })
      .map((e) => `${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)} ${Math.round(e.getBoundingClientRect().height)}px`))
    expect(small, path).toEqual([])
  }
})

test("Connection help and Settings still work when the data can't load", async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.route('**/rest/v1/household_records**', (r) => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }))
  await page.goto('/app/help')
  await expect(page.getByRole('heading', { name: 'Connection help', level: 1 })).toBeVisible()
  await expect(page.getByRole('alert').first()).toContainText("Couldn't load your data")
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.goto('/app/settings')
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  await page.goto('/app/budget')
  await expect(page.getByRole('heading', { name: "Can't show your accounts right now", level: 1 })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Your data is safe.')
})
