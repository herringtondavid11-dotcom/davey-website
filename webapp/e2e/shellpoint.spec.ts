import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('loans mode: API_ERROR from Plaid → one automatic retry with the fallback token, both sessions logged', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true, apiErrorFirst: true })
  await page.goto('/app/connect')
  await page.getByRole('button', { name: 'Connect a Mortgage or Loan' }).click()
  await expect(page.getByRole('heading', { name: 'Name your accounts' })).toBeVisible()
  // First token: loans mode, standard config. Second: the fallback, opened on Shellpoint.
  expect(state.linkTokenBodies.map((b) => [b.mode, b.fallback ?? false, b.institution_id ?? null])).toEqual([
    ['loans', false, null],
    ['loans', true, 'ins_119891'],
  ])
  expect(state.linkEvents.map((e) => e.event)).toEqual(['exit', 'fallback_retry'])
  expect(state.linkEvents[0]).toMatchObject({
    action: 'event', platform: 'web', mode: 'loans', config: 'standard', error_type: 'API_ERROR', error_code: 'INTERNAL_SERVER_ERROR',
    link_session_id: 'ls-shellpoint', request_id: 'req-shellpoint', institution_id: 'ins_119891',
  })
  expect(problems).toEqual([])
})
