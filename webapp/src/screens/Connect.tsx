import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { CheckIcon } from '../components/Icons'
import { Spinner } from '../components/Spinner'
import { claimOAuthResume, logClientLinkEvent } from '../lib/plaid'
import { AddAccount } from './Accounts'
import { NameAccounts } from './NameAccounts'
import { usePlaidFlow, type FlowState } from './usePlaidFlow'

function actionLabel(reconnectId?: string, consentInvestments?: boolean) {
  if (consentInvestments) return 'Finish setup'
  if (reconnectId) return 'Reconnect'
  return 'Connect an account'
}

function buttonLabel(state: FlowState, action: string) {
  if (state.step === 'starting') return 'Starting…'
  if (state.step === 'linking') return 'Plaid is open…'
  if (state.step === 'retry' || state.step === 'error' || state.step === 'unfinished') return 'Try again'
  return action
}

function FlowView({
  state,
  ready,
  action,
  onOpen,
  onDone,
}: {
  state: FlowState
  ready: boolean
  action: string
  onOpen: () => void
  onDone: () => void
}) {
  if (state.step === 'naming') return <NameAccounts accounts={state.accounts} institution={state.institution} onDone={onDone} />
  if (state.step === 'updating')
    return (
      <section className="card connect-hero" aria-live="polite">
        <h2>Updating {state.institution ?? 'your account'}…</h2>
        <p className="muted">Getting the latest balances and transactions.</p>
        <Spinner label="Updating" />
      </section>
    )
  if (state.step === 'reconnected')
    return (
      <section className="card connect-hero" role="status">
        <h2>{state.institution ?? 'Your account'} is reconnected</h2>
        {state.warning
          ? <p className="notice">{state.warning}</p>
          : <p className="muted">Updated just now{state.merged ? '. This was already connected, so the existing accounts were updated instead of added again' : ''}. Your iPhone and Mac get the same update.</p>}
        <div><button className="btn btn-primary" onClick={onDone}>Done</button></div>
      </section>
    )
  if (state.step === 'saving')
    return (
      <section className="card connect-hero" aria-live="polite">
        <h2>Connecting {state.institution ?? 'your account'}…</h2>
        <p className="muted">Saving your accounts and pulling in recent transactions.</p>
        <Spinner label="Connecting" />
      </section>
    )
  const busy = state.step === 'starting' || state.step === 'linking'
  const canOpen = ready && (state.step === 'idle' || state.step === 'retry' || state.step === 'unfinished')
  return (
    <section className="card connect-hero">
      <h2>{action === 'Reconnect' ? 'Reconnect this account' : action === 'Finish setup' ? 'Finish setting up investments' : 'Connect an account securely'}</h2>
      <ul className="connect-points">
        <li><CheckIcon />Davey uses Plaid. Your password goes to your bank, card, or brokerage through Plaid, never to Davey.</li>
        <li><CheckIcon />Read-only: Davey can see balances and transactions, and can't move money.</li>
        <li><CheckIcon />One connection can include checking, savings, credit cards, loans, mortgages, and investments. Each shows up in its own section.</li>
        <li><CheckIcon />Connections are shared with the Davey app on your iPhone and Mac.</li>
      </ul>
      {state.step === 'retry' && <p className="notice" role="status">That connection needs another try.</p>}
      {state.step === 'error' && <p className="error" role="alert">{state.message}</p>}
      {state.step === 'unfinished' && <p className="notice" role="status">{state.message}</p>}
      <div>
        <button className="btn btn-primary" onClick={onOpen} disabled={busy || (!canOpen && state.step !== 'error')}>
          {buttonLabel(state, action)}
        </button>
      </div>
    </section>
  )
}

/** Old separate entry points (?mode=loans, investments, brokerage, bank) all land on the one connect screen. */
const LEGACY_MODES = new Set(['bank', 'loans', 'loan', 'mortgage', 'investments', 'investment', 'brokerage'])

export function Connect() {
  const navigate = useNavigate()
  const flow = usePlaidFlow()
  const location = useLocation()
  const [manual, setManual] = useState(false)
  const query = new URLSearchParams(location.search)
  const reconnectId = query.get('reconnect') ?? undefined
  // ?reconnect=<item>&consent=investments: "Finish setting up" a brokerage (adds Investments, same connection).
  const consentInvestments = query.get('consent') === 'investments'
  const legacyMode = query.get('mode')
  useEffect(() => {
    if (!legacyMode || !LEGACY_MODES.has(legacyMode)) return
    query.delete('mode')
    const search = query.toString()
    navigate({ pathname: '/connect', search: search ? `?${search}` : '' }, { replace: true })
  }, [legacyMode, location.search, navigate]) // query is derived from location.search
  useEffect(() => {
    void flow.prepare({ updateItemId: reconnectId, consentInvestments })
  }, [reconnectId, consentInvestments, flow.prepare])
  const action = actionLabel(reconnectId, consentInvestments)
  const showManual = !reconnectId && (flow.state.step === 'idle' || flow.state.step === 'error' || flow.state.step === 'starting' || flow.state.step === 'retry' || flow.state.step === 'unfinished')
  return (
    <div className="page">
      <div className="page-head"><div><h1>Connect an account</h1><p>Checking, savings, credit cards, loans, mortgages, and investments.</p></div></div>
      <FlowView
        state={flow.state}
        ready={flow.ready}
        action={action}
        onOpen={() => {
          // Open only when the token is already in hand. Otherwise this click just starts the fetch; the next click opens Link.
          if (!flow.openFromClick()) void flow.prepare({ updateItemId: reconnectId, consentInvestments })
        }}
        onDone={() => navigate(consentInvestments ? '/investments' : reconnectId ? '/accounts' : '/', { replace: true })}
      />
      {showManual && (manual
        ? <AddAccount onClose={() => setManual(false)} />
        : <p><button type="button" className="link-btn" onClick={() => setManual(true)}>Add a manual account instead</button></p>)}
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
    void logClientLinkEvent('DAVEY_OAUTH_RETURN', { view_name: 'same_tab' })
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
      <div className="page-head"><div><h1>Connect an account</h1><p>Finishing up with your institution…</p></div></div>
      {flow.state.step === 'starting' || flow.state.step === 'idle' || flow.state.step === 'linking' ? (
        <section className="card connect-hero"><Spinner label="Returning from your bank" /></section>
      ) : (
        <FlowView state={flow.state} ready={flow.ready} action="Connect an account" onOpen={() => navigate('/connect', { replace: true })} onDone={() => navigate('/', { replace: true })} />
      )}
    </div>
  )
}
