import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { useData } from '../lib/DataProvider'
import { fetchAccounts } from '../lib/data'
import { loadDaveyData, reloadDaveyData } from '../lib/serverData'
import { householdID, importNewBank } from '../lib/importBank'
import { adoptNewItem, findSameBank, refreshBank } from '../lib/refreshBank'
import { newAccountsFromLink } from '../lib/linkFlow'
import {
  clearPendingLink,
  createLinkToken,
  exchangePublicToken,
  loadPlaid,
  isFallbackExit,
  logClientLinkEvent,
  logLinkEvent,
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
export function unfinishedSignInMessage(institution?: string | null): string {
  const bank = institution?.trim() || 'Bank'
  return `${bank} sign-in didn't finish. Make sure pop-ups are allowed for this site, then try again.`
}

/**
 * What the Connect screen shows after Link's onExit. An error stays an error. A status with no error
 * (requires_oauth, or any other non-null status) explains the unfinished sign-in. A plain close stays idle.
 */
export function linkExitState(
  err: { display_message?: string | null } | null | undefined,
  metadata: { status?: string | null; institution?: { name?: string | null } | null } | null | undefined,
): FlowState {
  if (err) return { step: 'error', message: err.display_message || 'The bank connection was interrupted. Try again.' }
  if (metadata?.status != null) return { step: 'unfinished', message: unfinishedSignInMessage(metadata.institution?.name) }
  return { step: 'idle' }
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
  const handler = useRef<PlaidHandler | null>(null)
  const prepared = useRef<PreparedLink | null>(null)
  const mode = useRef<LinkMode>('account')
  const consentInvestments = useRef(false)
  const fallbackRetried = useRef(false)
  const usingFallback = useRef(false)
  const resumed = useRef(false)
  const seq = useRef(0)
  const sessionOpts = useRef<SessionOpts>({})

  const finish = useCallback(
    async (publicToken: string, metadata: PlaidLinkMetadata) => {
      const startedAt = readPendingLink()?.startedAt
      clearPendingLink()
      setState({ step: 'saving', institution: metadata.institution?.name })
      try {
        const { itemId } = await exchangePublicToken(publicToken, metadata)
        const data = await reloadDaveyData()
        const household = await householdID(data)
        if (!itemId || !household) throw new Error(NO_HOUSEHOLD)
        // The same bank connected again (Connect an account instead of Reconnect): update the existing connection
        // instead of adding a second copy of every account and transaction.
        const same = findSameBank(data, metadata.institution?.institution_id ?? undefined, itemId,
          (metadata.accounts ?? []).map((a) => a.mask ?? '').filter(Boolean))
        if (same) {
          setState({ step: 'updating', institution: metadata.institution?.name })
          await adoptNewItem(same, itemId, data)
          await reloadDaveyData()
          await reload()
          setState({ step: 'reconnected', institution: metadata.institution?.name, updatedAt: new Date().toISOString(), merged: true })
          return
        }
        // Shared with the household, so the iPhone and Mac get the bank too (they import from these records).
        await importNewBank({ itemId, institutionName: metadata.institution?.name ?? 'Bank', institutionId: metadata.institution?.institution_id ?? undefined, data, household })
        await reloadDaveyData()
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
      await reload()
      setState({ step: 'reconnected', institution, updatedAt: new Date().toISOString(), warning })
      // Plaid re-reads the bank right after a repaired login; pick that up once more in a moment.
      window.setTimeout(() => {
        void reloadDaveyData().then((data) => refreshBank(itemId, data)).then(() => reloadDaveyData()).then(() => reload()).catch(() => undefined)
      }, 30_000)
    },
    [reload],
  )

  const prepareRef = useRef<(opts?: SessionOpts, keepMessage?: boolean) => Promise<void>>(async () => {})
  const armFallbackRef = useRef<(institutionId?: string) => Promise<void>>(async () => {})

  // Assigned each render so Link's callbacks see the latest finishers without an await before open().
  const mountRef = useRef<(opts: { token: string; receivedRedirectUri?: string; updateItemId?: string }) => void>(() => {})
  mountRef.current = (opts) => {
    handler.current?.destroy()
    handler.current = window.Plaid!.create({
      token: opts.token,
      receivedRedirectUri: opts.receivedRedirectUri,
      onSuccess: (publicToken, metadata) =>
        void (opts.updateItemId ? finishUpdate(opts.updateItemId, metadata) : finish(publicToken, metadata)),
      onEvent: (eventName, metadata) => {
        void logClientLinkEvent(eventName, metadata)
      },
      onExit: (err, metadata) => {
        void logClientLinkEvent('EXIT', metadata, err)
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

  // While Link is open, app.css sizes its iframe in the space beside the sidebar and between the phone bars.
  // The bars stay up so a Link that never paints (Plaid's overlay starts at opacity 0) cannot freeze navigation.
  const linkOpen = state.step === 'linking'
  // Layout, not passive effect: the class has to come off before the next screen paints, or the iframe
  // (display:block from Plaid) still covers that screen for a frame and swallows its first taps.
  useLayoutEffect(() => {
    document.body.classList.toggle('plaid-open', linkOpen)
    return () => document.body.classList.remove('plaid-open')
  }, [linkOpen])

  return { state, setState, ready, prepare, openFromClick, resume }
}
