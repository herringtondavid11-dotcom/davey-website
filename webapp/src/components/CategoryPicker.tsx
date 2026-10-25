import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { addCategory, COLORS, type AccountCategory } from '../lib/accountCategories'
import { saveCategoryChanges } from '../lib/useAccountCategories'

const NEW = '__new'
const MANAGE = '__manage'
const AUTO = ''

/**
 * One account's category: any category, Automatic (from the account's type), a new one, or Manage categories.
 * `value` is the picked category's ID; `suggested` names what Automatic gives.
 */
export function CategoryPicker({ label, value, categories, suggested, onPick }: {
  label: string
  value?: string
  categories: AccountCategory[]
  suggested?: string
  onPick: (categoryId: string | null) => Promise<void>
}) {
  const navigate = useNavigate()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function pick(id: string | null) {
    setBusy(true)
    setError('')
    try {
      await onPick(id)
    } catch (e) {
      setError((e as Error).message || "Couldn't save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  async function create() {
    try {
      const color = COLORS[categories.length % COLORS.length]
      const change = addCategory(name, color, categories)
      setBusy(true)
      await saveCategoryChanges([change])
      setAdding(false)
      setName('')
      await pick(change.id)
    } catch (e) {
      setError((e as Error).message)
      setBusy(false)
    }
  }

  if (adding) {
    return (
      <span className="cat-picker">
        <input className="input" autoFocus maxLength={30} placeholder="New category" aria-label={`New category for ${label}`} value={name}
          onChange={(e) => { setName(e.target.value); setError('') }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void create() } if (e.key === 'Escape') setAdding(false) }} />
        <button type="button" className="btn btn-primary btn-sm" disabled={busy || !name.trim()} onClick={() => void create()}>Add</button>
        <button type="button" className="link-btn small" onClick={() => setAdding(false)}>Cancel</button>
        {error && <span className="error small" role="alert">{error}</span>}
      </span>
    )
  }
  return (
    <span className="cat-picker">
      <select className="input" aria-label={`Category for ${label}`} value={value ?? AUTO} disabled={busy}
        onChange={(e) => {
          const v = e.target.value
          if (v === NEW) return setAdding(true)
          if (v === MANAGE) return navigate('/settings#account-categories')
          void pick(v === AUTO ? null : v)
        }}>
        <option value={AUTO}>{suggested ? `${suggested} (auto)` : 'Automatic'}</option>
        {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        <option value={NEW}>New category…</option>
        <option value={MANAGE}>Manage categories…</option>
      </select>
      {error && <span className="error small" role="alert">{error}</span>}
    </span>
  )
}
