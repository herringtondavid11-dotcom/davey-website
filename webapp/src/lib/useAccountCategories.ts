import { useCallback, useEffect, useState } from 'react'
import { effectiveCategories, type AccountCategory, type CategoryChange, type CategoryRecord } from './accountCategories'
import { loadDaveyData, pushRecords } from './serverData'

// Every screen showing account categories (Accounts, Settings) reads the same household records and refreshes when
// any of them saves.
const listeners = new Set<() => void>()

export async function saveCategoryChanges(changes: CategoryChange[]): Promise<void> {
  await pushRecords('accountCategory', changes)
  listeners.forEach((l) => l())
}

export function useAccountCategories(): { categories: AccountCategory[] | null; records: CategoryRecord[]; error?: string } {
  const [state, setState] = useState<{ categories: AccountCategory[] | null; records: CategoryRecord[]; error?: string }>({ categories: null, records: [] })
  const load = useCallback(() => {
    loadDaveyData().then(
      (d) => setState({ categories: effectiveCategories(d.accountCategories), records: d.accountCategories.map((r) => ({ id: r.id, payload: r.payload })) }),
      // Without household data the built-ins still work (nothing to save them to, though).
      (e: Error) => setState({ categories: effectiveCategories([]), records: [], error: e.message }),
    )
  }, [])
  useEffect(() => {
    load()
    listeners.add(load)
    return () => { listeners.delete(load) }
  }, [load])
  return state
}
