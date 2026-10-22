import { useCallback, useRef, useState } from 'react'
import { useData } from '../lib/DataProvider'
import { fetchAccounts } from '../lib/data'
import { newAccountsFromLink } from '../lib/linkFlow'
import {
  clearPendingLink,
  createLinkToken,
  exchangePublicToken,
  loadPlaid,
  readPendingLink,
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
  | { step: 'error'; message: string }

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
        await syncItem(itemId)
        const accounts = await fetchAccounts()
        await reload()
        setState({ step: 'naming', accounts: newAccountsFromLink(accounts, metadata, startedAt), institution: metadata.institution?.name })
      } catch (e) {
        setState({ step: 'error', message: (e as Error).message })
      }
    },
    [reload],
  )

  const open = useCallback(
    async (opts: { token: string; receivedRedirectUri?: string }) => {
      await loadPlaid()
      handler.current?.destroy()
      handler.current = window.Plaid!.create({
        token: opts.token,
        receivedRedirectUri: opts.receivedRedirectUri,
        onSuccess: (publicToken, metadata) => void finish(publicToken, metadata),
        onExit: (err) => {
          clearPendingLink()
          setState(err ? { step: 'error', message: err.display_message || 'The bank connection was interrupted. Try again.' } : { step: 'idle' })
        },
      })
      setState({ step: 'linking' })
      handler.current.open()
    },
    [finish],
  )

  const start = useCallback(async () => {
    setState({ step: 'starting' })
    try {
      const [token] = await Promise.all([createLinkToken(), loadPlaid()])
      savePendingLink({ linkToken: token, startedAt: new Date().toISOString() })
      await open({ token })
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
        await open({ token: pending.linkToken, receivedRedirectUri })
      } catch (e) {
        setState({ step: 'error', message: (e as Error).message })
      }
    },
    [open],
  )

  return { state, setState, start, resume }
}
