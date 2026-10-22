import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { createBackupKey, listFactors, type FactorSummary } from '../auth/mfa'
import { useData } from '../lib/DataProvider'
import { updateAccountNickname } from '../lib/data'
import { maskLabel, typeLabel } from '../lib/format'
import { applyTheme, readTheme, type ThemePref } from '../lib/theme'
import type { Account } from '../lib/schema'
import { RecoveryKeyPanel } from './RecoveryKey'

function AccountName({ a }: { a: Account }) {
  const { replaceAccount } = useData()
  const [value, setValue] = useState(a.nickname ?? '')
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const dirty = value.trim() !== (a.nickname ?? '')
  return (
    <form
      className="name-row field"
      onSubmit={async (e) => {
        e.preventDefault()
        setState('saving')
        try {
          replaceAccount(await updateAccountNickname(a, value))
          setState('saved')
        } catch {
          setState('error')
        }
      }}
    >
      <label htmlFor={`nick-${a.id}`}>
        <strong>{a.name}</strong> <span className="muted">· {[a.institution, maskLabel(a.mask), typeLabel(a.type)].filter(Boolean).join(' · ')}</span>
      </label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id={`nick-${a.id}`} className="input" placeholder={a.name} maxLength={40} value={value} onChange={(e) => { setValue(e.target.value); setState('idle') }} />
        <button className="btn btn-secondary" disabled={!dirty || state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Save'}</button>
      </div>
      {state === 'saved' && <span className="success" role="status">Saved</span>}
      {state === 'error' && <span className="error" role="alert">Couldn't save. Try again.</span>}
    </form>
  )
}

export function Settings() {
  const { email, signOut } = useAuth()
  const { accounts } = useData()
  const [theme, setTheme] = useState<ThemePref>(readTheme)
  const [factors, setFactors] = useState<FactorSummary | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [keyError, setKeyError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    listFactors().then(setFactors, () => undefined)
  }, [newKey])

  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><p>{email}</p></div></div>

      <section className="card" aria-labelledby="sec-title">
        <div className="card-head"><h2 id="sec-title">Security</h2></div>
        <div className="settings-row">
          <div>
            <strong>2-step verification</strong>
            <p className="muted">{factors?.primary ? 'On · authenticator app' : 'Checking…'}</p>
          </div>
        </div>
        <div className="settings-row">
          <div>
            <strong>Recovery key</strong>
            <p className="muted">{factors ? (factors.backup ? 'Saved. Make a new one if you lost it; the old one stops working.' : 'Not set up. Make one so you can sign in without your phone.') : 'Checking…'}</p>
          </div>
          {!newKey && (
            <button
              className="btn btn-secondary"
              disabled={!factors || busy}
              onClick={async () => {
                setBusy(true)
                setKeyError('')
                try {
                  setNewKey(await createBackupKey(factors?.backup))
                } catch (e) {
                  setKeyError((e as Error).message)
                } finally {
                  setBusy(false)
                }
              }}
            >
              {factors?.backup ? 'New recovery key' : 'Create recovery key'}
            </button>
          )}
        </div>
        {keyError && <p className="error card-pad" role="alert">{keyError}</p>}
        {newKey && <div className="card-pad"><RecoveryKeyPanel secret={newKey} onDone={() => setNewKey(null)} doneLabel="Done" /></div>}
        <div className="settings-row">
          <div>
            <strong>Automatic sign-out</strong>
            <p className="muted">After 30 minutes without activity.</p>
          </div>
          <button className="btn btn-danger" onClick={() => signOut()}>Sign out</button>
        </div>
      </section>

      <section className="card" aria-labelledby="look-title">
        <div className="card-head"><h2 id="look-title">Appearance</h2></div>
        <div className="settings-row">
          <span id="theme-label">Theme</span>
          <div className="segmented" role="group" aria-labelledby="theme-label">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => { applyTheme(t); setTheme(t) }}>
                {t === 'system' ? 'Automatic' : t === 'light' ? 'Light' : 'Dark'}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card" aria-labelledby="accounts-title" id="accounts">
        <div className="card-head" style={{ display: 'grid', gap: 4 }}>
          <h2 id="accounts-title">Account names</h2>
          <p className="muted">Names you set here also show in the Davey app.</p>
        </div>
        {(accounts ?? []).filter((a) => !a.hidden).map((a) => <AccountName key={a.id} a={a} />)}
        {accounts?.length === 0 && <div className="empty"><p>No accounts yet.</p></div>}
      </section>
    </div>
  )
}
