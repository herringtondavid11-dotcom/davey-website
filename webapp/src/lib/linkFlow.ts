import type { PlaidLinkMetadata } from './plaid'
import type { Account } from './schema'

/** Which saved accounts came from this Link session (for Name Your Accounts). */
export function newAccountsFromLink(accounts: Account[], metadata: PlaidLinkMetadata, startedAt?: string): Account[] {
  const linked = metadata.accounts ?? []
  const ids = new Set(linked.map((a) => a.id))
  const byPlaidId = accounts.filter((a) => a.plaidAccountId && ids.has(a.plaidAccountId))
  if (byPlaidId.length) return byPlaidId

  if (startedAt) {
    const since = new Date(startedAt).getTime() - 60_000
    const recent = accounts.filter((a) => a.createdAt && new Date(a.createdAt).getTime() >= since)
    if (recent.length) return recent
  }

  const masks = new Set(linked.map((a) => a.mask).filter(Boolean))
  const institution = metadata.institution?.name
  return accounts.filter((a) => (a.mask && masks.has(a.mask)) && (!institution || !a.institution || a.institution === institution))
}
