import { expect, test, type Page } from '@playwright/test'
import { mockBackend, watchConsole } from './mock'

/** Phones hide the floating Ask AI button; Ask is a tab. Wider windows use the button. */
async function openAsk(page: Page) {
  const fab = page.getByRole('button', { name: 'Ask AI' })
  const tab = page.locator('.tabbar').getByRole('button', { name: 'Ask' })
  await expect(fab.or(tab)).toBeVisible()
  if (await fab.isVisible()) await fab.click()
  else await tab.click()
}

test('Ask AI: suggestion sends a question with the view context and renders the answer', async ({ page }) => {
  const problems = watchConsole(page)
  const state = await mockBackend(page, { signedIn: true, aiFunction: true })
  await page.goto('/app/recurring')
  await openAsk(page)
  const panel = page.getByRole('dialog', { name: 'Davey AI' })
  await panel.getByRole('button', { name: 'Which subscriptions could I cancel?' }).click()
  await expect(panel.locator('.bubble.assistant li')).toHaveText(['Spotify ($11.99)', 'Equinox ($49)'])
  await expect(panel.locator('.bubble.assistant')).toContainText('That saves about $61 a month.')
  await expect.poll(() => state.aiBody?.question).toBe('Which subscriptions could I cancel?')
  expect(state.aiBody).toMatchObject({ question: 'Which subscriptions could I cancel?', platform: 'web', context: { view: 'recurring', platform: 'web' } })
  expect(JSON.stringify(state.aiBody)).not.toContain('0000') // no account numbers in the context
  await panel.getByLabel('Ask a question').fill('And next month?')
  await panel.getByLabel('Ask a question').press('Enter')
  await expect(panel.locator('.bubble.user')).toHaveCount(2)
  await expect.poll(() => (state.aiBody?.history as unknown[] | undefined)?.length).toBe(2)
  await page.keyboard.press('Escape')
  await expect(panel).toBeHidden()
  expect(problems).toEqual([])
})

test('Ask AI explains when the web isn\'t enabled yet, and when the limit is reached', async ({ page }) => {
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/')
  await openAsk(page)
  await page.getByLabel('Ask a question').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert')).toContainText("isn't available on the web yet")
})

test('Ask AI monthly limit message', async ({ page }) => {
  await mockBackend(page, { signedIn: true, aiFunction: 'limit' })
  await page.goto('/app/budget')
  await openAsk(page)
  await page.getByLabel('Ask a question').fill('Hi')
  await page.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByRole('alert')).toContainText("used this month's AI questions")
})
