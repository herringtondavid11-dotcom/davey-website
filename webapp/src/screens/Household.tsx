import { useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Spinner } from '../components/Spinner'
import { shortDate } from '../lib/format'
import { ROLE_HELP, ROLE_LABEL, createInvite, inviteUrl } from '../lib/household'
import { supabase } from '../lib/supabase'
import { normalizeMember, resolvedTable, type Member, type Role } from '../lib/tables'
import { useTable } from '../lib/useTable'

function MemberRow({ m, me, canManage, onChanged }: { m: Member; me: boolean; canManage: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const table = resolvedTable('members')
  async function setRole(role: Role) {
    if (!table) return
    setBusy(true)
    setError('')
    const { data, error } = await supabase.from(table).update({ role }).eq('id', m.id).select('*')
    setBusy(false)
    if (error || !data?.length) return setError("Couldn't change the role.")
    onChanged()
  }
  async function remove() {
    if (!table || !window.confirm(`Remove ${m.name} from your household? They'll lose access to shared accounts.`)) return
    setBusy(true)
    const { error } = await supabase.from(table).delete().eq('id', m.id)
    setBusy(false)
    if (error) return setError("Couldn't remove this member.")
    onChanged()
  }
  return (
    <div className="settings-row member-row">
      <div className="member-who">
        <span className="avatar" aria-hidden>{m.name.charAt(0).toUpperCase()}</span>
        <div style={{ minWidth: 0 }}>
          <strong>{m.name}{me && <span className="chip chip-pending">You</span>}</strong>
          <p className="muted small">{[m.email && m.email !== m.name ? m.email : null, m.joinedAt ? `joined ${shortDate(m.joinedAt.slice(0, 10))}` : null].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div className="row-actions">
        {canManage && !me && m.role !== 'owner' ? (
          <>
            <label className="visually-hidden" htmlFor={`role-${m.id}`}>Role for {m.name}</label>
            <select id={`role-${m.id}`} className="input input-sm" value={m.role} disabled={busy} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="member">{ROLE_LABEL.member}</option>
              <option value="viewer">{ROLE_LABEL.viewer}</option>
            </select>
            <button className="btn btn-danger btn-sm" disabled={busy} onClick={remove}>Remove</button>
          </>
        ) : (
          <span className="status status-ok">{ROLE_LABEL[m.role]}</span>
        )}
      </div>
      {error && <p className="error small" role="alert">{error}</p>}
    </div>
  )
}

export function Household() {
  const { session } = useAuth()
  const members = useTable('members')
  const invites = useTable('invites')
  const list = useMemo(() => (members.result?.rows ?? []).map(normalizeMember), [members.result])
  const myId = session?.user.id
  const me = list.find((m) => m.userId === myId || m.email === session?.user.email)
  const canManage = !list.length || me?.role === 'owner'
  const [firstName, setFirstName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [link, setLink] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!members.result) return <Spinner label="Loading household" />
  const pending = (invites.result?.rows ?? []).filter((r) => !r.accepted_at && (r.status ?? 'pending') === 'pending')

  async function invite(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setCopied(false)
    try {
      setLink(await createInvite({ firstName: firstName.trim(), email: email.trim(), role }))
      await invites.reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <div className="page-head"><div><h1>Household</h1><p>Share accounts, budgets and transactions with family. Everyone keeps their own sign-in.</p></div></div>

      <section className="card" aria-labelledby="members-title">
        <div className="card-head"><h2 id="members-title">Members</h2></div>
        {!members.result.available ? (
          <p className="muted card-notice">Household Sharing is set up in the Davey app (Settings › Household). Members will appear here.</p>
        ) : list.length === 0 ? (
          <p className="muted card-notice">Just you for now. Invite someone below.</p>
        ) : (
          list.map((m) => <MemberRow key={m.id} m={m} me={m === me} canManage={canManage} onChanged={() => members.reload()} />)
        )}
      </section>

      {canManage && (
        <section className="card card-pad" aria-labelledby="invite-title">
          <h2 id="invite-title">Invite someone</h2>
          <p className="muted" style={{ margin: '6px 0 16px' }}>You'll get a link to send by text or email. It works once and expires after 7 days.</p>
          <form className="form" onSubmit={invite}>
            <div className="form-grid">
              <label className="field"><span>First name</span><input className="input" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="off" /></label>
              <label className="field"><span>Email (optional)</span><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
            </div>
            <fieldset className="roles">
              <legend>Role</legend>
              {(['member', 'viewer'] as Role[]).map((r) => (
                <label key={r} className="check">
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} />
                  <span><b>{ROLE_LABEL[r]}</b> <span className="muted">— {ROLE_HELP[r]}</span></span>
                </label>
              ))}
            </fieldset>
            {error && <p className="notice" role="alert">{error}</p>}
            <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create invite link'}</button></div>
          </form>
          {link && (
            <div className="invite-link" role="status">
              <input className="input" readOnly value={link} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
              <button className="btn btn-secondary" onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => undefined)}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <section className="card" aria-labelledby="pending-title">
          <div className="card-head"><h2 id="pending-title">Pending invites</h2></div>
          {pending.map((r, i) => {
            const token = typeof r.token === 'string' ? r.token : undefined
            const name = (r.invitee_first_name ?? r.first_name ?? r.email ?? 'Invite') as string
            return (
              <div className="settings-row" key={String(r.id ?? i)}>
                <div><strong>{name}</strong><p className="muted small">{r.expires_at ? `Expires ${shortDate(String(r.expires_at).slice(0, 10))}` : 'Pending'}</p></div>
                {token && <button className="btn btn-secondary btn-sm" onClick={() => navigator.clipboard?.writeText(inviteUrl(token))}>Copy link</button>}
              </div>
            )
          })}
        </section>
      )}

      <section className="card card-pad" aria-labelledby="roles-title">
        <h2 id="roles-title">Roles</h2>
        <dl className="role-list">
          {(['owner', 'member', 'viewer'] as Role[]).map((r) => (<div key={r}><dt>{ROLE_LABEL[r]}</dt><dd className="muted">{ROLE_HELP[r]}</dd></div>))}
        </dl>
      </section>
    </div>
  )
}
