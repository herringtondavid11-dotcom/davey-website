import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { TRANSACTION_PAGE, fetchAccounts, fetchTransactions } from './data'
import type { Account, Transaction } from './schema'

interface DataContextValue {
  accounts: Account[] | null
  transactions: Transaction[] | null
  error: string | null
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

  const reload = useCallback(async () => {
    setError(null)
    try {
      const [a, t] = await Promise.all([fetchAccounts(), fetchTransactions(0)])
      setAccounts(a)
      setTransactions(t)
      setPage(0)
      setHasMore(t.length === TRANSACTION_PAGE)
    } catch (e) {
      setError((e as Error).message || "Couldn't load your data.")
      setAccounts((prev) => prev ?? [])
      setTransactions((prev) => prev ?? [])
    }
  }, [])

  const loadMore = useCallback(async () => {
    const next = await fetchTransactions(page + 1)
    setTransactions((prev) => [...(prev ?? []), ...next.filter((n) => !prev?.some((p) => p.id === n.id))])
    setPage(page + 1)
    setHasMore(next.length === TRANSACTION_PAGE)
  }, [page])

  useEffect(() => {
    void reload()
  }, [reload])

  const value = useMemo<DataContextValue>(
    () => ({
      accounts,
      transactions,
      error,
      hasMore,
      reload,
      loadMore,
      replaceTransaction: (t) => setTransactions((prev) => prev?.map((p) => (p.id === t.id ? t : p)) ?? prev),
      replaceAccount: (a) => setAccounts((prev) => prev?.map((p) => (p.id === a.id ? a : p)) ?? prev),
    }),
    [accounts, transactions, error, hasMore, reload, loadMore],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}
