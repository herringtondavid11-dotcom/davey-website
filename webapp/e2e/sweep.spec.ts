import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'
import { PAGES } from './pages'

const SCREENS = ['/app/', '/app/transactions', '/app/connect', '/app/settings', '/app/profile', ...PAGES.map((p) => p.path)]

test('every screen: no console errors, no broken in-app links', async ({ page, request }) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`${page.url()} ${m.text()}`) })
  page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.request().method()} ${r.url()}`) })
  page.on('pageerror', (e) => errors.push(`${page.url()} ${e.message}`))
  await mockBackend(page, { signedIn: true, activityFunction: true })
  const links = new Set<string>()
  for (const path of SCREENS) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    for (const href of await page.locator('a[href]').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''))) {
      if (href.startsWith('/') && !href.startsWith('//')) links.add(href.split('#')[0].split('?')[0] || '/')
    }
  }
  const broken: string[] = []
  for (const href of links) {
    const r = await request.get(href)
    if (r.status() >= 400) broken.push(`${href} ${r.status()}`)
  }
  expect(broken).toEqual([])
  expect(errors).toEqual([])
})

test('every screen: a server error shows a message, never a blank page or a crash', async ({ page }) => {
  test.setTimeout(120_000)
  const crashes: string[] = []
  page.on('pageerror', (e) => crashes.push(`${page.url()} ${e.message}`))
  await mockBackend(page, { signedIn: true, activityFunction: true })
  await page.route('**/rest/v1/household_records**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }))
  const blank: string[] = []
  for (const path of SCREENS) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const main = page.locator('main')
    const text = (await main.innerText().catch(() => '')).trim()
    const spinning = await page.locator('[role="status"][aria-busy="true"], .spinner').count()
    if (/boom/.test(text)) blank.push(`${path}: shows the raw server error`)
    if (text.length < 20 || (spinning > 0 && !/couldn|try again|error|went wrong/i.test(text))) blank.push(`${path}: ${text.slice(0, 80)}`)
  }
  expect(crashes).toEqual([])
  expect(blank).toEqual([])
})

test('every screen: a brand-new account (no household data yet) gets a heading and guidance, never a crash', async ({ page }) => {
  test.setTimeout(120_000)
  const problems: string[] = []
  page.on('pageerror', (e) => problems.push(`${page.url()} ${e.message}`))
  await mockBackend(page, { signedIn: true, activityFunction: true, noHousehold: true })
  for (const path of SCREENS) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    if (!(await page.getByRole('heading', { level: 1 }).isVisible())) problems.push(`${path}: no heading`)
    const text = (await page.locator('main').innerText()).trim()
    if (/NaN|undefined|Infinity|\[object/.test(text)) problems.push(`${path}: shows ${text.match(/NaN|undefined|Infinity|\[object/)![0]}`)
    if (await page.locator('.spinner, [aria-busy="true"]').count()) problems.push(`${path}: still loading`)
  }
  expect(problems).toEqual([])
})
