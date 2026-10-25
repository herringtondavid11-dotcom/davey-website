import { useCallback, useEffect, useRef, useState } from 'react'
import { useData } from './DataProvider'
import { itemStatuses } from './plaid'
import { checkConnections, dueForCheck } from './refreshBank'
import { reloadDaveyData } from './serverData'
import type { BankConnection } from './tables'

/**
 * Checks flagged connections by syncing them (David, 2026-10-25: SoFi and PenFed stayed flagged on the web after the
 * banks were fine). A bank that syncs turns OK on every device; one that can't says why. `retry` checks one again now.
 */
export function useConnectionCheck(connections: BankConnection[], reloadItems: () => Promise<void>) {
  const { reload } = useData()
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [problems, setProblems] = useState<Map<string, string>>(new Map())
  const running = useRef(false)

  const run = useCallback(async (itemIds: string[]) => {
    if (!itemIds.length || running.current) return
    running.current = true
    setChecking(new Set(itemIds))
    try {
      const found = await checkConnections(itemIds, reloadDaveyData)
      setProblems((prev) => {
        const next = new Map(prev)
        for (const id of itemIds) {
          const message = found.get(id)
          if (message) next.set(id, message)
          else next.delete(id)
        }
        return next
      })
      await reloadDaveyData()
      await reloadItems()
      await reload()
    } finally {
      running.current = false
      setChecking(new Set())
    }
  }, [reload, reloadItems])

  // "Connection problem" is checked by syncing. A login problem is checked only once the server says Plaid accepts the
  // login again (fixed on another device): syncing it before that just fails.
  const flagged = connections.filter((c) => c.health !== 'ok' && c.itemId).map((c) => `${c.itemId}|${c.health}`).join(',')
  useEffect(() => {
    const due = flagged ? flagged.split(',').map((f) => f.split('|')).filter(([id]) => dueForCheck(id)) : []
    if (!due.length) return
    void (async () => {
      const needsServer = due.some(([, health]) => health !== 'error')
      const server = needsServer ? new Map((await itemStatuses()).map((s) => [s.item_id, s.status.toLowerCase()])) : new Map<string, string>()
      const loginFixed = (id: string) => { const s = server.get(id); return s !== undefined && !/login|expir|disconnect|revoked/.test(s) }
      await run(due.filter(([id, health]) => health === 'error' || loginFixed(id)).map(([id]) => id))
    })()
  }, [flagged, run])

  return { checking, problems, retry: (itemId: string) => run([itemId]) }
}
