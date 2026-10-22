import { useCallback, useRef, useState } from 'react'
import { useData } from '../lib/DataProvider'
import { toAccount } from '../lib/bank'
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

export function usePlaidFlow() {
  const { reload } = useData()
  const [state, setState] = useState<FlowState>({ step: 'idle' })
  const handler = useRef<PlaidHandler | null>(null)

  const finish = useCallback(
    async (publicToken: string, metadata: PlaidLinkMetadata) => {
      clearPendingLink()
      setState({ step: 'saving', institution: metadata.institution?.name })
      try {
        const result = await exchangePublicToken(publicToken, metadata)
        const item = { item_id: result.itemId ?? '', needs_sync: false, status: 'ok', institution_name: result.institutionName ?? null, created_at: new Date().toISOString() }
        const accounts = result.accounts.map((a) => toAccount(a, item))
        setState({ step: 'naming', accounts, institution: result.institutionName })
        // Pull the new bank's transactions in the background while the user names accounts.
        void reload()
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
