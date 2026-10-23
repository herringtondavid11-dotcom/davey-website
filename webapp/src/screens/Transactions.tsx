import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SearchIcon } from '../components/Icons'
import { Spinner } from '../components/Spinner'
import { TransactionRow } from '../components/TransactionRow'
import { useData } from '../lib/DataProvider'
import { EMPTY_FILTER, categoryOptions, filterTransactions, type TransactionFilter } from '../lib/finance'
import { displayName, money, shortDate } from '../lib/format'
import type { Account, Transaction } from '../lib/schema'
import { EditTransaction } from './EditTransaction'

const VISIBLE_STEP = 100

export function Transactions() {
  const { accounts, transactions, hasMore, loadMore, replaceTransaction } = useData()
  const [params, setParams] = useSearchParams()
  const [filter, setFilter] = useState<TransactionFilter>(() => ({ ...EMPTY_FILTER, search: params.get('q') ?? '', category: params.get('category') ?? '' }))
  const onlyIds = useMemo(() => (params.get('ids') ? new Set(params.get('ids')!.split(',')) : null), [params])
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [visible, setVisible] = useState(VISIBLE_STEP)
  const [loadingMore, setLoadingMore] = useState(false)

  const accountMap = useMemo(() => {
    const m = new Map<string, Account>()
    for (const a of accounts ?? []) {
      m.set(a.id, a)
      if (a.plaidAccountId) m.set(a.plaidAccountId, a)
    }
    return m
  }, [accounts])
  const names = useMemo(() => new Map([...accountMap].map(([k, a]) => [k, displayName(a)])), [accountMap])
  const categories = useMemo(() => categoryOptions(transactions ?? []), [transactions])
  const filtered = useMemo(
    () => filterTransactions((transactions ?? []).filter((t) => !onlyIds || onlyIds.has(t.id)), filter, names),
    [transactions, filter, names, onlyIds],
  )
  useEffect(() => setVisible(VISIBLE_STEP), [filter])

  if (!accounts || !transactions) return <Spinner label="Loading transactions" />

  const set = <K extends keyof TransactionFilter>(k: K, v: TransactionFilter[K]) => setFilter((f) => ({ ...f, [k]: v }))
  const active = Object.entries(filter).some(([k, v]) => k !== 'search' && v)
  const shown = filtered.slice(0, visible)
  const total = filtered.reduce((s, t) => s + t.amount, 0)

  // Group by day, newest first (rows arrive sorted by date desc).
  const days: [string, Transaction[]][] = []
  for (const t of shown) {
    const last = days[days.length - 1]
    if (last && last[0] === t.date) last[1].push(t)
    else days.push([t.date, [t]])
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Transactions</h1>
          <p>Choose a transaction to change its category, notes, or Business/Personal.</p>
        </div>
      </div>
      <section className="card">
        <div className="toolbar">
          <label className="search">
            <span className="visually-hidden">Search transactions</span>
            <SearchIcon />
            <input className="input" type="search" placeholder="Search merchant, category, notes, amount" value={filter.search} onChange={(e) => set('search', e.target.value)} />
          </label>
          <div className="filters">
            <label className="field">
              <span>Account</span>
              <select className="input" value={filter.accountId} onChange={(e) => set('accountId', e.target.value)}>
                <option value="">All accounts</option>
                {accounts.filter((a) => !a.hidden).map((a) => (
                  <option key={a.id} value={a.plaidAccountId && transactions.some((t) => t.accountId === a.plaidAccountId) ? a.plaidAccountId : a.id}>{displayName(a)}{a.mask ? ` ••${a.mask.slice(-4)}` : ''}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Category</span>
              <select className="input" value={filter.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Business / Personal</span>
              <select className="input" value={filter.usage} onChange={(e) => set('usage', e.target.value as TransactionFilter['usage'])}>
                <option value="">Both</option>
                <option value="business">Business</option>
                <option value="personal">Personal</option>
              </select>
            </label>
            <label className="field">
              <span>Money</span>
              <select className="input" value={filter.direction} onChange={(e) => set('direction', e.target.value as TransactionFilter['direction'])}>
                <option value="">In and out</option>
                <option value="out">Money out</option>
                <option value="in">Money in</option>
              </select>
            </label>
            <label className="field">
              <span>From</span>
              <input className="input" type="date" value={filter.from} max={filter.to || undefined} onChange={(e) => set('from', e.target.value)} />
            </label>
            <label className="field">
              <span>To</span>
              <input className="input" type="date" value={filter.to} min={filter.from || undefined} onChange={(e) => set('to', e.target.value)} />
            </label>
          </div>
          <div className="filter-actions">
            <span className="muted" role="status">
              {filtered.length} {filtered.length === 1 ? 'transaction' : 'transactions'} · net <span className="num">{money(total, 'USD', { sign: true })}</span>
            </span>
            {(active || filter.search || onlyIds) && (
              <button type="button" className="link-btn" onClick={() => { setFilter(EMPTY_FILTER); if (params.toString()) setParams({}, { replace: true }) }}>
                {onlyIds ? `Showing ${onlyIds.size} from Davey AI · Clear` : 'Clear filters'}
              </button>
            )}
          </div>
        </div>
        {days.length === 0 ? (
          <div className="empty"><p>{transactions.length ? 'No transactions match these filters.' : 'No transactions yet.'}</p></div>
        ) : (
          days.map(([day, list]) => (
            <div key={day}>
              <div className="day">{shortDate(day)}</div>
              <ul className="list">
                {list.map((t) => (
                  <li key={t.id}>
                    <TransactionRow t={t} showDate={false} account={t.accountId ? accountMap.get(t.accountId) : undefined} onSelect={setEditing} />
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        {(filtered.length > visible || hasMore) && (
          <div className="empty">
            <button
              type="button"
              className="btn btn-secondary"
              disabled={loadingMore}
              onClick={async () => {
                if (filtered.length > visible) return setVisible((v) => v + VISIBLE_STEP)
                setLoadingMore(true)
                await loadMore().finally(() => setLoadingMore(false))
              }}
            >
              {loadingMore ? 'Loading…' : 'Show more'}
            </button>
          </div>
        )}
      </section>
      {editing && (
        <EditTransaction
          t={editing}
          account={editing.accountId ? accountMap.get(editing.accountId) : undefined}
          categories={categories}
          onClose={() => setEditing(null)}
          onSaved={(t) => {
            replaceTransaction(t)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
