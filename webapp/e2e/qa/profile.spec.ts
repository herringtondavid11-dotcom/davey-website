import { test } from '@playwright/test'
import { mockBackend } from '../mock'
test('profile a screen open', async ({ page }) => {
  test.setTimeout(120_000)
  const target = process.env.SCREEN ?? '/app/investments'
  await page.setViewportSize({ width: 1440, height: 900 })
  await mockBackend(page, { signedIn: true, bulkTransactions: 10_000 })
  await page.goto('/app/'); await page.locator('main h1').first().waitFor(); await page.waitForLoadState('networkidle')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start')
  await page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')) }, target)
  await page.locator('main h1').first().waitFor(); await page.waitForLoadState('networkidle'); await page.waitForTimeout(300)
  const { profile } = await cdp.send('Profiler.stop') as { profile: { nodes: { id: number; callFrame: { functionName: string; url: string; lineNumber: number; columnNumber: number }; hitCount: number; children?: number[] }[]; samples: number[]; timeDeltas: number[] } }
  // self time per node
  const dt = new Map<number, number>()
  profile.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0)))
  const byFn = new Map<string, number>()
  for (const n of profile.nodes) {
    const t = (dt.get(n.id) ?? 0) / 1000
    if (!t) continue
    const f = n.callFrame
    const key = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}:${f.columnNumber + 1}`
    byFn.set(key, (byFn.get(key) ?? 0) + t)
  }
  console.log([...byFn].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `${v.toFixed(1)}ms ${k}`).join('\n'))
})
