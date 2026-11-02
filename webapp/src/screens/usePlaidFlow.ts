import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useData } from '../lib/DataProvider'
import { fetchAccounts } from '../lib/data'
import { loadDaveyData, reloadDaveyData } from '../lib/serverData'
import { householdID, importNewBank } from '../lib/importBank'
import { adoptNewItem, banksToReplace, refreshBank } from '../lib/refreshBank'
import { clearTableCache } from '../lib/useTable'
import { newAccountsFromLink } from '../lib/linkFlow'
import {
  OAUTH_HANDOFF,
  OAUTH_RETURN_TIMEOUT_MS,
  bankRefusedMessage,
  claimOAuthResume,
  clearPendingLink,
  createLinkToken,
  exchangePublicToken,
  loadPlaid,
  isChaseInstitution,
  isFallbackExit,
  logClientLinkEvent,
  logLinkEvent,
  oauthAttemptFailed,
  oauthWaitingMessage,
  pendingLinkFor,
  readPendingLink,
  type LinkMode,
  saveLinkIssue,
  savePendingLink,
  syncInvestments,
  syncItem,
  type PlaidHandler,
  type PlaidLinkMetadata,
} from '../lib/plaid'
import type { Account } from '../lib/schema'
import { supabase } from '../lib/supabase'

async function currentUserId(): Promise<string | undefined> {
  const { data } = await supabase.auth.getSession()
  return data.session?.user.id
}

export type FlowState =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'linking' }
  | { step: 'retry' }
  | { step: 'saving'; institution?: string }
  /** A reconnected bank is being brought up to date ("Updating PenFed…"). */
  | { step: 'updating'; institution?: string }
  | { step: 'naming'; accounts: Account[]; institution?: string }
  /** Up to date (`updatedAt`), or still behind with `warning` when Plaid couldn't send the latest yet. */
  | { step: 'reconnected'; institution?: string; updatedAt?: string; warning?: string; merged?: boolean }
  | { step: 'error'; message: string }
  | { step: 'unfinished'; message: string }

/** Link closed on an OAuth handoff or any other unfinished step, with no error from Plaid. */
export function unfinishedSignInMessage(institution?: string | null, institutionId?: string | null): string {
  if (isChaseInstitution(institutionId, institution)) return bankRefusedMessage(institutionId, institution)
  const bank = institution?.trim() || 'Bank'
  return `${bank} sign-in didn't finish. Make sure pop-ups are allowed for this site, then try again.`
}

/**
 * What the Connect screen shows after Link's onExit. An error stays an error. A status with no error
 * (requires_oauth, or any other non-null status) explains the unfinished sign-in. A plain close stays idle.
 */
export function linkExitState(
  err: { display_message?: string | null; error_code?: string | null; error_message?: string | null } | null | undefined,
  metadata: { status?: string | null; institution?: { institution_id?: string | null; name?: string | null } | null } | null | undefined,
): FlowState {
  const id = metadata?.institution?.institution_id
  const name = metadata?.institution?.name
  if (err?.error_code === 'INSUFFICIENT_CREDENTIALS') return { step: 'error', message: bankRefusedMessage(id, name) }
  if (err) return { step: 'error', message: err.display_message || 'The bank connection was interrupted. Try again.' }
  if (metadata?.status != null) return { step: 'unfinished', message: unfinishedSignInMessage(name, id) }
  return { step: 'idle' }
}

interface OAuthWatch {
  institutionId?: string
  institutionName?: string
  linkSessionId?: string
  requestId?: string
  openedAt: number
}

function watchFrom(metadata: unknown, previous?: OAuthWatch): OAuthWatch {
  const meta = metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {}
  const institution = meta.institution && typeof meta.institution === 'object' ? (meta.institution as Record<string, unknown>) : {}
  const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : undefined)
  return {
    institutionId: text(institution.institution_id) ?? text(meta.institution_id) ?? previous?.institutionId,
    institutionName: text(institution.name) ?? text(meta.institution_name) ?? previous?.institutionName,
    linkSessionId: text(meta.link_session_id) ?? previous?.linkSessionId,
    requestId: text(meta.request_id) ?? previous?.requestId,
    openedAt: previous?.openedAt ?? Date.now(),
  }
}

