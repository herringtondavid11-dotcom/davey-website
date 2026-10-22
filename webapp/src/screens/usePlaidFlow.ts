import { useCallback, useRef, useState } from 'react'
import { useData } from '../lib/DataProvider'
import { fetchAccounts } from '../lib/data'
import { loadDaveyData, reloadDaveyData } from '../lib/serverData'
import { householdID, importNewBank } from '../lib/importBank'
import { newAccountsFromLink } from '../lib/linkFlow'
import {
  clearPendingLink,
  createLinkToken,
  exchangePublicToken,
  loadPlaid,
  isFallbackExit,
  logLinkEvent,
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

export type FlowState =
  | { step: 'idle' }
  | { step: 'starting' }
  | { step: 'linking' }
  | { step: 'saving'; institution?: string }
  | { step: 'naming'; accounts: Account[]; institution?: string }
  | { step: 'reconnected'; institution?: string }
  | { step: 'error'; message: string }

/** Davey keeps money data on the iPhone/Mac and in iCloud; the web sees what the household shares. */
export const NO_HOUSEHOLD =
  "Davey on the web shows what your household shares. Turn on Household Sharing in the Davey app (Settings › Household), then connect banks here or in the app."

export function usePlaidFlow() {
  const { reload } = useData()
  const [state, setState] = useState<FlowState>({ step: 'idle' })
  const handler = useRef<PlaidHandler | null>(null)
  // The connection's mode and its one automatic retry with the fallback token (see isFallbackExit).
  const mode = useRef<LinkMode>('bank')
  const consentInvestments = useRef(false)
  const fallbackRetried = useRef(false)
  const usingFallback = useRef(false)

  const finish = useCallback(
    async (publicToken: string, metadata: PlaidLinkMetadata) => {
      const startedAt = readPendingLink()?.startedAt
      clearPendingLink()
      setState({ step: 'saving', institution: metadata.institution?.name })
      try {
        const { itemId } = await exchangePublicToken(publicToken, metadata)
        const data = await loadDaveyData()
        const household = await householdID(data)
        if (!itemId || !household) throw new Error(NO_HOUSEHOLD)
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
      setState({ step: 'saving', institution: metadata.institution?.name })
      await syncItem(itemId)
      // "Finish setting up": Investments was just added to this connection: pull holdings and history now.
      if (consentInvestments.current) {
        consentInvestments.current = false
        await syncInvestments(itemId).catch(() => undefined)
      }
      await reload()
      setState({ step: 'reconnected', institution: metadata.institution?.name })
    },
    [reload],
  )

  const open = useCallback(
    async (opts: { token: string; receivedRedirectUri?: string; updateItemId?: string }) => {
      await loadPlaid()
      handler.current?.destroy()
      handler.current = window.Plaid!.create({
        token: opts.token,
        receivedRedirectUri: opts.receivedRedirectUri,
        onSuccess: (publicToken, metadata) =>
          void (opts.updateItemId ? finishUpdate(opts.updateItemId, metadata) : finish(publicToken, metadata)),
        onExit: (err, metadata) => {
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
          // Plaid failed the session itself (API_ERROR / INTERNAL_SERVER_ERROR): once per connection, Link again with
          // the simplest token instead of showing the error.
          if (!opts.updateItemId && !fallbackRetried.current && isFallbackExit(err?.error_type, err?.error_code)) {
            fallbackRetried.current = true
            usingFallback.current = true
            void logLinkEvent({ event: 'fallback_retry', ...ids, config: 'fallback', retry: true })
            void retryWithFallback(metadata?.institution?.institution_id)
            return
          }
          if (err) {
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
          setState(err ? { step: 'error', message: err.display_message || 'The bank connection was interrupted. Try again.' } : { step: 'idle' })
        },
      })
      setState({ step: 'linking' })
      handler.current.open()
    },
    [finish, finishUpdate],
  )

  async function retryWithFallback(institutionId?: string) {
    setState({ step: 'starting' })
    try {
      const token = await createLinkToken({ mode: mode.current, fallback: true, institutionId })
      savePendingLink({ linkToken: token, startedAt: new Date().toISOString() })
      await openRef.current?.({ token })
    } catch (e) {
      setState({ step: 'error', message: (e as Error).message })
    }
  }
  const openRef = useRef<typeof open | null>(null)
  openRef.current = open

  const start = useCallback(async (updateItemId?: string, linkMode: LinkMode = 'bank', opts: { consentInvestments?: boolean } = {}) => {
    mode.current = updateItemId ? 'bank' : linkMode
    consentInvestments.current = Boolean(updateItemId && opts.consentInvestments)
    fallbackRetried.current = false
    usingFallback.current = false
    setState({ step: 'starting' })
    try {
      // A bank connected here is shared through the household; without one it would reach no device.
      if (!updateItemId && !(await householdID(await loadDaveyData()))) throw new Error(NO_HOUSEHOLD)
      const [token] = await Promise.all([createLinkToken({ itemId: updateItemId, mode: mode.current, consentInvestments: consentInvestments.current }), loadPlaid()])
      savePendingLink({ linkToken: token, startedAt: new Date().toISOString(), updateItemId })
      await open({ token, updateItemId })
    } catch (e) {
      setState({ step: 'error', message: (e as Error).message })
    }
  }, [open])

  /** Called once by /oauth after an OAuth bank redirects back. */
  const resume = useCallback(
    async (receivedRedirectUri: string) => {
      const pending = readPendingLink()
      if (!pending) {
        setState({ step: 'error', message: 'This bank connection session expired. Start again from Connect a Bank.' })
        return
      }
      setState({ step: 'starting' })
      try {
        await open({ token: pending.linkToken, receivedRedirectUri, updateItemId: pending.updateItemId })
      } catch (e) {
        setState({ step: 'error', message: (e as Error).message })
      }
    },
    [open],
  )

  return { state, setState, start, resume }
}
