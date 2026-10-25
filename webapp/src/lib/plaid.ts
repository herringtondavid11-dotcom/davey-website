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
  // The last resumed oauth_state_id stays recorded: state IDs are unique per session, so a new token never needs it
  // cleared, and clearing it let a reopened /oauth tab replay a return after the Connect screen fetched a new token.
  storage.setItem(OAUTH_KEY, JSON.stringify(p))
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

/** Sent by /oauth when it loads in a pop-up opened from Davey: the original window finishes, never the pop-up. */
export const OAUTH_HANDOFF = 'davey.oauth-return'

/** This window is a pop-up opened by a Davey page (same origin), e.g. Plaid's OAuth window. */
export function openedByDavey(win: Window = window): boolean {
  try {
    return !!win.opener && win.opener !== win && win.opener.location.origin === win.location.origin
  } catch {
    return false // cross-origin opener: not ours
  }
}

/**
 * Runs before the app starts. When /oauth loads inside a pop-up opened from Davey (a bank's OAuth window on
 * desktop), it never starts a second Link: a second Link continuing the same oauth_state_id is how a bank's code gets
 * redeemed twice (invalid_grant). It hands the return to the window that opened Link and says so. True if handed off.
 */
export function handOffOAuthPopup(win: Window = window): boolean {
  const url = new URL(win.location.href)
  if (!/\/oauth\/?$/.test(url.pathname) || !url.searchParams.has('oauth_state_id') || !openedByDavey(win)) return false
  win.opener!.postMessage({ type: OAUTH_HANDOFF, href: url.href }, win.location.origin)
  win.history.replaceState(null, '', url.pathname)
  return true
}

/** The { message } a function answered with (non-2xx), if any. */
export async function serverMessage(error: unknown): Promise<string | undefined> {
  try {
    const body = await (error as { context?: Response }).context?.clone().json()
    return typeof body?.message === 'string' && body.message ? body.message : undefined
  } catch {
    return undefined
  }
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
/**
 * New connections use `account`: one Link session for checking, savings, cards, loans, and investments.
 * The live plaid-link-token only special-cases `loans` and `brokerage`; every other mode, including `account`,
 * is parsed as `bank` (transactions only, with depository, credit, investment, and loan account filters).
 * It refuses optional_products on that bank token, so investments and liabilities cannot be added until the
 * server recognizes `mode: 'account'` (see the PR). `loans` and `brokerage` stay available for that server,
 * and are not separate buttons. `bank` omits the mode field, the historical transactions-only body.
 */
export type LinkMode = 'account' | 'bank' | 'loans' | 'brokerage'

/** The plaid-link-token body for the web (pure, unit-tested). */
export function linkTokenBody(opts: { itemId?: string; mode?: LinkMode; fallback?: boolean; institutionId?: string; consentInvestments?: boolean } = {}): Record<string, unknown> {
  // Update mode; with consentInvestments it also adds Plaid Investments to the same connection (no relink).
  if (opts.itemId) return { platform: 'web', redirect_uri: PLAID_REDIRECT_URI, item_id: opts.itemId, mode: 'update', ...(opts.consentInvestments ? { consent: 'investments' } : {}) }
  const mode: LinkMode = opts.mode ?? 'account'
  return {
    platform: 'web',
    redirect_uri: PLAID_REDIRECT_URI,
    ...(mode !== 'bank' ? { mode } : {}),
    // Simplest token: the one retry after Plaid fails the session itself (Shellpoint).
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

const DIAGNOSTIC_KEY = 'davey.diagnosticId'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function clip(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  // A Link token, public token, or access token must never be stored. Ordinary text (an error sentence, a
  // view name, a session id) does not have this shape.
  if (!trimmed || /^(link-|public-|access-)[A-Za-z0-9]/.test(trimmed)) return undefined
  return trimmed.slice(0, max)
}

/** Anonymous id for client_diagnostics. Not the signed-in user. */
export function diagnosticId(storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): string {
  const existing = storage.getItem(DIAGNOSTIC_KEY)
  if (existing && UUID_RE.test(existing)) return existing
  const id = crypto.randomUUID()
  storage.setItem(DIAGNOSTIC_KEY, id)
  return id
}

/**
 * The fields iOS stores on a client_diagnostics link_event. Allowlist only: a raw Plaid metadata object can
 * carry a token, and those keys are dropped even if a caller passes them.
 */
export function linkEventRecord(
  eventName: string,
  metadata: unknown,
  error?: { error_type?: string; error_code?: string; error_message?: string } | null,
): Record<string, string> {
  const meta = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
  const institution = meta.institution && typeof meta.institution === 'object' ? (meta.institution as Record<string, unknown>) : {}
  const nested = meta.error && typeof meta.error === 'object' ? (meta.error as Record<string, unknown>) : {}
  const fields: Record<string, string> = { event: (clip(eventName, 64) ?? 'UNKNOWN').slice(0, 64), timestamp: new Date().toISOString() }
  const put = (key: string, value: unknown, max = 180) => {
    const text = clip(value, max)
    if (text) fields[key] = text
  }
  put('link_session_id', meta.link_session_id, 80)
  put('request_id', meta.request_id, 80)
  put('view_name', meta.view_name, 80)
  put('exit_status', meta.status ?? meta.exit_status, 80)
  put('institution_id', institution.institution_id ?? meta.institution_id, 64)
  put('institution_name', institution.name ?? meta.institution_name, 120)
  put('error_type', error?.error_type ?? meta.error_type ?? nested.error_type, 64)
  put('error_code', error?.error_code ?? meta.error_code ?? nested.error_code, 64)
  put('error_message', error?.error_message ?? meta.error_message ?? nested.error_message, 180)
  put('mfa_type', meta.mfa_type, 64)
  return fields
}

/** onEvent / onExit → client_diagnostics kind link_event. Same shape as iOS. Never throws, never sends a token. */
export async function logClientLinkEvent(
  eventName: string,
  metadata: unknown,
  error?: { error_type?: string; error_code?: string; error_message?: string } | null,
): Promise<void> {
  try {
    const payload = linkEventRecord(eventName, metadata, error)
    const agent = navigator.userAgent
    payload.user_agent = agent.slice(0, 180)
    await supabase.functions.invoke('client-diagnostics', {
      body: {
        diagnostic_id: diagnosticId(),
        kind: 'link_event',
        app_version: 'web',
        os_version: (navigator.platform || 'web').slice(0, 64),
        device: agent.slice(0, 64),
        payload,
      },
    })
  } catch {
    /* best effort */
  }
}

export async function createLinkToken(opts: { itemId?: string; mode?: LinkMode; fallback?: boolean; institutionId?: string; consentInvestments?: boolean } = {}): Promise<string> {
  const { data, error } = await supabase.functions.invoke('plaid-link-token', { body: linkTokenBody(opts) })
  // The server's own words (e.g. the bank connection limit, set server-side in server_flags) are shown as is.
  if (error) throw new Error((await serverMessage(error)) ?? errorMessage(error, "Couldn't start the bank connection."))
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
