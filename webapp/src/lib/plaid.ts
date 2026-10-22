import { PLAID_REDIRECT_URI, PLAID_SCRIPT_URL } from '../config'
import { supabase } from './supabase'

export interface PlaidLinkMetadata {
  institution?: { institution_id?: string; name?: string } | null
  accounts?: { id: string; name?: string; mask?: string | null; type?: string; subtype?: string }[]
  link_session_id?: string
}

export interface PlaidHandler {
  open: () => void
  exit: (opts?: { force?: boolean }) => void
  destroy: () => void
}

export interface PlaidCreateOptions {
  token: string
  receivedRedirectUri?: string
  onSuccess: (publicToken: string, metadata: PlaidLinkMetadata) => void
  onExit?: (
    error: { error_type?: string; error_code?: string; error_message?: string; display_message?: string | null } | null,
    metadata: { institution?: { institution_id?: string; name?: string } | null; link_session_id?: string; request_id?: string; status?: string | null },
  ) => void
  onEvent?: (eventName: string, metadata: unknown) => void
}

declare global {
  interface Window {
    Plaid?: { create: (opts: PlaidCreateOptions) => PlaidHandler }
  }
}

let scriptPromise: Promise<void> | null = null
export function loadPlaid(): Promise<void> {
  if (window.Plaid) return Promise.resolve()
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = PLAID_SCRIPT_URL
    s.async = true
    s.onload = () => (window.Plaid ? resolve() : reject(new Error('Plaid did not load')))
    s.onerror = () => {
      scriptPromise = null
      reject(new Error("Couldn't reach Plaid. Check your connection and try again."))
    }
    document.head.appendChild(s)
  })
  return scriptPromise
}

// The link token survives the OAuth round trip in localStorage (a mobile bank app can return in a new tab).
// It lives as long as a Plaid link token (4 hours) and is cleared once Link finishes or on a sign-out the user chose.
// An idle sign-out keeps it, so a slow bank login can still resume after signing back in, but only for the same user.
const OAUTH_KEY = 'davey.plaid.oauth'
const RESUMED_KEY = 'davey.plaid.resumed'
const PENDING_TTL_MS = 4 * 60 * 60 * 1000
const store = () => window.localStorage

export interface PendingLink {
  linkToken: string
  startedAt: string
  /** Set when re-authenticating an existing connection (update mode). */
  updateItemId?: string
  /** Who started it: only that user may resume it. */
  userId?: string
}

export function savePendingLink(p: PendingLink, storage: Storage = store()) {
  storage.setItem(OAUTH_KEY, JSON.stringify(p))
  storage.removeItem(RESUMED_KEY)
}

export function readPendingLink(storage: Storage = store(), now = Date.now()): PendingLink | null {
  try {
    const p = JSON.parse(storage.getItem(OAUTH_KEY) ?? 'null')
    if (!p || typeof p.linkToken !== 'string') return null
    const started = Date.parse(p.startedAt)
    return Number.isFinite(started) && now - started > PENDING_TTL_MS ? null : p
  } catch {
    return null
  }
}

/** The pending link for this user, or null (another user's is discarded). */
export function pendingLinkFor(userId: string | undefined, storage: Storage = store(), now = Date.now()): PendingLink | null {
  const p = readPendingLink(storage, now)
  if (p && p.userId && p.userId !== userId) {
    clearPendingLink(storage)
    return null
  }
  return p
}

export function clearPendingLink(storage: Storage = store()) {
  storage.removeItem(OAUTH_KEY)
}

/**
 * Resume Plaid Link after an OAuth bank exactly once per redirect: the oauth_state_id is recorded before Link
 * reopens, so a reload, back navigation or React re-render can't reuse it.
 */
export function claimOAuthResume(href: string, storage: Storage = store()): boolean {
  const state = new URL(href).searchParams.get('oauth_state_id')
  if (!state) return false
  if (storage.getItem(RESUMED_KEY) === state) return false
  storage.setItem(RESUMED_KEY, state)
  return true
}

function errorMessage(e: unknown, fallback: string) {
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string' && e.message) return e.message
  return fallback
}

export const RECONNECT_UNSUPPORTED =
  "Reconnecting from the web needs a server update that isn't live yet. Reconnect this bank in the Davey app for now."

/**
 * New connection, or update mode for an existing Item (re-login). Update mode requires the server to answer with
 * mode:'update'; otherwise we stop, because a plain link token would create a duplicate connection.
 */
export type LinkMode = 'bank' | 'loans' | 'brokerage'

/** The plaid-link-token body for the web (pure, unit-tested). */
export function linkTokenBody(opts: { itemId?: string; mode?: LinkMode; fallback?: boolean; institutionId?: string; consentInvestments?: boolean } = {}): Record<string, unknown> {
  // Update mode; with consentInvestments it also adds Plaid Investments to the same connection (no relink).
  if (opts.itemId) return { platform: 'web', redirect_uri: PLAID_REDIRECT_URI, item_id: opts.itemId, mode: 'update', ...(opts.consentInvestments ? { consent: 'investments' } : {}) }
  return {
    platform: 'web',
    redirect_uri: PLAID_REDIRECT_URI,
    ...(opts.mode && opts.mode !== 'bank' ? { mode: opts.mode } : {}),
    // The simplest token (transactions only, no account filters, Liabilities optional): the one automatic retry.
    ...(opts.fallback ? { fallback: true } : {}),
    ...(opts.institutionId && /^ins_[A-Za-z0-9_]+$/.test(opts.institutionId) ? { institution_id: opts.institutionId } : {}),
  }
}

