import { Suspense } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useData } from '../lib/DataProvider'
import { hasBusiness } from '../lib/finance'
import { MoreIcon, PlusIcon, SignOutIcon, SparkleIcon } from './Icons'
import { Spinner } from './Spinner'
import { AskAI } from './AskAI'
import { IdleWarning } from './IdleWarning'
import { NAV_GROUPS, TAB_ITEMS, openAsk } from './nav'

export function Layout() {
  const { email, signOut } = useAuth()
  const { accounts, transactions } = useData()
  const location = useLocation()
  const business = hasBusiness(accounts ?? [], transactions ?? [])
  const inMore = !TAB_ITEMS.some((t) => (t.end ? location.pathname === t.to : location.pathname.startsWith(t.to)))

  return (
    <div className="shell">
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
        <Suspense fallback={<Spinner />}>
          <Outlet />
        </Suspense>
      </main>
      <nav className="tabbar" aria-label="Main">
        {TAB_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            <Icon />
            {label}
          </NavLink>
        ))}
        <button type="button" className="tab" onClick={openAsk}>
          <SparkleIcon />
          Ask
        </button>
      </nav>
      <AskAI />
      <IdleWarning />
    </div>
  )
}
