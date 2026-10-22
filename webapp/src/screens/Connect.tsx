import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckIcon } from '../components/Icons'
import { Spinner } from '../components/Spinner'
import { claimOAuthResume } from '../lib/plaid'
import { NameAccounts } from './NameAccounts'
import { usePlaidFlow, type FlowState } from './usePlaidFlow'

function FlowView({ state, onStart, onDone }: { state: FlowState; onStart: () => void; onDone: () => void }) {
  if (state.step === 'naming') return <NameAccounts accounts={state.accounts} institution={state.institution} onDone={onDone} />
  if (state.step === 'reconnected')
    return (
      <section className="card connect-hero" role="status">
        <h2>{state.institution ?? 'Your bank'} is reconnected</h2>
        <p className="muted">New transactions will sync in the next few minutes.</p>
        <div><button className="btn btn-primary" onClick={onDone}>Done</button></div>
      </section>
    )
  if (state.step === 'saving')
    return (
      <section className="card connect-hero" aria-live="polite">
        <h2>Connecting {state.institution ?? 'your bank'}…</h2>
        <p className="muted">Saving your accounts and pulling in recent transactions.</p>
        <Spinner label="Connecting" />
      </section>
    )
  return (
    <section className="card connect-hero">
      <h2>Connect your bank securely</h2>
      <ul className="connect-points">
        <li><CheckIcon />Davey uses Plaid. Your bank password goes to your bank through Plaid, never to Davey.</li>
        <li><CheckIcon />Read-only: Davey can see balances and transactions, and can't move money.</li>
        <li><CheckIcon />Connections are shared with the Davey app on your iPhone and Mac.</li>
      </ul>
      {state.step === 'error' && <p className="error" role="alert">{state.message}</p>}
      <div>
        <button className="btn btn-primary" onClick={onStart} disabled={state.step === 'starting' || state.step === 'linking'}>
          {state.step === 'starting' ? 'Starting…' : state.step === 'linking' ? 'Plaid is open…' : state.step === 'error' ? 'Try again' : 'Connect a Bank'}
        </button>
      </div>
    </section>
  )
}

export function Connect() {
  const navigate = useNavigate()
  const flow = usePlaidFlow()
  const location = useLocation()
  const reconnectId = new URLSearchParams(location.search).get('reconnect') ?? undefined
  const autoStarted = useRef(false)
  useEffect(() => {
    if (reconnectId && !autoStarted.current) {
      autoStarted.current = true
      void flow.start(reconnectId)
    }
  }, [reconnectId, flow])
  return (
    <div className="page">
      <div className="page-head"><div><h1>Connect a Bank</h1><p>Add checking, savings, credit cards, loans and investments.</p></div></div>
      <FlowView state={flow.state} onStart={() => flow.start(reconnectId)} onDone={() => navigate(reconnectId ? '/accounts' : '/', { replace: true })} />
    </div>
  )
}

/** Plaid redirect_uri target (https://daveypersonalfinance.com/app/oauth). Resumes Link exactly once. */
export function OAuthReturn() {
  const navigate = useNavigate()
  const flow = usePlaidFlow()
  const ran = useRef(false)

  // Link closed without connecting: back to the Connect screen.
  useEffect(() => {
    if (ran.current && flow.state.step === 'idle') navigate('/connect', { replace: true })
  }, [flow.state.step, navigate])

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const href = window.location.href
    if (!claimOAuthResume(href)) {
      navigate('/connect', { replace: true })
      return
    }
    // Drop oauth_state_id from the address bar so a reload can't replay it.
    window.history.replaceState(window.history.state, '', window.location.pathname)
    void flow.resume(href)
  }, [flow, navigate])

  return (
    <div className="page">
      <div className="page-head"><div><h1>Connect a Bank</h1><p>Finishing up with your bank…</p></div></div>
      {flow.state.step === 'starting' || flow.state.step === 'idle' || flow.state.step === 'linking' ? (
        <section className="card connect-hero"><Spinner label="Returning from your bank" /></section>
      ) : (
        <FlowView state={flow.state} onStart={() => navigate('/connect', { replace: true })} onDone={() => navigate('/', { replace: true })} />
      )}
    </div>
  )
}
