// Davey AI v2 on the web: the same ask-ai Edge Function as the app (server-sent events, tool loop). The function holds
// the model and prompt; the browser runs the tools on its own data (aiTools.ts) and posts the results each round.
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config'
import { runTool, type ToolData } from './aiTools'
import { supabase } from './supabase'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface Envelope {
  blocks: Record<string, unknown>[]
  follow_ups: string[]
}

export interface AIViewContext {
  screen: string
  mode: 'personal' | 'business' | 'mixed'
  scope: 'this_view' | 'all_personal' | 'all_business' | 'everything'
  account_ids: string[]
  date_range?: { start: string; end: string }
  visible_metrics?: Record<string, string>
}

export const AI_UNAVAILABLE = "Davey AI isn't available on the web yet. It works in the Davey app; the web version needs a small server update."
export const AI_GENERIC = "Davey AI couldn't answer right now. Try again in a moment."

const SCREENS: Record<string, string> = {
  '/': 'overview', '/transactions': 'transactions', '/budget': 'budget', '/cash-flow': 'overview', '/recurring': 'overview',
  '/accounts': 'overview', '/credit-cards': 'card_detail', '/loans': 'account_detail', '/investments': 'investments', '/tax': 'tax',
  '/settings': 'settings',
}

export function viewContext(path: string, data: Pick<ToolData, 'accounts'>, metrics: Record<string, string> = {}): AIViewContext {
  const biz = data.accounts.filter((a) => a.usage === 'business').length
  const mode = path === '/tax' ? 'business' : biz === 0 ? 'personal' : biz === data.accounts.length ? 'business' : 'mixed'
  const ids = (path === '/tax' ? data.accounts.filter((a) => a.usage === 'business') : data.accounts).map((a) => a.id)
  return { screen: SCREENS[path] ?? 'overview', mode, scope: 'this_view', account_ids: ids, visible_metrics: metrics }
}

export const SUGGESTIONS: Record<string, string[]> = {
  overview: ['How am I doing this month?', 'Where can I cut back?', 'How has my net worth changed?'],
  transactions: ['What were my biggest purchases this month?', 'Any unusual charges?'],
  budget: ['Which budgets am I likely to go over?', 'Suggest budgets based on my spending'],
  card_detail: ['Which card should I pay off first?', 'How do I lower my utilization?'],
  account_detail: ['Should I refinance?', 'What if I pay $300 extra a month?'],
  investments: ['How much do I have invested?'],
  tax: ['How much should I set aside this quarter?', 'What deductions am I missing?'],
}

type Block = Record<string, unknown>
interface RoundEvents {
  onProgress?: (label: string) => void
  onDelta?: (text: string) => void
}

class AskError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message)
  }
}

async function round(body: Block, ev: RoundEvents): Promise<{ toolCalls?: Block[]; envelope?: Envelope; model?: string; invalid?: string }> {
  const { data } = await supabase.auth.getSession()
  let res: Response
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/ask-ai?stream=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      body: JSON.stringify(body),
    })
  } catch {
    // CORS not enabled for the web yet (or offline).
    throw new AskError(navigator.onLine ? AI_UNAVAILABLE : "You're offline.", 'unreachable')
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    if (res.status === 429 || payload.error === 'plan_limit') throw new AskError(payload.message || "You've used this month's Davey AI questions.", 'plan_limit')
    throw new AskError(payload.message || AI_GENERIC, payload.error)
  }
  const out: { toolCalls?: Block[]; envelope?: Envelope; model?: string; invalid?: string } = {}
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += decoder.decode(value, { stream: true })
    let i
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim()
      buffer = buffer.slice(i + 1)
      if (!line.startsWith('data:')) continue
      let e: Block
      try {
        e = JSON.parse(line.slice(5))
      } catch {
        continue
      }
      if (e.type === 'meta') out.model = String(e.model ?? '')
      else if (e.type === 'progress') ev.onProgress?.(String(e.label ?? 'Working'))
      else if (e.type === 'delta') ev.onDelta?.(String(e.text ?? ''))
      else if (e.type === 'tool_calls') {
        out.toolCalls = (e.content as Block[]) ?? []
        out.invalid = e.invalid_respond as string | undefined
      } else if (e.type === 'answer') out.envelope = e.envelope as Envelope
      else if (e.type === 'error') throw new AskError(String(e.message ?? AI_GENERIC), String(e.error ?? 'ai_error'))
    }
    if (done) break
  }
  return out
}

/** Runs the whole tool loop for one question. */
export async function ask(question: string, history: ChatTurn[], context: AIViewContext, data: ToolData, ev: RoundEvents = {}): Promise<Envelope> {
  const questionId = crypto.randomUUID()
  const messages: { role: string; content: Block[] }[] = []
  let model: string | undefined
  for (let r = 0; r < 8; r++) {
    const res = await round(
      { question_id: questionId, round: r, question, history: history.slice(-10).map((t) => ({ role: t.role, content: t.text.slice(0, 4000) })), context, messages, model, finalize: r === 7 },
      ev,
    )
    model = res.model || model
    if (res.envelope) return res.envelope
    if (!res.toolCalls?.length) break
    const results: Block[] = []
    for (const call of res.toolCalls) {
      if (call.type !== 'tool_use') continue
      const id = String(call.id)
      if (call.name === 'respond') {
        results.push({ type: 'tool_result', tool_use_id: id, is_error: true, content: `Invalid answer: ${res.invalid ?? 'check the schema'}. Call respond again with a valid answer.` })
        continue
      }
      try {
        const output = runTool(String(call.name), (call.input ?? {}) as Block, data)
        results.push({ type: 'tool_result', tool_use_id: id, content: JSON.stringify(output).slice(0, 40_000) })
      } catch (e) {
        results.push({ type: 'tool_result', tool_use_id: id, is_error: true, content: `Tool error: ${(e as Error).message}` })
      }
    }
    messages.push({ role: 'assistant', content: res.toolCalls }, { role: 'user', content: results })
  }
  throw new AskError(AI_GENERIC)
}

/** App deep links (davey://…) to web routes. */
export function deeplinkToRoute(link: string): string | null {
  try {
    const u = new URL(link)
    if (u.protocol !== 'davey:') return null
    const q = u.searchParams
    switch (u.hostname) {
      case 'budget': return '/budget'
      case 'recurring': return '/recurring'
      case 'account': return '/accounts'
      case 'category': return `/transactions?category=${encodeURIComponent(q.get('name') ?? q.get('id') ?? '')}`
      case 'transactions':
        if (u.pathname.startsWith('/search')) return `/transactions?q=${encodeURIComponent(q.get('query') ?? '')}`
        return q.get('ids') ? `/transactions?ids=${encodeURIComponent(q.get('ids')!)}` : '/transactions'
      default: return null
    }
  } catch {
    return null
  }
}
