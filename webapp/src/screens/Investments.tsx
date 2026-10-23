import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { compact } from '../components/BarChart'
import { Stat } from '../components/Controls'
import { Forecaster } from '../components/Forecaster'
import { LineChart } from '../components/LineChart'
import { Spinner } from '../components/Spinner'
import { useData } from '../lib/DataProvider'
import { maskLabel, money, moneyWhole } from '../lib/format'
import {
  compactName, historyIsEstimated, normalizeSnapshots, periods, pointsSince, portfolioSeries, RANGES, rangeStart,
  timeWeightedReturn, type Range,
} from '../lib/investments'
import { itemStatuses, syncInvestments, type ItemStatus } from '../lib/plaid'
import { normalizeHoldings } from '../lib/tables'
import { useTable } from '../lib/useTable'

const TYPE_LABEL: Record<string, string> = { equity: 'Stocks', etf: 'ETFs', 'mutual fund': 'Funds', 'fixed income': 'Bonds', cash: 'Cash', cryptocurrency: 'Crypto', derivative: 'Options', other: 'Other' }
const pct = (f: number | undefined) => (f === undefined ? '—' : `${f >= 0 ? '+' : ''}${(f * 100).toFixed(1)}%`)
const today = () => new Date().toISOString().slice(0, 10)
const shortInstitution = (name: string) => name.split(' ').slice(0, 2).join(' ')

type SortKey = 'value' | 'gain' | 'ticker' | 'share'

