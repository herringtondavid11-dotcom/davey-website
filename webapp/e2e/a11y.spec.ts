import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'
import { PAGES } from './pages'

const SCREENS = ['/app/', '/app/transactions', '/app/connect', '/app/settings', ...PAGES.filter((p) => !p.phoneOnly).map((p) => p.path)]

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: no serious or critical issues (${scheme})`, async ({ page }) => {
    test.setTimeout(120_000)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await mockBackend(page, { signedIn: true })
    const report: string[] = []
    for (const path of SCREENS) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      for (const v of r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) {
        report.push(`${path} ${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
      }
    }
    expect(report).toEqual([])
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`axe: access code, sign-in, sign-up and forgot password (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await mockBackend(page, { accessPass: false })
    const report: string[] = []
    await page.goto('/app/access')
    const check = async (path: string) => {
      const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      for (const v of r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')) report.push(`${path} ${v.id}`)
    }
    await check('/access')
    await page.getByLabel('Access code').fill('000000')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await check('/access (error)')
    await page.getByLabel('Access code').fill('246810')
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    for (const path of ['/app/login', '/app/signup', '/app/forgot']) {
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await check(path)
    }
    expect(report).toEqual([])
  })
}
