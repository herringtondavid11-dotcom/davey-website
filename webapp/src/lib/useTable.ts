import { useCallback, useEffect, useState } from 'react'
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
      setError((e as Error).message || "Couldn't load.")
      setResult((prev) => prev ?? { rows: [], available: true })
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
