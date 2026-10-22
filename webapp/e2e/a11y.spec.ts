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

test('axe: sign-in and 2-step screens', async ({ page }) => {
  await mockBackend(page)
  await page.goto('/app/login')
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id)).toEqual([])
})
