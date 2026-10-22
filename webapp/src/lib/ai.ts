import { currentMonth, summarize } from './budget'
import { netWorth } from './finance'
import type { Account, Transaction } from './schema'
import { supabase } from './supabase'

export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
}

export const AI_UNAVAILABLE = "Ask AI isn't available on the web yet. It works in the Davey app; the web version needs a small server update."

const VIEW_NAMES: Record<string, string> = {
  '/': 'overview', '/transactions': 'transactions', '/budget': 'budget', '/cash-flow': 'cash_flow', '/recurring': 'recurring',
  '/accounts': 'accounts', '/credit-cards': 'credit_cards', '/loans': 'loans', '/investments': 'investments', '/tax': 'tax',
  '/household': 'household', '/exports': 'exports', '/settings': 'settings', '/help': 'connection_help',
}

/** A small, non-identifying summary of what's on screen. No account numbers, no raw transactions. */
export function viewContext(path: string, accounts: Account[], transactions: Transaction[]) {
  const month = currentMonth()
  const s = summarize(transactions, month)
  const top = [...s.byCategory].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount: Math.round(amount) }))
  const w = netWorth(accounts)
  return {
    platform: 'web',
    view: VIEW_NAMES[path] ?? 'other',
    month,
    net_worth: Math.round(w.net),
    month_income: Math.round(s.income),
    month_spending: Math.round(s.spending),
    top_categories: top,
    account_count: accounts.filter((a) => !a.hidden).length,
  }
}

export const SUGGESTIONS: Record<string, string[]> = {
  overview: ['How am I doing this month?', 'Where can I cut back?', 'Explain my net worth'],
  transactions: ['What were my biggest purchases this month?', 'Any unusual charges?'],
  budget: ['Which budgets am I likely to go over?', 'Suggest budgets based on my spending'],
  cash_flow: ['Is my saving rate improving?', 'Why was last month different?'],
  recurring: ['Which subscriptions could I cancel?', 'What bills are coming up?'],
  credit_cards: ['Which card should I pay off first?', 'How do I lower my utilization?'],
  loans: ['Should I refinance?', 'Is paying extra on my mortgage worth it?'],
  investments: ['How is my portfolio allocated?'],
  tax: ['How much should I set aside this quarter?', 'What else might be deductible?'],
}

export async function askAi(question: string, history: ChatTurn[], context: ReturnType<typeof viewContext>): Promise<string> {
  const { data, error } = await supabase.functions.invoke('ask-ai', {
    body: { question, platform: 'web', context, history: history.slice(-8).map((t) => ({ role: t.role, content: t.text })) },
  })
  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status
    if (status === 429 || status === 402) throw new Error("You've used this month's AI questions. They reset on the 1st (Premium includes 100 a month).")
    if (status === 404 || /failed to send|not found/i.test(error.message)) throw new Error(AI_UNAVAILABLE)
    throw new Error("Davey AI couldn't answer right now. Try again in a moment.")
  }
  const answer = data?.answer ?? data?.text ?? data?.message ?? data?.reply ?? data?.content
  if (typeof answer !== 'string' || !answer.trim()) throw new Error("Davey AI couldn't answer right now. Try again in a moment.")
  return answer.trim()
}