export function Investments() {
  const { accounts } = useData()
  const holdingsT = useTable('holdings')
  const securitiesT = useTable('securities')
  const snapshotsT = useTable('snapshots')
  const [statuses, setStatuses] = useState<ItemStatus[]>([])
  const [range, setRange] = useState<Range>('1Y')
  const [granularity, setGranularity] = useState<'monthly' | 'quarterly' | 'annual'>('monthly')
  const [sort, setSort] = useState<SortKey>('value')
  const [refreshing, setRefreshing] = useState(false)
  const [notice, setNotice] = useState('')
  useEffect(() => { void itemStatuses().then(setStatuses) }, [])

  const invest = useMemo(() => (accounts ?? []).filter((a) => (a.type === 'investment' || a.type === 'brokerage') && !a.hidden), [accounts])
  // Holdings and history are keyed by Plaid's account ID (manual or older rows by Davey's).
  const ids = useMemo(() => new Set(invest.flatMap((a) => [a.id, ...(a.plaidAccountId ? [a.plaidAccountId] : [])])), [invest])
  const holdings = useMemo(() => normalizeHoldings(holdingsT.result?.rows ?? [], securitiesT.result?.rows ?? [])
    .filter((h) => h.accountId && ids.has(h.accountId)), [holdingsT.result, securitiesT.result, ids])
  const snapshots = useMemo(() => normalizeSnapshots(snapshotsT.result?.rows ?? []), [snapshotsT.result])
  const series = useMemo(() => portfolioSeries(snapshots, ids), [snapshots, ids])

  if (!accounts || !holdingsT.result || !snapshotsT.result) return <Spinner label="Loading investments" />

  const total = invest.reduce((s, a) => s + a.balance, 0)
  const withBasis = holdings.filter((h) => h.costBasis !== undefined)
  const gain = withBasis.reduce((s, h) => s + h.value - (h.costBasis ?? 0), 0)
  const basis = withBasis.reduce((s, h) => s + (h.costBasis ?? 0), 0)
  const last = series[series.length - 1]
  const prev = series[series.length - 2]
  const todaysChange = last && prev ? last.value - prev.value - last.netFlow : undefined
  const window = pointsSince(series, rangeStart(range, today()))
  const rangeReturn = timeWeightedReturn(window)
  const rangeChange = window.length > 1 ? window[window.length - 1].value - window[0].value : undefined
  const estimated = historyIsEstimated(snapshots, ids)
  const growth = periods(series, granularity, granularity === 'monthly' ? 12 : granularity === 'quarterly' ? 8 : 3, today())
  const best = growth.filter((p) => p.returnFraction !== undefined).sort((a, b) => (b.returnFraction ?? 0) - (a.returnFraction ?? 0))[0]
  const setupNeeded = statuses.filter((s) => s.investments_status === 'needs_consent' && invest.some((a) => a.itemId === s.item_id))

  // Allocation by asset class (five slots, the rest folds into Other) and by account.
  const byType = new Map<string, number>()
  for (const h of holdings) {
    const t = TYPE_LABEL[(h.type ?? 'other').toLowerCase()] ?? 'Other'
    byType.set(t, (byType.get(t) ?? 0) + h.value)
  }
  const holdingsTotal = holdings.reduce((s, h) => s + h.value, 0) || 1
  const sortedTypes = [...byType].sort((a, b) => b[1] - a[1])
  const alloc: [string, number][] = sortedTypes.length > 6 ? [...sortedTypes.slice(0, 5), ['Other', sortedTypes.slice(5).reduce((s, [, v]) => s + v, 0)]] : sortedTypes
  const byAccount = invest.map((a) => [compactName(a), a.balance] as const).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])

  const sortedHoldings = [...holdings].sort((x, y) => {
    if (sort === 'ticker') return (x.ticker ?? x.name).localeCompare(y.ticker ?? y.name)
    if (sort === 'gain') return (y.value - (y.costBasis ?? y.value)) - (x.value - (x.costBasis ?? x.value))
    return y.value - x.value
  })

  async function refresh() {
    setRefreshing(true)
    setNotice('')
    const items = [...new Set(invest.map((a) => a.itemId).filter((x): x is string => Boolean(x)))]
    try {
      for (const item of items) await syncInvestments(item, true)
      await Promise.all([holdingsT.reload(), securitiesT.reload(), snapshotsT.reload()])
      setNotice('Updated.')
      setStatuses(await itemStatuses())
    } catch (e) {
      setNotice((e as Error).message)
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Investments</h1><p>Brokerage and retirement accounts, and what's in them.</p></div>
        {invest.length > 0 && <button className="btn btn-secondary" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh'}</button>}
      </div>
      {notice && <p className="muted" role="status">{notice}</p>}
      {(holdingsT.error || securitiesT.error || snapshotsT.error) && (
        <div className="banner card" role="alert">
          <span>{holdingsT.error || securitiesT.error || snapshotsT.error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void Promise.all([holdingsT.reload(), securitiesT.reload(), snapshotsT.reload()])}>Try again</button>
        </div>
      )}
      {setupNeeded.map((s) => (
        <section className="card banner" key={s.item_id} role="region" aria-label="Finish setup">
          <div><strong>Finish setting up {shortInstitution(s.institution_name ?? 'your brokerage')} to see holdings &amp; history</strong>
            <p className="muted small">Opens Plaid to add investment access to this connection. No need to connect again.</p></div>
          <Link className="btn btn-primary" to={`/connect?reconnect=${encodeURIComponent(s.item_id)}&consent=investments`}>Finish setup</Link>
        </section>
      ))}
      {invest.length === 0 ? (
        <section className="card"><div className="empty"><p>No investment accounts connected.</p><Link className="btn btn-primary" to="/connect">Connect a Bank</Link></div></section>
      ) : (
        <>
          <section className="card card-pad">
            <div className="stats">
              <Stat label="Portfolio value" value={money(total)} sub={todaysChange !== undefined ? `${todaysChange >= 0 ? '+' : ''}${money(todaysChange)} today` : undefined} />
              {withBasis.length > 0 && <Stat label="Total gain / loss" value={money(gain, 'USD', { sign: true })} tone={gain >= 0 ? 'positive' : 'negative'} sub={basis ? `${((gain / basis) * 100).toFixed(1)}% on cost` : undefined} />}
              <Stat label="Accounts" value={String(invest.length)} />
            </div>
          </section>

          <section className="card card-pad" aria-labelledby="perf">
            <div className="card-head wrap" style={{ padding: 0 }}>
              <h2 id="perf">Performance {estimated && <span className="chip" title="Rebuilt from today's holdings and your investment transactions until Davey has 30 days of its own daily values.">Estimated history</span>}</h2>
              <div className="segmented compact" role="group" aria-label="Range">
                {RANGES.map((r) => <button key={r} type="button" aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>)}
              </div>
            </div>
            {window.length > 1 ? (
              <>
                <p className="muted small">{rangeChange !== undefined && `${rangeChange >= 0 ? '+' : ''}${moneyWhole(rangeChange)} · `}{pct(rangeReturn)} time-weighted (deposits and withdrawals left out)</p>
                <LineChart fitRange label={`Portfolio value, ${range}`} format={compact}
                  points={window.map((p) => ({ label: new Date(p.date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }), title: `${p.date}: ${moneyWhole(p.value)}`, values: { value: p.value } }))}
                  series={[{ key: 'value', name: 'Value', className: 'mark-gold' }]} />
              </>
            ) : <p className="muted">History appears after the first sync{setupNeeded.length ? ' (finish setup above)' : ''}.</p>}
          </section>

          {growth.length > 0 && (
            <section className="card" aria-labelledby="growth">
              <div className="card-head wrap">
                <h2 id="growth">Growth</h2>
                <div className="segmented compact" role="group" aria-label="Period">
                  {(['monthly', 'quarterly', 'annual'] as const).map((g) => <button key={g} type="button" aria-pressed={granularity === g} onClick={() => setGranularity(g)}>{g[0].toUpperCase() + g.slice(1)}</button>)}
                </div>
              </div>
              {best && <p className="muted small card-notice">Best period: {best.label}, {pct(best.returnFraction)}</p>}
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th scope="col">Period</th><th scope="col" className="num">Growth</th><th scope="col" className="num">Return</th><th scope="col" className="num hide-sm">Added</th></tr></thead>
                  <tbody>{[...growth].reverse().map((p) => (
                    <tr key={p.start}><th scope="row">{p.label}</th>
                      <td className={'num ' + (p.growth >= 0 ? 'positive' : 'negative')}>{moneyWhole(p.growth, { sign: true })}</td>
                      <td className="num">{pct(p.returnFraction)}</td>
                      <td className="num hide-sm">{moneyWhole(p.contributions, { sign: true })}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            </section>
          )}

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
              {byAccount.length > 1 && (
                <>
                  <h3 className="small">By account</h3>
                  <ul className="alloc-legend">{byAccount.map(([n, v]) => <li key={n}><span>{n}</span><b className="num">{Math.round((v / (total || 1)) * 100)}%</b><span className="muted num">{money(v)}</span></li>)}</ul>
                </>
              )}
            </section>
          )}

          {holdings.length > 0 && (
            <section className="card" aria-labelledby="holdings">
              <div className="card-head">
                <h2 id="holdings">Holdings</h2>
                <label className="holdings-sort small">Sort <select className="input" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                  <option value="value">Value</option><option value="gain">Gain</option><option value="ticker">Name</option></select></label>
              </div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th scope="col">Holding</th><th scope="col" className="num hide-sm">Shares</th><th scope="col" className="num">Value</th><th scope="col" className="num">Gain</th><th scope="col" className="num hide-sm">% of portfolio</th></tr></thead>
                  <tbody>{sortedHoldings.map((h) => {
                    const g = h.costBasis !== undefined ? h.value - h.costBasis : undefined
                    return (
                      <tr key={`${h.accountId}-${h.id}`}>
                        <th scope="row"><span className="ticker">{h.ticker ?? '—'}</span> <span className="muted holding-name">{h.name}</span></th>
                        <td className="num hide-sm">{h.quantity.toLocaleString('en-US', { maximumFractionDigits: 4 })}</td>
                        <td className="num">{moneyWhole(h.value)}</td>
                        <td className={'num ' + (g === undefined ? '' : g >= 0 ? 'positive' : 'negative')}>{g === undefined ? '—' : moneyWhole(g, { sign: true })}</td>
                        <td className="num hide-sm">{((h.value / holdingsTotal) * 100).toFixed(1)}%</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </section>
          )}

          <Forecaster currentValue={total} />

          <section className="card" aria-labelledby="inv-accounts">
            <div className="card-head"><h2 id="inv-accounts">Accounts</h2></div>
            <ul className="list">
              {invest.map((a) => {
                const own = portfolioSeries(snapshots, new Set([a.id, ...(a.plaidAccountId ? [a.plaidAccountId] : [])]))
                const yearGrowth = timeWeightedReturn(pointsSince(own, rangeStart('1Y', today())))
                return (
                  <li key={a.id} className="row">
                    <div className="row-main">
                      <span className="row-title two-lines" title={a.name}>{compactName(a)}</span>
                      <span className="row-sub">{[a.institution, maskLabel(a.mask)].filter(Boolean).join(' · ')}{yearGrowth !== undefined ? ` · 1Y ${pct(yearGrowth)}` : ''}</span>
                    </div>
                    <strong className="num">{money(a.balance)}</strong>
                  </li>
                )
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