/** Plaid failed the session itself: worth one retry with the fallback token (SHELLPOINT-FIX.md in davey-ios). */
export function isFallbackExit(errorType?: string | null, errorCode?: string | null): boolean {
  return errorType === 'API_ERROR' || errorCode === 'INTERNAL_SERVER_ERROR'
}

/** One Link exit or fallback retry for plaid_link_events (link-support "event"; identifiers only). Never throws. */
export async function logLinkEvent(fields: Record<string, string | boolean | undefined>): Promise<void> {
  try {
    await supabase.functions.invoke('link-support', { body: { action: 'event', platform: 'web', app_version: 'web', ...fields } })
  } catch {
    /* best effort */
  }
}

export async function createLinkToken(opts: { itemId?: string; mode?: LinkMode; fallback?: boolean; institutionId?: string; consentInvestments?: boolean } = {}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('plaid-link-token', { body: linkTokenBody(opts) })
  if (error) throw new Error(errorMessage(error, "Couldn't start the bank connection."))
  const token = data?.link_token ?? data?.linkToken
  if (typeof token !== 'string') throw new Error("Couldn't start the bank connection.")
  if (opts.itemId && data?.mode !== 'update') throw new Error(RECONNECT_UNSUPPORTED)
  return token
}

// Last Link problem, kept so Report to Plaid can include the identifiers Plaid support asks for.
const ISSUE_KEY = 'davey.plaid.lastIssue'
export interface LinkIssue {
  at: string
  institution?: string
  institutionId?: string
  linkSessionId?: string
  requestId?: string
  errorCode?: string
  errorMessage?: string
}
export function saveLinkIssue(issue: LinkIssue) {
  try {
    localStorage.setItem(ISSUE_KEY, JSON.stringify(issue))
  } catch {
    /* ignore */
  }
}
export function readLinkIssue(): LinkIssue | null {
  try {
    return JSON.parse(localStorage.getItem(ISSUE_KEY) ?? 'null')
  } catch {
    return null
  }
}

export interface IssueReport {
  institution: string
  kind: string
  details: string
  issue?: LinkIssue | null
}

/** link-support (action "report"): identifiers only; Davey support files it with Plaid. Falls back to email. */
export async function reportIssue(report: IssueReport): Promise<{ sent: true } | { sent: false; mailto: string }> {
  const { data, error } = await supabase.functions.invoke('link-support', {
    body: {
      action: 'report',
      institution_id: report.issue?.institutionId,
      institution_name: report.institution,
      error_code: report.issue?.errorCode,
      link_session_id: report.issue?.linkSessionId,
      request_id: report.issue?.requestId,
      issue: `${report.kind}${report.details ? `: ${report.details}` : ''}`.slice(0, 500),
      app_version: 'web',
      device: navigator.userAgent.slice(0, 120),
      occurred_at: report.issue?.at,
    },
  })
  if (!error && data?.ok !== false) return { sent: true }
  const lines = [
    `Institution: ${report.institution}`,
    `Problem: ${report.kind}`,
    '',
    report.details,
    '',
    ...(report.issue
      ? [
          `Link session: ${report.issue.linkSessionId ?? '-'}`,
          `Request ID: ${report.issue.requestId ?? '-'}`,
          `Institution ID: ${report.issue.institutionId ?? '-'}`,
          `Error: ${report.issue.errorCode ?? '-'} ${report.issue.errorMessage ?? ''}`,
          `When: ${report.issue.at}`,
        ]
      : []),
    'Sent from Davey on the web',
  ]
  const mailto = `mailto:support@daveypersonalfinance.com?subject=${encodeURIComponent(`Bank connection problem: ${report.institution}`)}&body=${encodeURIComponent(lines.join('\n'))}`
  return { sent: false, mailto }
}

export async function exchangePublicToken(publicToken: string, metadata: PlaidLinkMetadata): Promise<{ itemId?: string }> {
  const { data, error } = await supabase.functions.invoke('plaid-exchange', {
    body: {
      public_token: publicToken,
      platform: 'web',
      institution: metadata.institution ?? null,
      accounts: metadata.accounts ?? [],
      link_session_id: metadata.link_session_id,
    },
  })
  if (error) throw new Error(errorMessage(error, "Couldn't finish connecting your bank."))
  return { itemId: data?.item_id ?? data?.itemId ?? data?.item?.id }
}

/** Best effort: a slow first sync must not block naming the accounts. */
export async function syncItem(itemId?: string): Promise<void> {
  try {
    await supabase.functions.invoke('plaid-sync', { body: itemId ? { item_id: itemId } : {} })
  } catch {
    /* the app's scheduled sync catches up */
  }
}

export interface ItemStatus {
  item_id: string
  status: string
  investments_status: string | null
  institution_name: string | null
}

/** Each connection's state (plaid-item-status): includes whether a brokerage still needs Investments access. */
export async function itemStatuses(): Promise<ItemStatus[]> {
  const { data, error } = await supabase.functions.invoke('plaid-item-status', { body: {} })
  if (error) return []
  return (data?.items ?? []) as ItemStatus[]
}

/** Pulls holdings and value history for a connection (plaid-investments); `refresh` asks the brokerage first. */
export async function syncInvestments(itemId: string, refresh = false): Promise<string> {
  const { data, error } = await supabase.functions.invoke('plaid-investments', { body: { item_id: itemId, ...(refresh ? { refresh: true } : {}) } })
  if (error) throw new Error("Couldn't refresh investments. Try again in a minute.")
  return String(data?.status ?? 'unknown')
}
