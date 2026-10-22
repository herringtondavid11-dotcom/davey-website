import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { mockBackend, watchConsole } from './mock'

test('exports: CSV, PDF and ZIP downloads', async ({ page }) => {
  const problems = watchConsole(page)
  await mockBackend(page, { signedIn: true })
  await page.goto('/app/exports')
  await page.getByLabel('Dates').selectOption('last-year')
  await page.getByLabel('Dates').selectOption('ytd')

  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download CSV' }).click()])
  expect(csv.suggestedFilename()).toMatch(/^davey-\d{4}-01-01-to-\d{4}-\d\d-\d\d\.csv$/)
  const text = readFileSync((await csv.path())!, 'utf8')
  expect(text.split('\r\n')[0]).toBe('﻿Date,Description,Bank description,Category,Amount,Account,Business/Personal,Notes,Pending')
  expect(text).toContain('Payroll')

  const [pdf] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF' }).click()])
  const bytes = readFileSync((await pdf.path())!)
  expect(bytes.subarray(0, 8).toString('latin1')).toBe('%PDF-1.4')

  await page.getByRole('button', { name: 'Business', exact: true }).click()
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download ZIP' }).click()])
  expect(zip.suggestedFilename()).toMatch(/-business\.zip$/)
  const z = readFileSync((await zip.path())!)
  expect(z.readUInt32LE(0)).toBe(0x04034b50)
  expect(z.toString('latin1')).toContain('transactions.csv')
  await expect(page.getByRole('status')).toContainText('Downloaded')
  expect(problems).toEqual([])
})

test('tax: P&L, estimate, quarters, deduction finder, CPA package', async ({ page }) => {
  const state = await mockBackend(page, { signedIn: true })
  await page.goto('/app/tax')
  await expect(page.getByRole('heading', { name: 'Profit & loss' })).toBeVisible()
  await expect(page.locator('.stats')).toContainText('Business income')
  await expect(page.getByRole('row', { name: /Q4/ })).toBeVisible()
  await page.getByLabel('Federal bracket').fill('24')
  await expect(page.locator('.est-list')).toContainText('Federal income tax')
  const canva = page.getByRole('button', { name: /Mark Canva/ })
  await canva.click()
  await expect(canva).toHaveCount(0)
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('davey.web-edits.user-1') ?? '{}'))).transactions['txn-13'].usage).toBe('business')
  void state
  const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CPA package/ }).click()])
  const z = readFileSync((await zip.path())!).toString('latin1')
  expect(z).toContain('profit-and-loss.pdf')
  expect(z).toContain('business-transactions.csv')
})
