import { useState } from 'react'
import { UsageFilter } from '../components/Controls'
import { DownloadIcon } from '../components/Icons'
import { useData } from '../lib/DataProvider'
import { fetchTransactionsBetween } from '../lib/data'
import { accountNameMap, accountsCsv, download, fullZip, summaryPdf, transactionsCsv } from '../lib/exports'
import { displayName } from '../lib/format'
import type { Usage } from '../lib/schema'

type Range = 'this-month' | 'last-month' | 'ytd' | 'last-year' | 'custom'
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function rangeDates(range: Range, now = new Date()): { from: string; to: string; label: string } {
  const y = now.getFullYear()
  const m = now.getMonth()
  switch (range) {
    case 'this-month':
      return { from: ymd(new Date(y, m, 1)), to: ymd(now), label: now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
    case 'last-month': {
      const s = new Date(y, m - 1, 1)
      return { from: ymd(s), to: ymd(new Date(y, m, 0)), label: s.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) }
    }
    case 'last-year':
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: String(y - 1) }
    default:
      return { from: `${y}-01-01`, to: ymd(now), label: `${y} year to date` }
  }
}

export function Exports() {
  const { accounts } = useData()
  const [range, setRange] = useState<Range>('ytd')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [usage, setUsage] = useState<Usage | ''>('')
  const [accountId, setAccountId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const dates = range === 'custom' ? { from, to, label: `${from} to ${to}` } : rangeDates(range)
  const valid = Boolean(dates.from && dates.to && dates.from <= dates.to)

  async function run(kind: 'csv' | 'pdf' | 'zip') {
    if (!accounts) return
    setBusy(kind)
    setMessage(null)
    try {
      const account = accounts.find((a) => a.id === accountId)
      let list = await fetchTransactionsBetween(dates.from, dates.to)
      if (usage) list = list.filter((t) => t.usage === usage)
      if (account) list = list.filter((t) => t.accountId === account.id || t.accountId === account.plaidAccountId)
      const names = accountNameMap(accounts)
      const scope = [usage === 'business' ? 'Business' : usage === 'personal' ? 'Personal' : '', account ? displayName(account) : ''].filter(Boolean).join(' ')
      const base = `davey-${dates.from}-to-${dates.to}${usage ? '-' + usage : ''}`
      const input = { title: `${scope ? scope + ' ' : ''}Statement`, period: dates.label, from: dates.from, to: dates.to, list, accounts: account ? [account] : accounts, names }
      if (kind === 'csv') download(`${base}.csv`, transactionsCsv(list, names), 'text/csv;charset=utf-8')
      if (kind === 'pdf') download(`${base}.pdf`, summaryPdf(input), 'application/pdf')
      if (kind === 'zip') download(`${base}.zip`, fullZip(input), 'application/zip')
      setMessage({ ok: true, text: `Downloaded ${list.length} ${list.length === 1 ? 'transaction' : 'transactions'}.` })
    } catch (e) {
      setMessage({ ok: false, text: (e as Error).message || 'Export failed.' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Exports</h1><p>Download your transactions and statements. Files are made on this device.</p></div></div>
      <section className="card card-pad" aria-labelledby="exp-what">
        <h2 id="exp-what">What to include</h2>
        <div className="form-grid" style={{ marginTop: 14 }}>
          <label className="field">
            <span>Dates</span>
            <select className="input" value={range} onChange={(e) => setRange(e.target.value as Range)}>
              <option value="this-month">This month</option>
              <option value="last-month">Last month</option>
              <option value="ytd">This year to date</option>
              <option value="last-year">Last year</option>
              <option value="custom">Custom…</option>
            </select>
          </label>
          <label className="field">
            <span>Account</span>
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">All accounts</option>
              {(accounts ?? []).filter((a) => !a.hidden).map((a) => <option key={a.id} value={a.id}>{displayName(a)}{a.mask ? ` ••${a.mask.slice(-4)}` : ''}</option>)}
            </select>
          </label>
          {range === 'custom' && (
            <>
              <label className="field"><span>From</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="field"><span>To</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </>
          )}
        </div>
        <div className="field" style={{ marginTop: 16 }}>
          <span id="exp-usage">Business / Personal</span>
          <UsageFilter value={usage} onChange={setUsage} label="Business or personal" />
        </div>
        <p className="muted small" style={{ marginTop: 12 }}>{valid ? dates.label : 'Choose a start and end date.'}</p>
      </section>

      <div className="export-grid">
        {[
          { kind: 'csv' as const, title: 'Spreadsheet (CSV)', text: 'Every transaction with category, account, Business/Personal and notes. Opens in Excel, Numbers and Google Sheets.' },
          { kind: 'pdf' as const, title: 'Statement (PDF)', text: 'Income, spending, net worth, spending by category and every transaction, ready to print or share.' },
          { kind: 'zip' as const, title: 'Everything (ZIP)', text: 'Transactions CSV, accounts CSV and the PDF statement in one file.' },
        ].map((x) => (
          <section className="card card-pad export-card" key={x.kind} aria-label={x.title}>
            <h2>{x.title}</h2>
            <p className="muted">{x.text}</p>
            <button className="btn btn-primary" disabled={!valid || !!busy} onClick={() => run(x.kind)}>
              <DownloadIcon size={18} />{busy === x.kind ? 'Preparing…' : `Download ${x.kind.toUpperCase()}`}
            </button>
          </section>
        ))}
      </div>
      {message && <p className={message.ok ? 'success' : 'error'} role={message.ok ? 'status' : 'alert'}>{message.text}</p>}
      <p className="muted small">Accounts list only: <button className="link-btn" onClick={() => accounts && download('davey-accounts.csv', accountsCsv(accounts), 'text/csv;charset=utf-8')}>download accounts CSV</button>.</p>
    </div>
  )
}
