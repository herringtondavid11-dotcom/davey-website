import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { CategoryManager } from '../components/CategoryManager'
import { ConnectionRow } from '../components/ConnectionStatus'
import { InstallApp } from '../components/InstallApp'
import { ACTION_LABEL, describeAgent, fetchLoginActivity, type LoginEvent } from '../lib/activity'
import { shortDateTime } from '../lib/format'
import { householdStatus, updateProfile } from '../lib/household'
import { supabase } from '../lib/supabase'
import { normalizeItem } from '../lib/tables'
import { applyTheme, readTheme, type ThemePref } from '../lib/theme'
import { useTable } from '../lib/useTable'

export function Profile() {
  const { session } = useAuth()
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [phone, setPhone] = useState('')
  const [initial, setInitial] = useState('')
  const [state, setState] = useState<'loading' | 'idle' | 'saving' | 'saved' | 'error' | 'unavailable'>('loading')
  const [message, setMessage] = useState('')
  useEffect(() => {
    householdStatus().then(
      (h) => {
        setFirst(h.profile.first_name)
        setLast(h.profile.last_name)
        setPhone(h.profile.phone)
        setInitial(JSON.stringify([h.profile.first_name, h.profile.last_name, h.profile.phone]))
        setState('idle')
      },
      () => setState('unavailable'),
    )
  }, [])
  async function save(e: FormEvent) {
    e.preventDefault()
    setState('saving')
    try {
      await updateProfile({ firstName: first.trim(), lastName: last.trim(), phone: phone.trim() })
      setInitial(JSON.stringify([first.trim(), last.trim(), phone.trim()]))
      setState('saved')
    } catch (err) {
      setMessage((err as Error).message)
      setState('error')
    }
  }
  const dirty = JSON.stringify([first.trim(), last.trim(), phone.trim()]) !== initial
  return (
    <section className="card card-pad" aria-labelledby="profile-title">
      <h2 id="profile-title">Profile</h2>
      {state === 'unavailable' && <p className="muted small" style={{ marginTop: 8 }}>Your name and phone are edited in the Davey app for now.</p>}
      <form className="form" onSubmit={save} style={{ marginTop: 14 }}>
        <div className="form-grid">
          <label className="field"><span>First name</span><input className="input" value={first} autoComplete="given-name" disabled={state === 'unavailable' || state === 'loading'} onChange={(e) => { setFirst(e.target.value); setState('idle') }} /></label>
          <label className="field"><span>Last name</span><input className="input" value={last} autoComplete="family-name" disabled={state === 'unavailable' || state === 'loading'} onChange={(e) => { setLast(e.target.value); setState('idle') }} /></label>
          <label className="field"><span>Phone</span><input className="input" type="tel" value={phone} autoComplete="tel" disabled={state === 'unavailable' || state === 'loading'} onChange={(e) => { setPhone(e.target.value); setState('idle') }} /></label>
          <label className="field"><span>Email</span><input className="input" value={session?.user.email ?? ''} readOnly aria-describedby="email-help" /></label>
        </div>
        <p id="email-help" className="muted small">Your household partner sees your first name. To change your sign-in email, use the Davey app.</p>
        <div className="row-actions">
          <button className="btn btn-secondary" disabled={state === 'saving' || !dirty || !first.trim()}>{state === 'saving' ? 'Saving…' : 'Save profile'}</button>
          {state === 'saved' && <span className="success" role="status">Saved</span>}
          {state === 'error' && <span className="error" role="alert">{message || "Couldn't save."}</span>}
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
  const items = useTable('items')
  const issues = useMemo(() => (items.result?.rows ?? []).map(normalizeItem).filter((c) => c.health !== 'ok'), [items.result])

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
            <strong>Sign-in</strong>
            <p className="muted">The company access code and your password. Davey does not email a sign-in code.</p>
          </div>
        </div>
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

      <CategoryManager />

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

/** Settings › Profile: name, email and phone (the app's Profile screen). Everything else stays in Settings. */
export function ProfilePage() {
  return (
    <div className="page">
      <div className="page-head"><div><h1>Profile</h1><p>Your name, email and phone. Password and 2-step verification are in <Link to="/settings">Settings</Link>.</p></div></div>
      <Profile />
    </div>
  )
}
