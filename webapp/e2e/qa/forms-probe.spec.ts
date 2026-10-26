// Deep QA probe, round 4: forms under bad input, double submit, slow network and offline.
import { test } from '@playwright/test'
import { mockBackend, pushedPayloads } from '../mock'

test('forms probe', async ({ page, context }) => {
  test.setTimeout(240_000)
  page.setDefaultTimeout(8000)
  const state = await mockBackend(page, { signedIn: true })
  const out: string[] = []
  const pushesFor = (id: string) => pushedPayloads(state, 'account', (x) => x === id).length
  await page.goto('/app/accounts')
  await page.locator('main h1').first().waitFor()
  const row = page.getByTestId('account-acc-3')
  await row.locator('.acct-name').click()
  const nick = row.getByLabel(/Nickname for/)

  // Double submit (Enter twice fast).
  await nick.fill('Trips')
  const before = pushesFor('acc-3')
  await nick.press('Enter'); await nick.press('Enter')
  await page.waitForTimeout(800)
  console.log('step1');out.push(`nickname Enter×2 → ${pushesFor('acc-3') - before} pushes`)

  // Slow network: 3 s on every push.
  await page.route('**/rpc/push_household_records', async (r) => { await new Promise((x) => setTimeout(x, 3000)); await r.fallback() })
  await nick.fill('Trips slow')
  const b2 = pushesFor('acc-3')
  const t = Date.now()
  await row.getByRole('button', { name: /^Save/ }).click()
  await page.waitForTimeout(200)
  const busyText = await row.getByRole('button', { name: /Sav/ }).first().textContent()
  const disabled = await row.getByRole('button', { name: /Sav/ }).first().isDisabled()
  await row.getByRole('button', { name: /Sav/ }).first().click({ force: true }).catch(() => undefined)
  await row.getByText('Saved').waitFor({ timeout: 10_000 }).catch(() => undefined)
  out.push(`slow save: button "${busyText}" disabled=${disabled}; extra click → ${pushesFor('acc-3') - b2} pushes; done in ${Date.now() - t}ms`)
  await page.unroute('**/rpc/push_household_records')

  console.log(out.join('\n'))
  // Offline.
  await context.setOffline(true)
  await page.route('**/*supabase.co/**', (r) => r.abort('internetdisconnected'))
  await nick.fill('Offline name')
  const sb = row.getByRole('button', { name: /^Save/ })
  console.log('offline save button disabled?', await sb.isDisabled(), await sb.textContent())
  await sb.click({ timeout: 5000 }).catch((e) => console.log('click failed', String(e).slice(0, 200)))
  for (const ms of [1500, 5000, 15000]) { await page.waitForTimeout(ms === 1500 ? 1500 : ms - 1500); console.log(`offline +${ms}ms: saved ${await row.getByText('Saved').count()} name ${await row.locator('.acct-name .row-title').textContent()} pushes ${pushesFor('acc-3')} button "${await row.locator('button.btn-secondary').first().textContent()}" alert ${await row.getByRole('alert').count()}`) }
  out.push(`offline save → alert: "${await row.getByRole('alert').textContent().catch(() => 'none')}", any offline banner: ${await page.getByText(/offline|no connection|internet/i).count()}`)
  await context.setOffline(false)
  await page.unroute('**/*supabase.co/**')

  // Goal validation.
  await page.goto('/app/accounts')
  await page.locator('main h1').first().waitFor()
  const sav = page.getByTestId('account-acc-2')
  await sav.getByTestId('goal-set').click()
  for (const v of ['abc', '-5', '0', '1e9', '10,000.555']) {
    await sav.getByTestId('goal-amount').fill(v)
    out.push(`goal "${v}": save enabled=${await sav.getByTestId('goal-save').isEnabled()}, message: ${await sav.getByRole('alert').count() ? await sav.getByRole('alert').textContent() : 'none'}`)
  }
  await sav.getByTestId('goal-amount').fill('5000')
  await sav.locator('input[type=date]').fill('2001-01-01')
  out.push(`goal with past date: save enabled=${await sav.getByTestId('goal-save').isEnabled()}`)

  // Manual account validation.
  await page.goto('/app/connect')
  await page.locator('main h1').first().waitFor()
  const manual = page.getByRole('button', { name: /manual/i }).first()
  if (await manual.count()) {
    await manual.click()
    const form = page.locator('form.add-account')
    await form.getByLabel('Name').fill('Cash jar')
    await form.getByLabel(/Balance|Amount owed/).fill('abc')
    await form.getByRole('button', { name: /Add Account/ }).click()
    await page.waitForTimeout(500)
    out.push(`manual balance "abc": form still open=${await form.isVisible()}, message: ${await form.getByRole('alert').count() ? await form.getByRole('alert').textContent() : 'none'}`)
    await form.getByLabel(/Balance|Amount owed/).fill('1,250.50')
    await page.route('**/rpc/push_household_records', async (r) => { await new Promise((x) => setTimeout(x, 2000)); await r.fallback() })
    const n0 = state.pushes.length
    await form.getByRole('button', { name: /Add Account/ }).dblclick()
    await page.waitForTimeout(3000)
    out.push(`manual add double-click (slow) → ${state.pushes.length - n0} pushes`)
  } else out.push('no manual account entry on Connect')
  console.log('\n' + out.join('\n'))
})
