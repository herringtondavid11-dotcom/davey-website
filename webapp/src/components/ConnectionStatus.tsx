import { Link } from 'react-router-dom'
import { shortDateTime } from '../lib/format'
import type { BankConnection } from '../lib/tables'
import { AlertIcon, CheckIcon } from './Icons'

const LABEL: Record<BankConnection['health'], string> = {
  ok: 'Connected',
  needs_reauth: 'Needs you to sign in again',
  pending_expiration: 'Access expires soon',
  error: 'Connection problem',
}

export function ConnectionBadge({ c }: { c: BankConnection }) {
  const ok = c.health === 'ok'
  return (
    <span className={'status ' + (ok ? 'status-ok' : 'status-bad')}>
      {ok ? <CheckIcon size={14} /> : <AlertIcon size={14} />}
      {LABEL[c.health]}
    </span>
  )
}

export function ConnectionRow({ c, checking, problem, onRetry }: { c: BankConnection; checking?: boolean; problem?: string; onRetry?: () => void }) {
  // A login can be repaired with Reconnect (Plaid update mode); so can most other Item errors.
  const fixable = c.health !== 'ok'
  // The badge already says a login is needed; the check's message only adds something for other problems.
  const detail = (c.health === 'needs_reauth' ? undefined : problem) ?? (c.health !== 'ok' ? c.errorMessage : undefined)
  return (
    <div className="settings-row connection-row">
      <div style={{ minWidth: 0 }}>
        <strong>{c.institution}</strong> {checking ? <span className="status">Checking…</span> : <ConnectionBadge c={c} />}
        <p className="muted small">
          {c.lastSynced ? `Last synced ${shortDateTime(c.lastSynced)}` : 'Not synced yet'}
          {!checking && detail ? ` · ${detail}` : ''}
        </p>
      </div>
      <div className="row-actions">
        {fixable && !checking && c.health === 'error' && onRetry && <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>Try again</button>}
        {fixable && !checking && c.itemId && <Link className="btn btn-primary btn-sm" to={`/connect?reconnect=${encodeURIComponent(c.itemId)}`}>Reconnect</Link>}
        {c.health !== 'ok' && <Link className="btn btn-secondary btn-sm" to={`/help?institution=${encodeURIComponent(c.institution)}`}>Get help</Link>}
      </div>
    </div>
  )
}
