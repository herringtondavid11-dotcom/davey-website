import { useAuth } from '../auth/AuthProvider'

export function IdleWarning() {
  const { idle, stayActive, signOut } = useAuth()
  if (idle !== 'warning') return null
  return (
    <div className="overlay modal-center">
      <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="idle-title">
        <h2 id="idle-title">Still there?</h2>
        <p className="muted">For your security, Davey signs you out after 30 minutes without activity.</p>
        <div className="sheet-actions">
          <button className="btn btn-secondary" onClick={() => signOut()}>Sign out</button>
          <button className="btn btn-primary" onClick={stayActive} autoFocus>Stay signed in</button>
        </div>
      </div>
    </div>
  )
}
