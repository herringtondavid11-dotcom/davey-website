// Deep QA probe: how many backend requests a cold load and a Refresh all make with 10k transactions.
import { test } from '@playwright/test'
import { mockBackend } from '../mock'

test('request counts, 10k transactions', async ({ page }) => {
  test.setTimeout(120_000)
  await mockBackend(page, { signedIn: true, bulkTransactions: 10_000 })
  const counts = new Map<string, number>()
  page.on('request', (r) => { const u = new URL(r.url()); if (!u.hostname.includes('supabase')) return; const k = `${r.method()} ${u.pathname}${u.searchParams.get('entity') ? '?' + u.searchParams.get('entity') : ''}`; counts.set(k, (counts.get(k) ?? 0) + 1) })
  await page.goto('/app/')
  await page.locator('main h1').first().waitFor()
  await page.waitForLoadState('networkidle')
  console.log('cold load:', JSON.stringify([...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)))
  counts.clear()
  await page.goto('/app/accounts')
  await page.waitForLoadState('networkidle')
  counts.clear()
  await page.getByRole('button', { name: 'Refresh all accounts' }).click()
  await page.getByRole('region', { name: /^Refreshed/ }).waitFor({ timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  console.log('refresh all:', JSON.stringify([...counts].sort((a, b) => b[1] - a[1]).slice(0, 12)))
})
