import { expect, test } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

test('Davey AI: tool loop runs in the browser and renders the answer blocks', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/recurring')
  await expect(page.getByRole('heading', { level: 1, name: 'Recurring' })).toBeVisible()
  await page.getByRole('button', { name: 'Ask AI' }).click()
  const panel = page.getByRole('dialog', { name: 'Davey AI' })
  await panel.getByRole('button', { name: 'Where can I cut back?' }).click()
  const answer = panel.locator('.bubble.assistant')
  await expect(answer.locator('li')).toHaveText(['Spotify ($11.99)', 'Equinox ($49.00)'])
  await expect(answer.locator('strong').first()).toHaveText('Spotify')
  await expect(answer.locator('.ai-card')).toHaveCount(2)
  await expect(answer.getByRole('table')).toContainText('Equinox')

  // Round 0 carried the app's view context; round 1 carried the browser's tool results.
  expect(state.aiBodies[0]).toMatchObject({ round: 0, question: 'Where can I cut back?', context: { screen: 'overview', scope: 'this_view' } })
  expect((state.aiBodies[0].context as { account_ids: string[] }).account_ids).toContain('p-1')
  const results = (state.aiBodies[1].messages as { role: string; content: { type: string; tool_use_id: string; content: string }[] }[])[1]
  expect(results.content.map((r) => r.tool_use_id)).toEqual(['tu_1', 'tu_2'])
  expect(JSON.parse(results.content[0].content).series.map((s: { merchant: string }) => s.merchant)).toContain('Netflix')
  expect(state.aiBodies[1].question_id).toBe(state.aiBodies[0].question_id)

  await answer.getByRole('button', { name: 'Open Recurring' }).click()
  await expect(page).toHaveURL(/\/app\/recurring$/)
  await expect(panel.getByRole('button', { name: 'What else could I cut?' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(problems).toEqual([])
})

test('Davey AI explains the monthly limit', async ({ page }) => {
  await mockBackend(page, { signedIn: true, ai: 'limit' })
  await page.goto('/app/budget')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await page.getByLabel('Ask a question').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'free Davey AI questions' })).toBeVisible()
})

test('Davey AI explains when ask-ai is not web-enabled yet', async ({ page }) => {
  await mockBackend(page, { signedIn: true, ai: 'down' })
  await page.goto('/app/')
  await page.getByRole('button', { name: 'Ask AI' }).click()
  await page.getByLabel('Ask a question').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert').filter({ hasText: "isn't available on the web yet" })).toBeVisible()
})
