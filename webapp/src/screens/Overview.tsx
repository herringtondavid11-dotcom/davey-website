import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from '../components/Spinner'
import { TransactionRow } from '../components/TransactionRow'
import { useData } from '../lib/DataProvider'
import { groupAccounts, isLiability, netWorth } from '../lib/finance'
import { displayName, maskLabel, money, typeLabel } from '../lib/format'

export function Overview() {
  const { accounts, transactions, error, reload } = useData()
  const byId = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts])
  const byPlaidId = useMemo(() => new Map((accounts ?? []).map((a) => [a.plaidAccountId ?? a.id, a])), [accounts])

  if (!accounts || !transactions) return <Spinner label="Loading your accounts" />
  const worth = netWorth(accounts)
  const groups = groupAccounts(accounts)
  const recent = transactions.slice(0, 8)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Overview</h1>
          <p>Everything in one place.</p>
        </div>
        <Link className="btn btn-primary" to="/connect">Connect a Bank</Link>
      </div>
      {error && (
        <div className="error-row">
          <p className="error" role="alert">{error}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reload()}>Try again</button>
        </div>
      )}
      <div className="overview-grid">
        <div style={{ display: 'grid', gap: 24 }}>
          <section className="card networth" aria-labelledby="nw">
            <div>
              <div className="label" id="nw">Net worth</div>
              <div className="value num" data-testid="net-worth">{money(worth.net)}</div>
            </div>
            <div className="split">
              <div><span>Assets</span><strong className="assets num">{money(worth.assets)}</strong></div>
              <div><span>Debts</span><strong className="debts num">{money(worth.liabilities)}</strong></div>
            </div>
          </section>

          <section className="card" aria-labelledby="accts">
            <div className="card-head"><h2 id="accts">Accounts</h2><Link to="/accounts">Manage</Link></div>
            {groups.length === 0 ? (
              <div className="empty">
                <p>No accounts yet.</p>
                <Link className="btn btn-primary" to="/connect">Connect a Bank</Link>
              </div>
            ) : (
              groups.map(([type, list]) => {
                const total = list.reduce((s, a) => s + (isLiability(a) ? Math.abs(a.balance) : a.balance), 0)
                return (
                  <div key={type}>
                    <div className="group-label"><span>{typeLabel(type)}</span><span className="num">{money(total)}</span></div>
                    <ul className="list">
                      {list.map((a) => (
                        <li key={a.id}>
                          <div className="row">
                            <span className="avatar" aria-hidden>{displayName(a).charAt(0).toUpperCase()}</span>
                            <span className="row-main">
                              <span className="row-title" style={{ display: 'block' }}>{displayName(a)}</span>
                              <span className="row-sub" style={{ display: 'block' }}>{[a.institution, maskLabel(a.mask)].filter(Boolean).join(' · ') || typeLabel(a.type)}</span>
                            </span>
                            <span className={'row-amount ' + (isLiability(a) ? 'negative' : '')}>
                              {money(isLiability(a) ? -Math.abs(a.balance) : a.balance, a.currency)}
                              {a.available !== undefined && !isLiability(a) && a.available !== a.balance && <small>{money(a.available, a.currency)} available</small>}
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })
            )}
          </section>
        </div>

        <section className="card" aria-labelledby="recent">
          <div className="card-head"><h2 id="recent">Recent transactions</h2><Link to="/transactions">See all</Link></div>
          {recent.length === 0 ? (
            <div className="empty"><p>Transactions appear here after your first bank sync.</p></div>
          ) : (
            <ul className="list">
              {recent.map((t) => (
                <li key={t.id}><TransactionRow t={t} account={t.accountId ? byId.get(t.accountId) ?? byPlaidId.get(t.accountId) : undefined} /></li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
