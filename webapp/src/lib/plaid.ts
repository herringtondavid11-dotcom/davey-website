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
  onExit?: (error: { error_code?: string; display_message?: string | null } | null, metadata: unknown) => void
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
// It expires with the link token (30 minutes) and is cleared once Link finishes or on sign-out.
const OAUTH_KEY = 'davey.plaid.oauth'
const RESUMED_KEY = 'davey.plaid.resumed'
const PENDING_TTL_MS = 30 * 60 * 1000
const store = () => window.localStorage

export interface PendingLink {
  linkToken: string
  startedAt: string
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

export async function createLinkToken(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('plaid-link-token', {
    body: { platform: 'web', redirect_uri: PLAID_REDIRECT_URI },
  })
  if (error) throw new Error(errorMessage(error, "Couldn't start the bank connection."))
  const token = data?.link_token ?? data?.linkToken
  if (typeof token !== 'string') throw new Error("Couldn't start the bank connection.")
  return token
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
