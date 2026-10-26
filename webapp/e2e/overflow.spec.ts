import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'
import { PAGES } from './pages'

// Responsive range 360–1920: nothing may stick out past the viewport on any screen.
const ALL = ['/app/', '/app/transactions', '/app/connect', '/app/settings', ...PAGES.map((p) => p.path)]

for (const width of [320, 360, 768, 1280, 1920]) {
  test(`no element overflows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockBackend(page, { signedIn: true })
    for (const path of ALL) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll('body *')]
          .filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed')
          .slice(0, 3)
          .map((e) => `${e.tagName.toLowerCase()}.${e.className}`),
      )
      expect(wide, `${path} at ${width}px`).toEqual([])
    }
  })
}

for (const width of [320, 360, 768, 1280, 1920]) {
  test(`signed-out screens fit at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 })
    await mockBackend(page)
    for (const path of ['/app/access', '/app/login', '/app/signup', '/app/forgot']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const wide = await page.evaluate(() =>
        [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length)
      expect(wide, `${path} at ${width}px`).toBe(0)
    }
  })
}

test('card titles stay on one line at 360px (Budgets vs actual)', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/budget')
  const title = page.locator('#bva')
  await expect(title).toBeVisible()
  const lines = await title.evaluate((e) => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight || '24')))
  expect(lines).toBe(1)
})

test('sidebar fits a short laptop window: Settings and Sign out visible without scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 700 })
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  const sidebar = page.locator('.sidebar')
  for (const name of ['Settings', 'Sign out']) {
    const box = await sidebar.getByRole(name === 'Sign out' ? 'button' : 'link', { name, exact: true }).boundingBox()
    expect(box, name).not.toBeNull()
    expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(700)
  }
})

// Word-per-line text (David, 2026-10-26: Investments › By account put each account name in a 14px grid column on a
// desktop browser). Long, realistic names on every screen at desktop widths; no text may wrap one word per line.
for (const width of [1280, 1920, 360]) {
  test(`no text wraps a word per line at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await mockBackend(page, {
      signedIn: true, manualInvestments: true,
      accountFields: {
        'acc-4': { nickname: 'Joint Taxable Brokerage Account' },
        'acc-2': { nickname: 'Emergency Fund High Yield Savings' },
        'acc-5': { nickname: 'Primary Residence Home Mortgage' },
      },
    })
    for (const path of ALL) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      const broken = await page.evaluate(() => {
        const out: string[] = []
        for (const e of document.querySelectorAll<HTMLElement>('main *')) {
          if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue
          if (e.closest('svg, [aria-hidden="true"], .visually-hidden')) continue
          const words = (e.textContent ?? '').trim().split(/\s+/).filter(Boolean)
          if (words.length < 2) continue
          const rect = e.getBoundingClientRect()
          if (!rect.width || !rect.height) continue
          const line = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.2
          const lines = Math.round(rect.height / line)
          if (lines >= 3 && lines >= words.length) out.push(`${e.tagName.toLowerCase()}.${e.className} "${words.join(' ').slice(0, 40)}" ${Math.round(rect.width)}px, ${lines} lines`)
        }
        return out.slice(0, 5)
      })
      expect(broken, `${path} at ${width}px`).toEqual([])
    }
  })
}
