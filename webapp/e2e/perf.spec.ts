import { readdirSync, readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

const ASSETS = new URL('../../app/assets/', import.meta.url)

test('bundle budget: the first download stays under 170 kB gzipped', () => {
  const html = readFileSync(new URL('../../app/index.html', import.meta.url), 'utf8')
  const first = [...html.matchAll(/\/app\/assets\/([^"]+\.(?:js|css))/g)].map((m) => m[1])
  const total = first.reduce((sum, f) => sum + gzipSync(readFileSync(new URL(f, ASSETS))).length, 0)
  expect(first.length).toBeGreaterThan(1)
  expect(total, `${first.join(', ')}`).toBeLessThan(170_000)
  expect(readdirSync(ASSETS).some((f) => f.startsWith('Overview-'))).toBe(true)
})

test('sign-in screens load no signed-in screen code', async ({ page }) => {
  await mockBackend(page)
  const scripts: string[] = []
  page.on('request', (r) => { if (r.resourceType() === 'script') scripts.push(new URL(r.url()).pathname) })
  await page.goto('/app/login')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  expect(scripts.filter((s) => /\/(Overview|Transactions|Connect|MfaEnroll)-/.test(s))).toEqual([])
})