/** Davey keeps money data on the iPhone/Mac and in iCloud; the web sees what the household shares. */
export const NO_HOUSEHOLD =
  "Davey on the web shows what your household shares. Turn on Household Sharing in the Davey app (Settings › Household), then connect banks here or in the app."

export const SESSION_EXPIRED = 'This bank connection session expired. Start again from Connect an account.'

interface PreparedLink {
  token: string
  updateItemId?: string
}

interface SessionOpts {
  updateItemId?: string
  consentInvestments?: boolean
}

/**
 * Plaid opens OAuth banks (Chase and others) in a pop-up. Browsers block that pop-up unless `Plaid.create` and
 * `handler.open()` run inside the click, with no await before them. The token and the Plaid script are fetched
 * first; the click only creates and opens Link.
 */
export function usePlaidFlow() {
  const { reload } = useData()
  const [state, setState] = useState<FlowState>({ step: 'idle' })
  const [ready, setReady] = useState(false)
  const [oauthNote, setOauthNote] = useState<string | null>(null)
  const handler = useRef<PlaidHandler | null>(null)
  const prepared = useRef<PreparedLink | null>(null)
  const mode = useRef<LinkMode>('account')
  const consentInvestments = useRef(false)
  const fallbackRetried = useRef(false)
  const usingFallback = useRef(false)
  const resumed = useRef(false)
  const seq = useRef(0)
  const sessionOpts = useRef<SessionOpts>({})
  const oauthWatch = useRef<OAuthWatch | null>(null)
  const oauthTimer = useRef<number | undefined>(undefined)
  const gaveUp = useRef(false)
  const giveUpRef = useRef<(reason: string) => void>(() => {})

  const finish = useCallback(
    async (publicToken: string, metadata: PlaidLinkMetadata) => {
      const startedAt = readPendingLink()?.startedAt
      clearPendingLink()
      setState({ step: 'saving', institution: metadata.institution?.name })
      try {
        const exchanged = await exchangePublicToken(publicToken, metadata)
        const itemId = exchanged.itemId
        const data = await reloadDaveyData()
        const household = await householdID(data)
        if (!itemId || !household) throw new Error(NO_HOUSEHOLD)
        // The same bank connected again, or a broken Item the server just retired: update the existing connection
        // instead of adding a second copy of every account and transaction.
        const masks = (metadata.accounts ?? []).map((a) => a.mask ?? '').filter(Boolean)
        const replacements = banksToReplace(data, {
          institutionId: metadata.institution?.institution_id ?? undefined,
          newItemId: itemId,
          masks,
          retiredItemIds: exchanged.retiredItemIds,
        })
        const same = replacements[0]
        if (same) {
          setState({ step: 'updating', institution: metadata.institution?.name })
          await adoptNewItem(same, itemId, data)
          await reloadDaveyData()
          clearTableCache()
          await reload()
          setState({ step: 'reconnected', institution: metadata.institution?.name, updatedAt: new Date().toISOString(), merged: true })
          return
        }
        // Shared with the household, so the iPhone and Mac get the bank too (they import from these records).
        await importNewBank({ itemId, institutionName: metadata.institution?.name ?? 'Bank', institutionId: metadata.institution?.institution_id ?? undefined, data, household })
        await reloadDaveyData()
        clearTableCache()
        const accounts = await fetchAccounts()
        await reload()
        setState({ step: 'naming', accounts: newAccountsFromLink(accounts, metadata, startedAt), institution: metadata.institution?.name })
      } catch (e) {
        setState({ step: 'error', message: (e as Error).message })
      }
    },
    [reload],
  )

  const finishUpdate = useCallback(
    async (itemId: string, metadata: PlaidLinkMetadata) => {
      clearPendingLink()
      const institution = metadata.institution?.name
      setState({ step: 'updating', institution })
      let warning: string | undefined
      try {
        // Sync from the bank's own cursor and share the changes: status OK, new balances and transactions, for the
        // web, iPhone and Mac alike. (This used to call plaid-sync without the cursor and discard the answer.)
        const done = await refreshBank(itemId, await reloadDaveyData())
        if (!done) await syncItem(itemId)
      } catch (e) {
        warning = (e as Error).message
      }
      // "Finish setting up": Investments was just added to this connection: pull holdings and history now.
      if (consentInvestments.current) {
        consentInvestments.current = false
        await syncInvestments(itemId).catch(() => undefined)
      }
      await reloadDaveyData()
      // The connection list is cached per screen; without this Accounts kept showing "Needs you to sign in again".
      clearTableCache()
      await reload()
      setState({ step: 'reconnected', institution, updatedAt: new Date().toISOString(), warning })
      // Plaid re-reads the bank right after a repaired login; pick that up once more in a moment.
      window.setTimeout(() => {
        void reloadDaveyData().then((data) => refreshBank(itemId, data)).then(() => reloadDaveyData()).then(() => { clearTableCache(); return reload() }).catch(() => undefined)
      }, 30_000)
    },
    [reload],
  )

  const prepareRef = useRef<(opts?: SessionOpts, keepMessage?: boolean) => Promise<void>>(async () => {})
  const armFallbackRef = useRef<(institutionId?: string) => Promise<void>>(async () => {})

  // Assigned each render so Link's callbacks see the latest finishers without an await before open().
  const mountRef = useRef<(opts: { token: string; receivedRedirectUri?: string; updateItemId?: string }) => void>(() => {})
  // An OAuth return handed over by /oauth in a pop-up (see OAUTH_HANDOFF), not yet used.
  const handoff = useRef<string | null>(null)
  const handoffTimer = useRef<number | undefined>(undefined)
  const resumeRef = useRef<(href: string) => Promise<void>>(async () => {})
  const clearOAuthTimer = () => {
    window.clearTimeout(oauthTimer.current)
    oauthTimer.current = undefined
  }
  // The bank window never came back, or Plaid already reported the OAuth failure. Close Link so the message
  // is not hidden under its iframe, and fetch the next token so Try again can open inside the next click.
  giveUpRef.current = (reason: string) => {
    if (gaveUp.current) return
    gaveUp.current = true
    clearOAuthTimer()
    const watch = oauthWatch.current
    setOauthNote(null)
    void logClientLinkEvent('DAVEY_OAUTH_GAVE_UP', {
      view_name: reason,
      link_session_id: watch?.linkSessionId,
      request_id: watch?.requestId,
      institution_id: watch?.institutionId,
      institution_name: watch?.institutionName,
    })
    handler.current?.destroy()
    handler.current = null
    prepared.current = null
    setReady(false)
    setState({ step: 'unfinished', message: bankRefusedMessage(watch?.institutionId, watch?.institutionName) })
    void prepareRef.current(sessionOpts.current, true)
  }
  /** Continues a handed-over return exactly once (shared one-shot guard with /oauth: claimOAuthResume). */
  const continueHandoff = (): boolean => {
    const href = handoff.current
    handoff.current = null
    window.clearTimeout(handoffTimer.current)
    if (!href || !claimOAuthResume(href)) return false
    void logClientLinkEvent('DAVEY_OAUTH_RETURN', { view_name: 'handoff_resumed' })
    void resumeRef.current(href)
    return true
  }
  mountRef.current = (opts) => {
    handoff.current = null
    window.clearTimeout(handoffTimer.current)
    clearOAuthTimer()
    gaveUp.current = false
    oauthWatch.current = null
    setOauthNote(null)
    handler.current?.destroy()
    handler.current = window.Plaid!.create({
      token: opts.token,
      receivedRedirectUri: opts.receivedRedirectUri,
      onSuccess: (publicToken, metadata) => {
        // Link finished the OAuth return itself: the handed-over copy must never be used (a second redemption).
        handoff.current = null
        window.clearTimeout(handoffTimer.current)
        clearOAuthTimer()
        setOauthNote(null)
        void (opts.updateItemId ? finishUpdate(opts.updateItemId, metadata) : finish(publicToken, metadata))
      },
      onEvent: (eventName, metadata) => {
        void logClientLinkEvent(eventName, metadata)
        if (gaveUp.current) return
        if (eventName === 'OPEN_OAUTH') {
          const watch = watchFrom(metadata)
          oauthWatch.current = watch
          setOauthNote(oauthWaitingMessage(watch.institutionId, watch.institutionName))
          clearOAuthTimer()
          oauthTimer.current = window.setTimeout(() => giveUpRef.current('timeout'), OAUTH_RETURN_TIMEOUT_MS)
          return
        }
        if (oauthAttemptFailed(eventName, metadata)) {
          oauthWatch.current = watchFrom(metadata, oauthWatch.current ?? undefined)
          giveUpRef.current(eventName === 'FAIL_OAUTH' ? 'fail_oauth' : 'insufficient_credentials')
        }
      },
      onExit: (err, metadata) => {
        void logClientLinkEvent('EXIT', metadata, err)
        if (gaveUp.current) return
        clearOAuthTimer()
        setOauthNote(null)
        // Link closed while a pop-up return was waiting: nothing else will use it, so continue with it now.
        if (handoff.current && continueHandoff()) return
        clearPendingLink()
        const ids = {
          mode: mode.current,
          config: usingFallback.current ? 'fallback' : 'standard',
          retry: usingFallback.current,
          link_session_id: metadata?.link_session_id,
          request_id: metadata?.request_id,
          institution_id: metadata?.institution?.institution_id,
          institution_name: metadata?.institution?.name,
          error_type: err?.error_type,
          error_code: err?.error_code,
          exit_status: metadata?.status ?? undefined,
        }
        if (err || metadata?.status) void logLinkEvent({ event: 'exit', ...ids })
        // Plaid failed the session itself. The next open has to be another click: calling open() here is not a user
        // gesture, and Safari/Chrome would block the bank pop-up.
        if (!opts.updateItemId && !fallbackRetried.current && isFallbackExit(err?.error_type, err?.error_code)) {
          fallbackRetried.current = true
          usingFallback.current = true
          void logLinkEvent({ event: 'fallback_retry', ...ids, config: 'fallback', retry: true })
          void armFallbackRef.current(metadata?.institution?.institution_id)
          return
        }
        const next = linkExitState(err, metadata)
        if (next.step === 'error' && err) {
          saveLinkIssue({
            at: new Date().toISOString(),
            institution: metadata?.institution?.name,
            institutionId: metadata?.institution?.institution_id,
            linkSessionId: metadata?.link_session_id,
            requestId: metadata?.request_id,
            errorCode: err.error_code,
            errorMessage: err.error_message,
          })
        }
        if (next.step === 'error' || next.step === 'unfinished') {
          prepared.current = null
          setReady(false)
          setState(next)
          // Fetch the next token while the message stays up, so Try again can open Link inside that click.
          if (next.step === 'unfinished') void prepareRef.current(sessionOpts.current, true)
          return
        }
        // Closed without connecting. A redirect return goes back to Connect; a normal close fetches a fresh token
        // so the next click can open Link immediately.
        if (resumed.current) setState({ step: 'idle' })
        else void prepareRef.current(sessionOpts.current)
      },
    })
    setState({ step: 'linking' })
    handler.current.open()
  }

  const prepare = useCallback(async (opts: SessionOpts = {}, keepMessage = false) => {
    const ticket = ++seq.current
    sessionOpts.current = opts
    mode.current = 'account'
    consentInvestments.current = Boolean(opts.updateItemId && opts.consentInvestments)
    fallbackRetried.current = false
    usingFallback.current = false
    prepared.current = null
    setReady(false)
    if (!keepMessage) setState({ step: 'starting' })
    try {
      // A bank connected here is shared through the household; without one it would reach no device.
      if (!opts.updateItemId && !(await householdID(await loadDaveyData()))) throw new Error(NO_HOUSEHOLD)
      const [token] = await Promise.all([
        createLinkToken({ itemId: opts.updateItemId, mode: 'account', consentInvestments: consentInvestments.current }),
        loadPlaid(),
      ])
      if (ticket !== seq.current) return
      savePendingLink({ linkToken: token, startedAt: new Date().toISOString(), updateItemId: opts.updateItemId, userId: await currentUserId() })
      if (ticket !== seq.current) return
      prepared.current = { token, updateItemId: opts.updateItemId }
      setReady(true)
      if (!keepMessage) setState({ step: 'idle' })
    } catch (e) {
      if (ticket !== seq.current) return
      prepared.current = null
      setReady(false)
      setState({ step: 'error', message: (e as Error).message })
    }
  }, [])
  prepareRef.current = prepare

  const armFallback = useCallback(async (institutionId?: string) => {
    const ticket = ++seq.current
    prepared.current = null
    setReady(false)
    setState({ step: 'starting' })
    try {
      const token = await createLinkToken({ mode: mode.current, fallback: true, institutionId })
      await loadPlaid()
      if (ticket !== seq.current) return
      savePendingLink({ linkToken: token, startedAt: new Date().toISOString(), userId: await currentUserId() })
      if (ticket !== seq.current) return
      prepared.current = { token }
      setReady(true)
      setState({ step: 'retry' })
    } catch (e) {
      if (ticket !== seq.current) return
      setState({ step: 'error', message: (e as Error).message })
    }
  }, [])
  armFallbackRef.current = armFallback

  /** True when Link opened. False when the token is not ready yet (the caller should prepare, not open later). */
  const openFromClick = useCallback((): boolean => {
    const pending = prepared.current
    if (!pending || !window.Plaid) return false
    prepared.current = null
    setReady(false)
    mountRef.current({ token: pending.token, updateItemId: pending.updateItemId })
    return true
  }, [])

  /** Called once by /oauth after an OAuth bank redirects back. The pop-up already happened; this continues it. */
  const resume = useCallback(async (receivedRedirectUri: string) => {
    window.clearTimeout(handoffTimer.current)
    resumed.current = true
    const pending = pendingLinkFor(await currentUserId())
    if (!pending) {
      setState({ step: 'error', message: SESSION_EXPIRED })
      return
    }
    setState({ step: 'starting' })
    try {
      await loadPlaid()
      mountRef.current({ token: pending.linkToken, receivedRedirectUri, updateItemId: pending.updateItemId })
    } catch (e) {
      setState({ step: 'error', message: (e as Error).message })
    }
  }, [])

  resumeRef.current = resume

  // /oauth loaded in a pop-up (desktop OAuth) and handed the return to this window. Plaid's open Link normally
  // finishes it by itself; only if it hasn't within 20 s (or Link closes, above) does this window continue it, once.
  const linkingRef = useRef(false)
  linkingRef.current = state.step === 'linking'
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== OAUTH_HANDOFF || typeof e.data.href !== 'string') return
      handoff.current = e.data.href
      void logClientLinkEvent('DAVEY_OAUTH_RETURN', { view_name: linkingRef.current ? 'popup_handoff_link_open' : 'popup_handoff_link_closed' })
      window.clearTimeout(handoffTimer.current)
      if (!linkingRef.current) continueHandoff()
      else handoffTimer.current = window.setTimeout(() => { if (linkingRef.current) { handler.current?.destroy(); continueHandoff() } }, 20_000)
    }
    window.addEventListener('message', onMessage)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(handoffTimer.current)
      window.clearTimeout(oauthTimer.current)
    }
  }, [])

  // While Link is open, app.css sizes its iframe in the space beside the sidebar and between the phone bars.
  // The bars stay up so a Link that never paints (Plaid's overlay starts at opacity 0) cannot freeze navigation.
  const linkOpen = state.step === 'linking'
  // Layout, not passive effect: the class has to come off before the next screen paints, or the iframe
  // (display:block from Plaid) still covers that screen for a frame and swallows its first taps.
  useLayoutEffect(() => {
    document.body.classList.toggle('plaid-open', linkOpen)
    return () => document.body.classList.remove('plaid-open')
  }, [linkOpen])

  const cancelOAuth = useCallback(() => giveUpRef.current('try_again'), [])

  return { state, setState, ready, prepare, openFromClick, resume, oauthNote, cancelOAuth }
}
