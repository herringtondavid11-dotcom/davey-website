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
  readPendingLink,
  saveLinkIssue,
  savePendingLink,
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

  const start = useCallback(async (updateItemId?: string) => {
    setState({ step: 'starting' })
    try {
      // A bank connected here is shared through the household; without one it would reach no device.
      if (!updateItemId && !(await householdID(await loadDaveyData()))) throw new Error(NO_HOUSEHOLD)
      const [token] = await Promise.all([createLinkToken({ itemId: updateItemId }), loadPlaid()])
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
