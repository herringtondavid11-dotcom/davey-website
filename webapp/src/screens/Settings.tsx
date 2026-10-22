import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { createBackupKey, listFactors, type FactorSummary } from '../auth/mfa'
import { ConnectionRow } from '../components/ConnectionStatus'
import { InstallApp } from '../components/InstallApp'
import { ACTION_LABEL, describeAgent, fetchLoginActivity, type LoginEvent } from '../lib/activity'
import { shortDateTime } from '../lib/format'
import { supabase } from '../lib/supabase'
import { normalizeItem } from '../lib/tables'
import { applyTheme, readTheme, type ThemePref } from '../lib/theme'
import { useTable } from '../lib/useTable'
import { RecoveryKeyPanel } from './RecoveryKey'

function Profile() {
  const { session, refresh } = useAuth()
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>
  const initial = String(meta.full_name ?? meta.name ?? meta.first_name ?? '')
  const [name, setName] = useState(initial)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  async function save(e: FormEvent) {
    e.preventDefault()
    setState('saving')
    const { error } = await supabase.auth.updateUser({ data: { full_name: name.trim() } })
    setState(error ? 'error' : 'saved')
    if (!error) await refresh()
  }
  return (
    <section className="card card-pad" aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      <form className="form" onSubmit={save} style={{ marginTop: 14 }}>
        <div className="form-grid">
          <label className="field"><span>Name</span><input className="input" value={name} autoComplete="name" onChange={(e) => { setName(e.target.value); setState('idle') }} /></label>
          <label className="field"><span>Email</span><input className="input" value={session?.user.email ?? ''} readOnly aria-describedby="email-help" /></label>
        </div>
        <p id="email-help" className="muted small">To change your sign-in email, use the Davey app (Settings › Account).</p>
        <div className="row-actions">
          <button className="btn btn-secondary" disabled={state === 'saving' || name.trim() === initial}>{state === 'saving' ? 'Saving…' : 'Save name'}</button>
          {state === 'saved' && <span className="success" role="status">Saved</span>}
          {state === 'error' && <span className="error" role="alert">Couldn't save.</span>}
        </div>
      </form>
    </section>
  )
}

function Password() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  async function save(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setMsg({ ok: false, text: "The passwords don't match." })
    const { error } = await supabase.auth.updateUser({ password })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Password changed. Use it on all your devices.' })
    if (!error) { setPassword(''); setConfirm('') }
  }
  return (
    <form className="form card-pad-x pw-form" onSubmit={save}>
      <div className="form-grid">
        <label className="field"><span>New password</span><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <label className="field"><span>Confirm</span><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
      </div>
      {msg && <p className={msg.ok ? 'success' : 'error'} role={msg.ok ? 'status' : 'alert'}>{msg.text}</p>}
      <div><button className="btn btn-secondary" disabled={password.length < 8}>Change password</button></div>
    </form>
  )
}

function LoginActivity() {
  const { session } = useAuth()
  const [events, setEvents] = useState<LoginEvent[] | null | undefined>(undefined)
  useEffect(() => {
    fetchLoginActivity().then(setEvents)
  }, [])
  const last = session?.user.last_sign_in_at
  return (
    <section className="card" aria-labelledby="activity-title">
      <div className="card-head"><h2 id="activity-title">Login activity</h2></div>
      <div className="settings-row">
        <div><strong>This browser</strong><p className="muted small">{describeAgent(navigator.userAgent)} · active now</p></div>
        <span className="status status-ok">Current</span>
      </div>
      {last && (
        <div className="settings-row"><div><strong>Last sign-in</strong><p className="muted small">{shortDateTime(last)}</p></div></div>
      )}
      {events === undefined && <p className="muted card-notice">Loading…</p>}
      {events && events.length > 0 && (
        <ul className="list activity-list">
          {events.map((e, i) => (
            <li key={i} className="settings-row">
              <div><strong>{ACTION_LABEL[e.action] ?? e.action}</strong><p className="muted small">{[shortDateTime(e.at), e.device, e.ip].filter(Boolean).join(' · ')}</p></div>
            </li>
          ))}
        </ul>
      )}
      {events === null && <p className="muted card-notice small">Full history across devices appears here once the login-activity service is enabled.</p>}
    </section>
  )
}

export function Settings() {
  const { signOut } = useAuth()
  const [theme, setTheme] = useState<ThemePref>(readTheme)
  const [factors, setFactors] = useState<FactorSummary | null>(null)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [keyError, setKeyError] = useState('')
  const [busy, setBusy] = useState(false)
  const items = useTable('items')
  const issues = useMemo(() => (items.result?.rows ?? []).map(normalizeItem).filter((c) => c.health !== 'ok'), [items.result])

  useEffect(() => {
    listFactors().then(setFactors, () => undefined)
  }, [newKey])

  async function signOutEverywhere() {
    if (!window.confirm('Sign out on every device, including the Davey app on your iPhone and Mac?')) return
    await supabase.auth.signOut({ scope: 'global' }).catch(() => undefined)
    await signOut()
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><p>Profile, security and appearance.</p></div></div>
      <Profile />

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
        <div className="settings-row"><div><strong>Password</strong><p className="muted">Changes your password for the Davey app too.</p></div></div>
        <Password />
        <div className="settings-row">
          <div>
            <strong>Automatic sign-out</strong>
            <p className="muted">After 30 minutes without activity.</p>
          </div>
          <div className="row-actions">
            <button className="btn btn-secondary" onClick={() => signOut()}>Sign out</button>
            <button className="btn btn-danger" onClick={signOutEverywhere}>Sign out everywhere</button>
          </div>
        </div>
      </section>

      <LoginActivity />

      <section className="card" aria-labelledby="conn-title">
        <div className="card-head"><h2 id="conn-title">Connections</h2><Link to="/accounts">Accounts</Link></div>
        {issues.length ? issues.map((c) => <ConnectionRow key={c.id} c={c} />) : <p className="muted card-notice">All bank connections are working.</p>}
        <div className="settings-row"><div><strong>Account names and Business/Personal</strong><p className="muted small">Set them per account.</p></div><Link className="btn btn-secondary btn-sm" to="/accounts">Open Accounts</Link></div>
      </section>

      <section className="card" aria-labelledby="look-title">
        <div className="card-head"><h2 id="look-title">Appearance</h2></div>
        <div className="settings-row">
          <div><strong>Install as an app</strong><p className="muted small">Opens in its own window, from your Dock or home screen.</p></div>
          <InstallApp />
        </div>
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
    </div>
  )
}
