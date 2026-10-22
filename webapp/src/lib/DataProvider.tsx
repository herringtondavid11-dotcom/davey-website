import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { setAnnotationUser } from './annotations'
import { loadBankData, rebuild, type BankData, type BankItem, type ItemSyncError } from './bank'
import { setCurrentData } from './data'
import type { Account, Transaction } from './schema'

interface DataContextValue {
  accounts: Account[] | null
  transactions: Transaction[] | null
  items: BankItem[] | null
  syncErrors: ItemSyncError[]
  progress: { done: number; total: number } | null
  error: string | null
  hasMore: boolean
  reload: () => Promise<void>
  loadMore: () => Promise<void>
  /** Re-apply this browser's edits after one changes. */
  replaceTransaction: (t?: Transaction) => void
  replaceAccount: (a?: Account) => void
}

const DataContext = createContext<DataContextValue | null>(null)

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [data, setData] = useState<BankData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [, setVersion] = useState(0)
  const dataRef = useRef<BankData | null>(null)
  const userId = session?.user.id

  const reload = useCallback(async () => {
    setError(null)
    try {
      const d = await loadBankData((done, total) => setProgress({ done, total }))
      dataRef.current = d
      setCurrentData(d)
      setData(d)
    } catch (e) {
      setError((e as Error).message || "Couldn't load your banks.")
      const empty: BankData = dataRef.current ?? { items: [], accounts: [], transactions: [], errors: [], raw: [] }
      dataRef.current = empty
      setCurrentData(empty)
      setData(empty)
    } finally {
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    setAnnotationUser(userId)
    void reload()
    return () => setCurrentData(null)
  }, [reload, userId])

  const refresh = useCallback(() => {
    const d = dataRef.current
    if (!d) return
    const next = { ...d, ...rebuild(d.raw) }
    dataRef.current = next
    setCurrentData(next)
    setData(next)
    setVersion((v) => v + 1)
  }, [])

  const value = useMemo<DataContextValue>(
    () => ({
      accounts: data?.accounts ?? null,
      transactions: data?.transactions ?? null,
      items: data?.items ?? null,
      syncErrors: data?.errors ?? [],
      progress,
      error,
      hasMore: false,
      reload,
      loadMore: async () => undefined,
      replaceTransaction: refresh,
      replaceAccount: refresh,
    }),
    [data, progress, error, reload, refresh],
  )
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData outside DataProvider')
  return ctx
}
