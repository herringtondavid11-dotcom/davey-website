// Deep QA probe, round 6: tap targets, tiny text, clipped money and contrast at 320–1920 in light and dark.
import AxeBuilder from '@axe-core/playwright'
import { test } from '@playwright/test'
import { mockBackend } from '../mock'
import { PAGES } from '../pages'

const SCREENS = ['/app/', '/app/transactions', '/app/settings', ...PAGES.map((p) => p.path)]

for (const width of [320, 390, 768, 1280, 1920]) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`responsive probe ${width} ${scheme}`, async ({ page }) => {
      test.setTimeout(240_000)
      await page.setViewportSize({ width, height: 900 })
      await page.emulateMedia({ colorScheme: scheme })
      await mockBackend(page, { signedIn: true, manualInvestments: true })
      const out: string[] = []
      for (const path of SCREENS) {
        if (path === '/app/more' && width > 768) continue
        await page.goto(path)
        await page.locator('main h1').first().waitFor()
        await page.waitForLoadState('networkidle')
        const r = await page.evaluate((w) => {
          const small: string[] = []; const tiny: string[] = []; const clipped: string[] = []
          for (const e of document.querySelectorAll<HTMLElement>('main a, main button, main [role=button], main input, main select')) {
            const b = e.getBoundingClientRect()
            if (!b.width || !b.height || getComputedStyle(e).visibility === 'hidden') continue
            if (w <= 768 && (b.height < 32 || b.width < 32) && e.tagName !== 'INPUT') small.push(`${e.tagName.toLowerCase()} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)}" ${Math.round(b.width)}×${Math.round(b.height)}`)
          }
          for (const e of document.querySelectorAll<HTMLElement>('main *')) {
            if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) continue
            if (e.closest('.visually-hidden, svg')) continue
            const fs = parseFloat(getComputedStyle(e).fontSize)
            if (fs < 11) tiny.push(`"${e.textContent!.trim().slice(0, 20)}" ${fs}px`)
            if (/\$[\d,]/.test(e.textContent!) && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible') clipped.push(`"${e.textContent!.trim().slice(0, 24)}"`)
          }
          return { small: [...new Set(small)].slice(0, 6), tiny: [...new Set(tiny)].slice(0, 4), clipped: clipped.slice(0, 4) }
        }, width)
        const axe = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze()
        const contrast = axe.violations.flatMap((v) => v.nodes.map((n) => n.target.join(' '))).slice(0, 3)
        if (r.small.length || r.tiny.length || r.clipped.length || contrast.length)
          out.push(`${path}: ${r.small.length ? 'small targets ' + r.small.join('; ') : ''}${r.tiny.length ? ' | tiny text ' + r.tiny.join('; ') : ''}${r.clipped.length ? ' | clipped $ ' + r.clipped.join('; ') : ''}${contrast.length ? ' | contrast ' + contrast.join('; ') : ''}`)
      }
      console.log(`\n== ${width} ${scheme} ==\n` + (out.join('\n') || 'clean'))
    })
  }
}
