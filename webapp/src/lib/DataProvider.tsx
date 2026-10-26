import { loadErrorMessage } from './loadError'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TRANSACTION_PAGE, fetchAccounts, fetchTransactions } from './data'
import type { Account, Transaction } from './schema'
import { loadDaveyData, reloadDaveyData } from './serverData'

interface DataContextValue {
  accounts: Account[] | null
  transactions: Transaction[] | null
  error: string | null
  /** `error` only when the first load failed and nothing is on screen yet. A later failure keeps `ready`. */
  status: 'loading' | 'ready' | 'error'
  hasMore: boolean
  reload: () => Promise<void>
  loadMore: () => Promise<void>
  replaceTransaction: (t: Transaction) => void
  replaceAccount: (a: Account) => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [transactions, setTransactions] = useState<Transaction[] | null>(null)
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const reload = useCallback(async () => {
    try {
      const [a, t] = await Promise.all([fetchAccounts(), fetchTransactions(0)])
      setAccounts(a)
      setTransactions(t)
      setPage(0)
      setHasMore(t.length === TRANSACTION_PAGE)
      setError(null)
      setStatus('ready')
      // Accounts an earlier web sync added by mistake are hidden once (repairAccounts.ts), then the screens reload.
      if (await (await import('./repairAccounts')).repairOnce(loadDaveyData)) {
        await reloadDaveyData()
        const [a2, t2] = await Promise.all([fetchAccounts(), fetchTransactions(0)])
        setAccounts(a2)
        setTransactions(t2)
      }
    } catch (e) {
      // Keep whatever is already on screen. An empty list would look like a brand-new account.
      setError(loadErrorMessage(e))
      setStatus((current) => (current === 'ready' ? 'ready' : 'error'))
    }
  }, [])

  const loadMore = useCallback(async () => {
    try {
      const next = await fetchTransactions(page + 1)
      setTransactions((prev) => [...(prev ?? []), ...next.filter((n) => !prev?.some((p) => p.id === n.id))])
      setPage(page + 1)
      setHasMore(next.length === TRANSACTION_PAGE)
    } catch (e) {
      setError(loadErrorMessage(e))
    }
  }, [page])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo<DataContextValue>(
    () => ({
      accounts,
      transactions,
      error,
      status,
      hasMore,
      reload,
      loadMore,
      replaceTransaction: (t) => setTransactions((prev) => prev?.map((p) => (p.id === t.id ? t : p)) ?? prev),
      replaceAccount: (a) => setAccounts((prev) => prev?.map((p) => (p.id === a.id ? a : p)) ?? prev),
    }),
    [accounts, transactions, error, status, hasMore, reload, loadMore],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}
