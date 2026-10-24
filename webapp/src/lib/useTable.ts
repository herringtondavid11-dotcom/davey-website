import { useCallback, useEffect, useState } from 'react'
import { loadErrorMessage } from './loadError'
import { fetchOptional, type OptionalTable, type TableResult } from './tables'

const cache = new Map<OptionalTable, TableResult>()

/** Loads an optional table once per session (cached); `reload` refetches. */
export function useTable(name: OptionalTable) {
  const [result, setResult] = useState<TableResult | null>(cache.get(name) ?? null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const r = await fetchOptional(name)
      cache.set(name, r)
      setResult(r)
      setError(null)
    } catch (e) {
      setError(loadErrorMessage(e))
      // A failed read is not "you have no rows". Leave a previous result; otherwise mark the table unavailable.
      setResult((prev) => prev ?? { rows: [], available: false })
    }
  }, [name])
  useEffect(() => {
    if (!cache.has(name)) void load()
  }, [name, load])
  return { result, error, reload: load }
}

export function clearTableCache() {
  cache.clear()
}

/** Loads a table into the cache ahead of its screen (idle prefetch), so the first visit renders without waiting. */
export function prefetchTable(name: OptionalTable): Promise<void> {
  if (cache.has(name)) return Promise.resolve()
  return fetchOptional(name).then((r) => { cache.set(name, r) }, () => undefined)
}
