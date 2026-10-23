import { useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ConnectionRow } from '../components/ConnectionStatus'
import { readLinkIssue, reportIssue } from '../lib/plaid'
import { normalizeItem } from '../lib/tables'
import { useTable } from '../lib/useTable'

const TOPICS: { q: string; a: string }[] = [
  { q: 'My bank opens a new window or app and never comes back', a: "Some banks (Chase, Wells Fargo, Bank of America, Capital One…) sign you in on their own site. Allow pop-ups for daveypersonalfinance.com, finish signing in, and you'll return to Davey at /app/oauth. If you closed that tab, start again from Connect an account." },
  { q: 'It says my login is required again', a: 'Banks expire access every so often or after a password change. Open Accounts and tap Reconnect next to the bank. Your history and nicknames stay.' },
  { q: "I can't find my bank", a: 'Search by the name on your statement, or the parent company (for example "Navy Federal" rather than "NFCU"). Small credit unions sometimes connect through a different name. If it really is missing, report it below.' },
  { q: 'Some accounts are missing', a: 'When connecting, make sure every account is ticked on the account-selection screen. To add more later, Reconnect the bank and select them.' },
  { q: 'Balances or transactions look out of date', a: 'Most banks update once or twice a day. Pending transactions can take 1–3 days to post. If nothing has synced for 2 days, the connection probably needs a reconnect.' },
  { q: 'Two-factor code or security questions fail', a: 'Use the newest code your bank sends, and finish within a couple of minutes. If your bank offers several 2-factor methods, a text message usually works best.' },
  { q: 'Is it safe?', a: 'Davey uses Plaid. Your bank password goes to your bank through Plaid, never to Davey. Davey has read-only access and cannot move money. You can disconnect any time in the app.' },
]

const KINDS = ["Can't find my bank", 'Sign-in fails', 'Stuck after bank sign-in (OAuth)', 'Missing accounts', 'Wrong or old balances', 'Missing transactions', 'Something else']

export function ConnectionHelp() {
  const location = useLocation()
  const items = useTable('items')
  const connections = useMemo(() => (items.result?.rows ?? []).map(normalizeItem), [items.result])
  const lastIssue = useMemo(() => readLinkIssue(), [])
  const [institution, setInstitution] = useState(new URLSearchParams(location.search).get('institution') ?? lastIssue?.institution ?? '')
  const [kind, setKind] = useState(lastIssue ? 'Sign-in fails' : KINDS[0])
  const [details, setDetails] = useState('')
  const [includeIds, setIncludeIds] = useState(true)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<null | { sent: true } | { sent: false; mailto: string }>(null)
  const issues = connections.filter((c) => c.health !== 'ok')

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    const r = await reportIssue({ institution: institution.trim(), kind, details: details.trim(), issue: includeIds ? lastIssue : null })
    setBusy(false)
    setResult(r)
    if (!r.sent) window.location.href = r.mailto
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Connection help</h1><p>Fix a bank connection, or tell us what went wrong.</p></div></div>

      {issues.length > 0 && (
        <section className="card alert-card" aria-labelledby="needs">
          <div className="card-head"><h2 id="needs">Needs attention</h2></div>
          {issues.map((c) => <ConnectionRow key={c.id} c={c} />)}
        </section>
      )}

      <section className="card" aria-labelledby="faq">
        <div className="card-head"><h2 id="faq">Common problems</h2></div>
        <div className="faq">
          {TOPICS.map((t) => (
            <details key={t.q}>
              <summary>{t.q}</summary>
              <p>{t.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="card card-pad" aria-labelledby="report">
        <h2 id="report">Report to Plaid</h2>
        <p className="muted" style={{ margin: '6px 0 16px' }}>
          We send this to Plaid with the technical details they need (no passwords or balances).
        </p>
        {result?.sent ? (
          <p className="notice" role="status">Thanks — your report was sent. We'll email you when there's an update.</p>
        ) : (
          <form className="form" onSubmit={submit}>
            <div className="form-grid">
              <label className="field">
                <span>Bank</span>
                <input className="input" list="banks" required value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. Chase" />
                <datalist id="banks">{connections.map((c) => <option key={c.id} value={c.institution} />)}</datalist>
              </label>
              <label className="field">
                <span>What happened</span>
                <select className="input" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
              </label>
            </div>
            <label className="field">
              <span>Details</span>
              <textarea className="input" maxLength={2000} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What did you see? Any error message?" />
            </label>
            {lastIssue && (
              <label className="check">
                <input type="checkbox" checked={includeIds} onChange={(e) => setIncludeIds(e.target.checked)} />
                <span>Include details from the last failed connection ({lastIssue.institution ?? 'unknown bank'}{lastIssue.errorCode ? `, ${lastIssue.errorCode}` : ''})</span>
              </label>
            )}
            {result && !result.sent && <p className="notice">Your email app should open with the report. If it didn't, <a href={result.mailto}>open it here</a>.</p>}
            <div><button className="btn btn-primary" disabled={busy || !institution.trim()}>{busy ? 'Sending…' : 'Send report'}</button></div>
          </form>
        )}
      </section>
      <p className="muted small">Still stuck? Email <a href="mailto:support@daveypersonalfinance.com">support@daveypersonalfinance.com</a> or see <Link to="/accounts">your accounts</Link>.</p>
    </div>
  )
}
