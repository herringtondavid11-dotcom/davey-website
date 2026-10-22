import { expect, test, type Page } from '@playwright/test'
import { mockBackend } from './mock'

/** Contrast of the focused element's focus indicator (outline, or border for inputs) against what's behind it. */
async function focusContrast(page: Page): Promise<number> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const cs = getComputedStyle(el)
    const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 ? cs.outlineColor : cs.borderTopColor
    const lum = (c: string) => {
      const [r, g, b] = (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number).map((v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    let node: HTMLElement | null = el.parentElement
    let bg = 'rgb(255, 255, 255)'
    while (node) {
      const c = getComputedStyle(node).backgroundColor
      if (c && !/rgba\(.*, 0\)|transparent/.test(c)) { bg = c; break }
      node = node.parentElement
    }
    const [a, b] = [lum(ring), lum(bg)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`keyboard focus is visible at 3:1 or more (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    await mockBackend(page, { accessPass: false })
    await page.goto('/app/access')
    await page.getByLabel('Access code').focus()
    expect(await focusContrast(page), 'access code field').toBeGreaterThanOrEqual(3)
    const results: string[] = []
    // Signed in: a sidebar link (navy) and a page button (card).
    await mockBackend(page, { signedIn: true })
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/app/budget')
    await page.locator('.sidebar a', { hasText: 'Overview' }).focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const sidebar = await focusContrast(page)
    if (sidebar < 3) results.push(`sidebar ${sidebar.toFixed(2)}`)
    await page.getByRole('button', { name: 'Personal' }).focus()
    await page.keyboard.press('Shift+Tab')
    await page.keyboard.press('Tab')
    const pageButton = await focusContrast(page)
    if (pageButton < 3) results.push(`page button ${pageButton.toFixed(2)}`)
    expect(results).toEqual([])
  })
}
