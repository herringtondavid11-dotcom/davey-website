import '../styles/accounts.css'
import { useEffect, useRef, useState } from 'react'
import {
  addCategory, COLORS, moveCategory, recolorCategory, removeCategory, renameCategory, type AccountCategory, type ColorName,
} from '../lib/accountCategories'
import { useData } from '../lib/DataProvider'
import { refreshData } from '../lib/data'
import { loadDaveyData, pushRecords } from '../lib/serverData'
import { saveCategoryChanges, useAccountCategories } from '../lib/useAccountCategories'

const COLOR_LABEL: Record<ColorName, string> = {
  blue: 'Blue', ochre: 'Ochre', sage: 'Sage', clay: 'Clay', teal: 'Teal', olive: 'Olive', slate: 'Slate', gold: 'Gold', sand: 'Sand', terracotta: 'Terracotta',
}

function ColorPicker({ value, label, onPick }: { value: ColorName; label: string; onPick: (c: ColorName) => void }) {
  return (
    <span className="color-pick">
      <i className={`swatch cc-${value}`} aria-hidden="true" />
      <select className="input" aria-label={`Colour for ${label}`} value={value} onChange={(e) => onPick(e.target.value as ColorName)}>
        {COLORS.map((c) => <option key={c} value={c}>{COLOR_LABEL[c]}</option>)}
      </select>
    </span>
  )
}

/** Settings › Account categories: add, rename, recolour, reorder, and remove (moving its accounts first). Shared with the household. */
export function CategoryManager() {
  const { categories, records, error: loadError } = useAccountCategories()
  const { accounts, reload } = useData()
  const [error, setError] = useState('')
  const [removing, setRemoving] = useState<AccountCategory | null>(null)
  const [reassign, setReassign] = useState('')
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState<ColorName>('blue')
  const [busy, setBusy] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const ready = categories !== null
  // "Manage categories…" from an account lands here (/settings#account-categories).
  useEffect(() => {
    if (ready && window.location.hash === '#account-categories') ref.current?.scrollIntoView({ block: 'start' })
  }, [ready])

  async function run(work: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (e) {
      setError((e as Error).message || "Couldn't save. Try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!categories) return null
  const inUse = (c: AccountCategory) => removeCategory(c, undefined, accounts ?? [], records).accounts.length

  return (
    <section ref={ref} className="card card-pad" id="account-categories" aria-labelledby="cat-title">
      <div className="card-head"><h2 id="cat-title">Account categories</h2></div>
      <p className="muted small">Accounts roll up by these on the Accounts tab. Shared with your household. An account without one is filed automatically by its type.</p>
      {(error || loadError) && <p className="error small" role="alert">{error || loadError}</p>}
      <ol className="cat-list">
        {categories.map((c, i) => (
          <li key={c.id} className="cat-item">
            <ColorPicker value={c.color} label={c.name} onPick={(color) => void run(() => saveCategoryChanges([recolorCategory(c, color, records)]))} />
            <input className="input grow" defaultValue={c.name} maxLength={30} aria-label={`Name of ${c.name}`} disabled={busy}
              onBlur={(e) => { const v = e.target.value; if (v.trim() !== c.name) void run(() => saveCategoryChanges([renameCategory(c, v, categories, records)])).then(() => { e.target.value = c.name }) }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
            <span className="muted small num cat-count">{inUse(c) ? `${inUse(c)} ${inUse(c) === 1 ? 'account' : 'accounts'}` : ''}</span>
            <button type="button" className="btn btn-secondary btn-sm cat-move" aria-label={`Move ${c.name} up`} disabled={busy || i === 0} onClick={() => void run(() => saveCategoryChanges(moveCategory(c, -1, categories, records)))}>↑</button>
            <button type="button" className="btn btn-secondary btn-sm cat-move" aria-label={`Move ${c.name} down`} disabled={busy || i === categories.length - 1} onClick={() => void run(() => saveCategoryChanges(moveCategory(c, 1, categories, records)))}>↓</button>
            <button type="button" className="link-btn small" disabled={busy} onClick={() => { setRemoving(c); setReassign('') }}>Remove</button>
            {removing?.id === c.id && (
              <div className="cat-remove" role="group" aria-label={`Remove ${c.name}`}>
                <p className="small">{inUse(c) ? `Move its ${inUse(c)} ${inUse(c) === 1 ? 'account' : 'accounts'} to:` : `Remove ${c.name}? No accounts are in it.`}</p>
                {inUse(c) > 0 && (
                  <select className="input" aria-label="Move its accounts to" value={reassign} onChange={(e) => setReassign(e.target.value)}>
                    <option value="">Automatic (by account type)</option>
                    {categories.filter((o) => o.id !== c.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                )}
                <div className="row-actions">
                  <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={() => void run(async () => {
                    const out = removeCategory(c, reassign || undefined, accounts ?? [], records)
                    // Accounts first: if that fails, the category is still there to hold them.
                    if (out.accounts.length) {
                      const data = await loadDaveyData()
                      await pushRecords('account', out.accounts.map((a) => {
                        const rec = data.records.get(`account:${a.id}`)
                        return { id: a.id, payload: { ...(rec?.payload ?? {}), accountCategoryID: a.accountCategoryID, rollupCategory: null } }
                      }))
                    }
                    await saveCategoryChanges([out.category])
                    await refreshData()
                    await reload()
                    setRemoving(null)
                  })}>Remove {c.name}</button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRemoving(null)}>Cancel</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ol>
      <form className="cat-add" onSubmit={(e) => {
        e.preventDefault()
        void run(async () => { await saveCategoryChanges([addCategory(newName, newColor, categories)]); setNewName('') })
      }}>
        <ColorPicker value={newColor} label="the new category" onPick={setNewColor} />
        <input className="input grow" placeholder="New category" aria-label="New category name" maxLength={30} value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="btn btn-primary btn-sm" disabled={busy || !newName.trim()}>Add category</button>
      </form>
    </section>
  )
}
