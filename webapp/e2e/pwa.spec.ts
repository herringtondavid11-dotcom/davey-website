import { expect, test } from '@playwright/test'
import { mockBackend } from './mock'

test.use({ serviceWorkers: 'allow' })

test('PWA: manifest, icons, service worker, offline shell', async ({ page, context }) => {
  await mockBackend(page)
  await page.goto('/app/login')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/app/manifest.webmanifest')
  const manifest = await (await page.request.get(href!)).json()
  expect(manifest).toMatchObject({ start_url: '/app/', scope: '/app/', display: 'standalone', theme_color: '#1C2838' })
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).status()).toBe(200)

  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(scope).toBe('http://localhost:4173/app/')
  // Let the worker take control, then go offline: the shell still loads.
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.goto('/app/')
  await expect(page.locator('#root')).not.toBeEmpty()
  await context.setOffline(false)
})

test('PWA: service worker never caches Supabase or Plaid', async ({ page }) => {
  const sw = await (await page.request.get('/app/sw.js')).text()
  expect(sw).toContain("url.origin !== self.location.origin")
  expect(sw).not.toMatch(/supabase|plaid\.com/)
})
