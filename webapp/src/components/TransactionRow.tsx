import { displayName, money, shortDate } from '../lib/format'
import type { Account, Transaction } from '../lib/schema'

function initial(name: string) {
  return (name.match(/[A-Za-z0-9]/)?.[0] ?? '•').toUpperCase()
}

export function TransactionRow({ t, account, onSelect, showDate = true }: { t: Transaction; account?: Account; onSelect?: (t: Transaction) => void; showDate?: boolean }) {
  const sub = [showDate ? shortDate(t.date) : null, t.category ?? 'Uncategorized', account ? displayName(account) : null].filter(Boolean).join(' · ')
  const content = (
    <>
      <span className="avatar alt" aria-hidden>{initial(t.name)}</span>
      <span className="row-main">
        <span className="row-title">
          {t.name}
          {t.usage === 'business' && <span className="chip chip-biz">Business</span>}
          {t.pending && <span className="chip chip-pending">Pending</span>}
        </span>
        <span className="row-sub" style={{ display: 'block' }}>{sub}</span>
      </span>
      <span className={'row-amount ' + (t.amount > 0 ? 'positive' : '')}>{money(t.amount, t.currency, { sign: t.amount > 0 })}</span>
    </>
  )
  return onSelect ? (
    <button type="button" className="row" onClick={() => onSelect(t)} aria-label={`${t.name}, ${money(t.amount, t.currency)}, edit`}>
      {content}
    </button>
  ) : (
    <div className="row">{content}</div>
  )
}
