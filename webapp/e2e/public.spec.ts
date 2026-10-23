import { expect, test } from '@playwright/test'

// The marketing site's public pages (GitHub Pages, same repo): they load without errors and every link on them works.
const PUBLIC = ['/', '/help/', '/terms/', '/cancel/', '/join/', '/auth/callback/', '/auth/reset/', '/app/access']

test('public pages: no script errors, no broken links or assets', async ({ page, request }) => {
  test.setTimeout(120_000)
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`${page.url()} ${e.message}`))
  page.on('response', (r) => { if (r.status() >= 400 && new URL(r.url()).hostname === 'localhost') problems.push(`${r.status()} ${r.url()}`) })
  const links = new Set<string>()
  for (const path of PUBLIC) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBeLessThan(400)
    await page.waitForLoadState('networkidle')
    for (const href of await page.locator('a[href], link[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href') ?? ''))) {
      if (href.startsWith('/') && !href.startsWith('//')) links.add(href.split('#')[0].split('?')[0] || '/')
    }
  }
  for (const href of links) {
    const r = await request.get(href)
    if (r.status() >= 400) problems.push(`link ${href} ${r.status()}`)
  }
  expect(problems).toEqual([])
})

test('public pages: page-specific social titles, self-hosted fonts, and a keyboard chart', async ({ page }) => {
  const thirdParty: string[] = []
  page.on('request', (r) => {
    if (/fonts\.(googleapis|gstatic)\.com/.test(r.url())) thirdParty.push(r.url())
  })
  await page.goto('/')
  await expect(page.getByText('Up to 230 connected banks')).toBeVisible()
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Davey – Know where every dollar goes')
  expect(await page.locator('script[type="application/ld+json"]').textContent()).toContain('FAQPage')
  await expect(page.locator('link[href="/assets/fonts/inter-latin-400.woff2"]')).toHaveCount(1)
  expect(thirdParty).toEqual([])
  const may = page.locator('#bars button').first()
  await may.focus()
  await expect(may).toHaveAttribute('aria-label', /May:/)

  await page.setViewportSize({ width: 390, height: 800 })
  await page.getByRole('button', { name: 'Open menu' }).click()
  await expect(page.locator('#site-nav')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused()

  for (const [path, title] of [
    ['/help/', 'Help & FAQ – Davey'],
    ['/terms/', 'Terms of Service – Davey'],
    ['/cancel/', 'Cancel & Refunds – Davey'],
  ] as const) {
    await page.goto(path)
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', title)
    await expect(page.locator('meta[name="description"]')).not.toHaveAttribute('content', /Coming soon/)
  }
  await page.goto('/help/')
  const bodyLink = page.locator('main a').first()
  await bodyLink.evaluate((el) => {
    const node = el as HTMLElement & { focus: (opts?: { focusVisible?: boolean }) => void }
    node.focus({ focusVisible: true })
  })
  await expect(bodyLink).toHaveCSS('outline-color', 'rgb(138, 98, 16)')
})
