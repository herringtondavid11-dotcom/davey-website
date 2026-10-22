import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Stat } from '../components/Controls'
import { Spinner } from '../components/Spinner'
import { useData } from '../lib/DataProvider'
import { displayName, maskLabel, money, moneyWhole } from '../lib/format'
import { normalizeHoldings } from '../lib/tables'
import { useTable } from '../lib/useTable'

const TYPE_LABEL: Record<string, string> = { equity: 'Stocks', etf: 'ETFs', 'mutual fund': 'Funds', 'fixed income': 'Bonds', cash: 'Cash', cryptocurrency: 'Crypto', derivative: 'Options', other: 'Other' }

export function Investments() {
  const { accounts } = useData()
  const holdingsT = useTable('holdings')
  const securitiesT = useTable('securities')
  const invest = useMemo(() => (accounts ?? []).filter((a) => (a.type === 'investment' || a.type === 'brokerage') && !a.hidden), [accounts])
  const holdings = useMemo(() => normalizeHoldings(holdingsT.result?.rows ?? [], securitiesT.result?.rows ?? []), [holdingsT.result, securitiesT.result])

  if (!accounts || !holdingsT.result) return <Spinner label="Loading investments" />
  const total = invest.reduce((s, a) => s + a.balance, 0)
  const withBasis = holdings.filter((h) => h.costBasis !== undefined)
  const gain = withBasis.reduce((s, h) => s + h.value - (h.costBasis ?? 0), 0)
  const basis = withBasis.reduce((s, h) => s + (h.costBasis ?? 0), 0)
  const byType = new Map<string, number>()
  for (const h of holdings) {
    const t = TYPE_LABEL[(h.type ?? 'other').toLowerCase()] ?? 'Other'
    byType.set(t, (byType.get(t) ?? 0) + h.value)
  }
  const holdingsTotal = holdings.reduce((s, h) => s + h.value, 0)
  // Five categorical slots; anything beyond folds into Other (never a generated sixth hue).
  const sorted = [...byType].sort((a, b) => b[1] - a[1])
  const alloc: [string, number][] = sorted.length > 5 ? [...sorted.slice(0, 4), ['Other', sorted.slice(4).reduce((s, [, v]) => s + v, 0)]] : sorted

  return (
    <div className="page">
      <div className="page-head"><div><h1>Investments</h1><p>Brokerage and retirement accounts, and what's in them.</p></div></div>
      {invest.length === 0 ? (
        <section className="card"><div className="empty"><p>No investment accounts connected.</p><Link className="btn btn-primary" to="/connect">Connect a Bank</Link></div></section>
      ) : (
        <>
          <section className="card card-pad">
            <div className="stats">
              <Stat label="Total invested" value={money(total)} />
              {withBasis.length > 0 && <Stat label="Gain / loss" value={money(gain, 'USD', { sign: true })} tone={gain >= 0 ? 'positive' : 'negative'} sub={basis ? `${((gain / basis) * 100).toFixed(1)}% on cost` : undefined} />}
              <Stat label="Accounts" value={String(invest.length)} />
            </div>
          </section>
          {alloc.length > 0 && (
            <section className="card card-pad" aria-labelledby="alloc">
              <h2 id="alloc">Allocation</h2>
              <div className="alloc-bar" role="img" aria-label={alloc.map(([t, v]) => `${t} ${Math.round((v / holdingsTotal) * 100)}%`).join(', ')}>
                {alloc.map(([t, v], i) => <span key={t} className={`alloc-${t === 'Other' ? 'other' : i}`} style={{ width: `${(v / holdingsTotal) * 100}%` }} />)}
              </div>
              <ul className="alloc-legend">
                {alloc.map(([t, v], i) => (
                  <li key={t}><i className={`swatch alloc-${t === 'Other' ? 'other' : i}`} /><span>{t}</span><b className="num">{Math.round((v / holdingsTotal) * 100)}%</b><span className="muted num">{money(v)}</span></li>
                ))}
              </ul>
            </section>
          )}
          {invest.map((a) => {
            const list = holdings.filter((h) => h.accountId === a.id || h.accountId === a.plaidAccountId).sort((x, y) => y.value - x.value)
            return (
              <section className="card" key={a.id} aria-label={displayName(a)}>
                <div className="card-head">
                  <div><h2>{displayName(a)}</h2><p className="muted small">{[a.institution, maskLabel(a.mask)].filter(Boolean).join(' · ')}</p></div>
                  <strong className="num">{money(a.balance)}</strong>
                </div>
                {list.length > 0 ? (
                  <div className="table-wrap">
                    <table className="data-table">
                      <thead><tr><th scope="col">Holding</th><th scope="col" className="hide-sm">Shares</th><th scope="col" className="hide-sm">Price</th><th scope="col">Value</th><th scope="col">Gain</th></tr></thead>
                      <tbody>
                        {list.map((h) => {
                          const g = h.costBasis !== undefined ? h.value - h.costBasis : undefined
                          return (
                            <tr key={h.id}>
                              <th scope="row"><span className="ticker">{h.ticker ?? '—'}</span> <span className="muted holding-name">{h.name}</span></th>
                              <td className="num hide-sm">{h.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                              <td className="num hide-sm">{h.price !== undefined ? money(h.price) : '—'}</td>
                              <td className="num">{moneyWhole(h.value)}</td>
                              <td className={'num ' + (g === undefined ? '' : g >= 0 ? 'positive' : 'negative')}>{g === undefined ? '—' : moneyWhole(g, { sign: true })}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="muted card-notice">{holdingsT.result?.available ? 'No holdings reported for this account yet.' : 'Holdings appear here once the app shares them (the holdings table isn’t available yet).'}</p>
                )}
              </section>
            )
          })}
        </>
      )}
    </div>
  )
}
