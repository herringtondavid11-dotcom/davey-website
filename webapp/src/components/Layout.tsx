import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { BankIcon, OverviewIcon, SettingsIcon, SignOutIcon, TransactionsIcon } from './Icons'
import { IdleWarning } from './IdleWarning'

const NAV = [
  { to: '/', label: 'Overview', icon: OverviewIcon, end: true },
  { to: '/transactions', label: 'Transactions', icon: TransactionsIcon },
  { to: '/connect', label: 'Connect a Bank', short: 'Banks', icon: BankIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function Layout() {
  const { email, signOut } = useAuth()
  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Davey">
        <a className="brand" href="/">
          <img src={`${import.meta.env.BASE_URL}icon-96.png`} alt="" width="32" height="32" />
          Davey
        </a>
        <nav aria-label="Main" style={{ display: 'grid', gap: 4 }}>
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
              <Icon />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="spacer" />
        {email && <div className="who" title={email}>{email}</div>}
        <button type="button" className="nav-link signout" onClick={() => signOut()}>
          <SignOutIcon />
          Sign out
        </button>
      </aside>
      <main className="main" id="main">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="Main">
        {NAV.map(({ to, label, short, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={({ isActive }) => 'tab' + (isActive ? ' active' : '')}>
            <Icon />
            {short ?? label}
          </NavLink>
        ))}
      </nav>
      <IdleWarning />
    </div>
  )
}
