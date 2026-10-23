import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('account mode: API_ERROR from Plaid → one fallback token, opened from a second click, both sessions logged', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true, apiErrorFirst: true })
  await page.goto('/app/connect')
  await page.getByRole('button', { name: 'Connect an account' }).click()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  // First token: unified account mode. Second: the fallback, opened on Shellpoint, still from a click.
  expect(state.linkTokenBodies.map((b) => [b.mode, b.fallback ?? false, b.institution_id ?? null])).toEqual([
    ['account', false, null],
    ['account', true, 'ins_119891'],
  ])
  expect(state.linkEvents.map((e) => e.event)).toEqual(['exit', 'fallback_retry'])
  expect(state.linkEvents[0]).toMatchObject({
    action: 'event', platform: 'web', mode: 'account', config: 'standard', error_type: 'API_ERROR', error_code: 'INTERNAL_SERVER_ERROR',
    link_session_id: 'ls-shellpoint', request_id: 'req-shellpoint', institution_id: 'ins_119891',
  })
  expect(await page.evaluate(() => (window as unknown as { __plaidOpenGestures: boolean[] }).__plaidOpenGestures)).toEqual([true, true])
  expect(problems).toEqual([])
})
