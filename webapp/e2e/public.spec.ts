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
