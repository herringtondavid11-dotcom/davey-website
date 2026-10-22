import { useEffect, useState, type FormEvent } from 'react'
import { Spinner } from '../components/Spinner'
import { shortDate } from '../lib/format'
import { RELATIONSHIPS, ROLE_HELP, ROLE_LABEL, createInvite, householdStatus, inviteAction, leaveHousehold, removeMember, type HouseholdStatus } from '../lib/household'

export function Household() {
  const [h, setH] = useState<HouseholdStatus | null>(null)
  const [loadError, setLoadError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [relationship, setRelationship] = useState('spouse')
  const [sendEmail, setSendEmail] = useState(true)
  const [link, setLink] = useState('')
  const [emailResult, setEmailResult] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = (force = false) =>
    householdStatus(force).then(
      (s) => {
        setH(s)
        setLoadError('')
      },
      (e: Error) => setLoadError(e.message || "Couldn't load your household."),
    )
  useEffect(() => {
    void load()
  }, [])

  if (loadError) return <div className="page"><div className="page-head"><div><h1>Household</h1></div></div><p className="notice" role="status">{loadError}</p></div>
  if (!h) return <Spinner label="Loading household" />
  if (!h.household_id) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>Household</h1><p>Share banks, budgets and transactions with one partner.</p></div></div>
        <p className="notice" role="status">You haven't started Household Sharing yet. Turn it on in the Davey app (Settings › Household); it then shows here, and your data appears on the web.</p>
      </div>
    )
  }
  const owner = h.role === 'owner'
  const partner = h.members.find((m) => !m.is_you)
  const pending = h.invites.filter((i) => i.status === 'pending')

  async function invite(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      const r = await createInvite({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), relationship, sendEmail: sendEmail && !!email.trim() })
      setLink(r.link)
      setEmailResult(r.email)
      await load(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function run(action: () => Promise<unknown>, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return
    setError('')
    try {
      await action()
      await load(true)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Household</h1><p>Share banks, budgets and transactions with one partner. You each keep your own sign-in.</p></div></div>

      <section className="card" aria-labelledby="members-title">
        <div className="card-head"><h2 id="members-title">Members</h2></div>
        {h.members.map((m) => (
          <div className="settings-row member-row" key={m.user_id}>
            <div className="member-who">
              <span className="avatar" aria-hidden>{(m.display_name ?? '?').charAt(0).toUpperCase()}</span>
              <div style={{ minWidth: 0 }}>
                <strong>{m.display_name || 'Member'}{m.is_you && <span className="chip chip-pending">You</span>}</strong>
                <p className="muted small">{m.joined_at ? `Joined ${shortDate(m.joined_at.slice(0, 10))}` : ''}</p>
              </div>
            </div>
            <div className="row-actions">
              <span className="status status-ok">{ROLE_LABEL[m.role]}</span>
              {owner && !m.is_you && (
                <button className="btn btn-danger btn-sm" onClick={() => run(removeMember, `Remove ${m.display_name ?? 'your partner'}? They lose access right away; shared data stays with you.`)}>Remove</button>
              )}
              {!owner && m.is_you && (
                <button className="btn btn-danger btn-sm" onClick={() => run(leaveHousehold, 'Leave this household? Shared banks and data stay with the owner.')}>Leave</button>
              )}
            </div>
          </div>
        ))}
        {h.member_access && h.member_access.state !== 'premium' && !owner && (
          <p className="muted card-notice small">Your access: {h.member_access.state.replace(/_/g, ' ')}{h.member_access.until ? ` until ${shortDate(h.member_access.until.slice(0, 10))}` : ''}.</p>
        )}
      </section>

      {error && <p className="notice" role="alert">{error}</p>}

      {owner && !partner && (
        <section className="card card-pad" aria-labelledby="invite-title">
          <h2 id="invite-title">Invite your partner</h2>
          {!h.can_invite ? (
            <p className="muted" style={{ marginTop: 8 }}>Household Sharing is part of Davey Premium. Upgrade in the Davey app, then invite from here or there.</p>
          ) : (
            <>
              <p className="muted" style={{ margin: '6px 0 16px' }}>You'll get a link to send. It works once and expires after 7 days.</p>
              <form className="form" onSubmit={invite}>
                <div className="form-grid">
                  <label className="field"><span>First name</span><input className="input" required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" /></label>
                  <label className="field"><span>Last name (optional)</span><input className="input" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="off" /></label>
                  <label className="field"><span>Email (optional)</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
                  <label className="field">
                    <span>Relationship</span>
                    <select className="input" value={relationship} onChange={(e) => setRelationship(e.target.value)}>{RELATIONSHIPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                  </label>
                </div>
                {h.email_enabled && email.trim() && (
                  <label className="check"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /><span>Email the invite to {email.trim()}</span></label>
                )}
                <div><button className="btn btn-primary" disabled={busy || !firstName.trim()}>{busy ? 'Creating…' : 'Create invite link'}</button></div>
              </form>
              {link && (
                <div role="status">
                  <div className="invite-link">
                    <input className="input" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
                    <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => undefined)}>{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                  {emailResult === 'sent' && <p className="success small" style={{ marginTop: 8 }}>Emailed too.</p>}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {owner && pending.length > 0 && (
        <section className="card" aria-labelledby="pending-title">
          <div className="card-head"><h2 id="pending-title">Pending invites</h2></div>
          {pending.map((i) => (
            <div className="settings-row" key={i.id}>
              <div><strong>{[i.first_name, i.last_name].filter(Boolean).join(' ') || 'Invite'}</strong><p className="muted small">{i.email ?? 'Link only'} · expires {shortDate(i.expires_at.slice(0, 10))}</p></div>
              <div className="row-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => run(async () => { const r = await inviteAction('link', i.id); if (r.link) { setLink(r.link); await navigator.clipboard?.writeText(r.link).catch(() => undefined) } })}>New link</button>
                <button className="btn btn-danger btn-sm" onClick={() => run(() => inviteAction('cancel', i.id), 'Cancel this invite?')}>Cancel</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card card-pad" aria-labelledby="roles-title">
        <h2 id="roles-title">Roles</h2>
        <dl className="role-list">
          {(['owner', 'member'] as const).map((r) => (<div key={r}><dt>{ROLE_LABEL[r]}</dt><dd className="muted">{ROLE_HELP[r]}</dd></div>))}
        </dl>
      </section>
    </div>
  )
}
