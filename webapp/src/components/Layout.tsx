import { Suspense, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/DataProvider'
import { hasBusiness } from '../lib/finance'
import { MoreIcon, PlusIcon, SignOutIcon, SparkleIcon } from './Icons'
import { Spinner } from './Spinner'
import { AskAI } from './AskAI'
import { IdleWarning } from './IdleWarning'
import { NAV_GROUPS, TAB_ITEMS, openAsk } from './nav'

function Retry({ primary, onRetry }: { primary?: boolean; onRetry: () => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button type="button" className={'btn ' + (primary ? 'btn-primary' : 'btn-secondary btn-sm')} disabled={busy} onClick={() => {
      setBusy(true)
      void onRetry().finally(() => setBusy(false))
    }}>{busy ? 'Trying…' : 'Try again'}</button>
  )
}

/** Full page when the first load failed; a banner when a later refresh failed and the last data is still on screen. */
function DataNotice() {
  const { error, status, accounts, reload } = useData()
  if (!error) return null
  if (status === 'error' && !accounts) {
    return (
      <div className="page">
        <div className="page-head"><div><h1>Couldn't load your data</h1></div></div>
        <section className="card card-pad load-failure">
          <p className="error" role="alert">{error}</p>
          <Retry primary onRetry={reload} />
        </section>
      </div>
    )
  }
  return (
    <div className="banner card" role="alert">
      <span>{error}</span>
      <Retry onRetry={reload} />
    </div>
  )
}

export function Layout() {
  const { email, signOut } = useAuth()
  const { accounts, transactions, status } = useData()
  const location = useLocation()
  const business = hasBusiness(accounts ?? [], transactions ?? [])
  const inMore = !TAB_ITEMS.some((t) => (t.end ? location.pathname === t.to : location.pathname.startsWith(t.to)))
  const blocked = status === 'error' && !accounts

  return (
    <div className="shell">
      <a className="skip-link" href="#main">Skip to content</a>
      <aside className="sidebar" aria-label="Davey">
        <a className="brand" href="/">
          <img src={`${import.meta.env.BASE_URL}icon-96.png`} alt="" width="32" height="32" />
          Davey
        </a>
        <NavLink to="/connect" className="btn btn-primary connect-cta"><PlusIcon size={18} />Connect a Bank</NavLink>
        <nav aria-label="Main" className="side-nav">
          {NAV_GROUPS.map((g, i) => {
            const items = g.items.filter((it) => !it.businessOnly || business)
            if (!items.length) return null
            return (
              <div key={g.label ?? i} className="nav-group">
                {g.label && <div className="nav-group-label">{g.label}</div>}
                {items.map(({ to, label, icon: Icon, end }) => (
                  <NavLink key={to} to={to} end={end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
                    <Icon size={20} />
                    {label}
                  </NavLink>
                ))}
                {i === 0 && (
                  <button type="button" className="nav-link nav-button" onClick={openAsk}>
                    <SparkleIcon size={20} />
                    Ask
                  </button>
                )}
              </div>
            )
          })}
        </nav>
        <div className="spacer" />
        {email && <div className="who" title={email}>{email}</div>}
        <button type="button" className="nav-link signout" onClick={() => signOut()}>
          <SignOutIcon size={20} />
          Sign out
        </button>
      </aside>
      <header className="mobile-bar">
        <a className="brand" href={import.meta.env.BASE_URL}>
          <img src={`${import.meta.env.BASE_URL}icon-96.png`} alt="" width="28" height="28" />
          Davey
        </a>
        <NavLink to="/more" className={() => 'mobile-more' + (inMore ? ' active' : '')} aria-label="More">
          <MoreIcon />
        </NavLink>
      </header>
      <main className="main" id="main">
        {blocked ? <DataNotice /> : (
          <Suspense fallback={<Spinner />}>
            <DataNotice />
            <Outlet />
          </Suspense>
        )}
      </main>
      <nav className="tabbar" aria-label="Main">
        {TAB_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            <Icon />
            <span className="tab-label">{label}</span>
          </NavLink>
        ))}
        <button type="button" className="tab" onClick={openAsk}>
          <SparkleIcon />
          <span className="tab-label">Ask</span>
        </button>
      </nav>
      <AskAI />
      <IdleWarning />
    </div>
  )
}
