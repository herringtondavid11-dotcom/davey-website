import { useEffect, useRef, useState, type FormEvent } from 'react'
import { CloseIcon } from '../components/Icons'
import { updateTransaction } from '../lib/data'
import { displayName, maskLabel, money, shortDate } from '../lib/format'
import type { Account, Transaction, Usage } from '../lib/schema'
import { useBackToClose } from '../lib/useBackToClose'

export function EditTransaction({ t, account, categories, onClose, onSaved }: {
  t: Transaction
  account?: Account
  categories: string[]
  onClose: () => void
  onSaved: (t: Transaction) => void
}) {
  const [category, setCategory] = useState(t.category ?? '')
  const [notes, setNotes] = useState(t.notes ?? '')
  const [usage, setUsage] = useState<Usage>(t.usage)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sheet = useRef<HTMLDivElement>(null)
  useBackToClose(onClose)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    sheet.current?.querySelector<HTMLElement>('select, input, textarea')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus()
    }
  }, [onClose])

  const dirty = category !== (t.category ?? '') || notes !== (t.notes ?? '') || usage !== t.usage

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const edit = {
        ...(category !== (t.category ?? '') ? { category } : {}),
        ...(notes !== (t.notes ?? '') ? { notes } : {}),
        ...(usage !== t.usage ? { usage } : {}),
      }
      onSaved(await updateTransaction(t, edit))
    } catch (err) {
      setError((err as Error).message || "Couldn't save. Try again.")
      setBusy(false)
    }
  }

  const options = category && !categories.includes(category) ? [category, ...categories] : categories
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="edit-title" ref={sheet}>
        <div className="sheet-head">
          <div style={{ minWidth: 0 }}>
            <h2 id="edit-title" style={{ overflowWrap: 'anywhere' }}>{t.name}</h2>
            <p className="muted">{[shortDate(t.date), account && `${displayName(account)} ${maskLabel(account.mask)}`.trim(), t.pending && 'Pending'].filter(Boolean).join(' · ')}</p>
          </div>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        <div className={'sheet-amount num ' + (t.amount > 0 ? 'positive' : '')}>{money(t.amount, t.currency, { sign: t.amount > 0 })}</div>
        {t.originalName && t.originalName.toLowerCase() !== t.name.toLowerCase() && <p className="muted" style={{ fontSize: '.875rem' }}>Bank description: {t.originalName}</p>}
        <form className="form" onSubmit={submit}>
          <label className="field">
            <span>Category</span>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Uncategorized</option>
              {options.filter((c) => c !== 'Uncategorized').map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <div className="field">
            <span id="usage-label">Business or personal</span>
            <div className="segmented" role="group" aria-labelledby="usage-label">
              <button type="button" aria-pressed={usage === 'personal'} onClick={() => setUsage('personal')}>Personal</button>
              <button type="button" aria-pressed={usage === 'business'} onClick={() => setUsage('business')}>Business</button>
            </div>
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea className="input" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note" />
          </label>
          {error && <p className="error" role="alert">{error}</p>}
          <div className="sheet-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!dirty || busy}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
