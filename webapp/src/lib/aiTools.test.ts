import { describe, expect, it, vi } from 'vitest'
import { ask } from './ai'
import { TOOL_NAMES, ToolError, runTool, type ToolData } from './aiTools'
import { normalizeAccount, normalizeTransaction } from './schema'
import { supabase } from './supabase'

const m = new Date().toISOString().slice(0, 7)
const data: ToolData = {
  accounts: [
    normalizeAccount({ id: 'chk', name: 'Checking', type: 'depository', current_balance: 5000 }),
    normalizeAccount({ id: 'cc', name: 'Card', type: 'credit', current_balance: 1000, credit_limit: 5000 }),
    normalizeAccount({ id: 'mort', name: 'Mortgage', type: 'loan', current_balance: 300000, interest_rate: 6, minimum_payment: 2000 }),
  ],
  transactions: [
    normalizeTransaction({ id: 't1', account_id: 'chk', date: `${m}-01`, amount: -4000, category: 'Paycheck', merchant_name: 'Acme' }),
    normalizeTransaction({ id: 't2', account_id: 'cc', date: `${m}-02`, amount: 120, category: 'Groceries', merchant_name: 'Safeway' }),
    normalizeTransaction({ id: 't3', account_id: 'cc', date: `${m}-03`, amount: 30, category: 'Dining Out', merchant_name: 'Cafe' }),
    normalizeTransaction({ id: 't4', account_id: 'chk', date: `${m}-04`, amount: 1000, category: 'Credit Card Payment', merchant_name: 'Card payment' }),
  ],
  scope: ['chk', 'cc', 'mort'],
}

describe('Davey AI tools on the web', () => {
  it('implements every tool the server defines (except respond)', () => {
    expect(TOOL_NAMES).toHaveLength(24)
  })
  it('balances and net worth', () => {
    expect(runTool('account_balances', {}, data)).toMatchObject({ total_assets: 5000, total_debts: 301000, net_worth: -296000 })
  })
  it('spending by category excludes transfers and income', () => {
    const r = runTool('spending_by_category', { start: `${m}-01`, end: `${m}-28` }, data) as { periods: { total: number; categories: { category: string }[] }[] }
    expect(r.periods[0].total).toBe(150)
    expect(r.periods[0].categories.map((c) => c.category)).toEqual(['Groceries', 'Dining Out'])
  })
  it('respects account scope', () => {
    const r = runTool('spending_by_category', { start: `${m}-01`, end: `${m}-28`, account_ids: ['chk'] }, data) as { periods: unknown[] }
    expect(r.periods).toEqual([])
  })
  it('loans, cards, search, errors', () => {
    expect(runTool('credit_card_summary', {}, data)).toMatchObject({ cards: [{ utilization_percent: 20 }] })
    expect((runTool('payoff_simulation', { extra: '500' }, data) as { months_saved: number }).months_saved).toBeGreaterThan(0)
    expect(runTool('search_transactions', { query: 'safe' }, data)).toMatchObject({ count: 1, ids: ['t2'] })
    expect(() => runTool('refinance_compare', {}, data)).toThrow(ToolError)
    expect(() => runTool('nope', {}, data)).toThrow(/Unknown tool/)
  })
})

describe('ask-ai tool loop', () => {
  it('runs tools locally and posts results in the next round', async () => {
    await supabase.auth.getSession()
    const bodies: Record<string, unknown>[] = []
    const sse = (events: object[]) => new Response(events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''), { status: 200 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      return body.round === 0
        ? sse([{ type: 'meta', model: 'm1' }, { type: 'tool_calls', content: [{ type: 'tool_use', id: 'a', name: 'account_balances', input: {} }] }])
        : sse([{ type: 'answer', envelope: { blocks: [{ type: 'text', text: 'Net worth is -$296,000.' }], follow_ups: [] } }])
    })
    const env = await ask('Net worth?', [], { screen: 'overview', mode: 'personal', scope: 'this_view', account_ids: data.scope }, data)
    expect(env.blocks[0]).toMatchObject({ text: 'Net worth is -$296,000.' })
    expect(bodies[1]).toMatchObject({ round: 1, model: 'm1', question: 'Net worth?' })
    const msgs = bodies[1].messages as { role: string; content: { type: string; content?: string }[] }[]
    expect(msgs.map((x) => x.role)).toEqual(['assistant', 'user'])
    expect(JSON.parse(msgs[1].content[0].content!)).toMatchObject({ net_worth: -296000 })
    expect(bodies[0].question_id).toBe(bodies[1].question_id)
    fetchSpy.mockRestore()
  })
})
