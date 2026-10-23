import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { ChevronIcon, PlusIcon, SignOutIcon } from '../components/Icons'
import { NAV_GROUPS, TAB_ITEMS } from '../components/nav'
import { useData } from '../lib/DataProvider'
import { hasBusiness } from '../lib/finance'

/** Phone "More" tab: everything not in the tab bar. */
export function More() {
  const { signOut } = useAuth()
  const { accounts, transactions } = useData()
  const business = hasBusiness(accounts ?? [], transactions ?? [])
  const inTabs = new Set(TAB_ITEMS.map((t) => t.to))
  return (
    <div className="page">
      <div className="page-head"><div><h1>More</h1></div></div>
      <Link className="btn btn-primary" to="/connect"><PlusIcon size={18} />Connect an account</Link>
      {NAV_GROUPS.map((g, i) => {
        const items = g.items.filter((it) => !inTabs.has(it.to) && (!it.businessOnly || business))
        if (!items.length) return null
        return (
          <section className="card" key={g.label ?? i} aria-label={g.label ?? 'Money'}>
            {g.label && <div className="group-label"><span>{g.label}</span></div>}
            <ul className="list">
              {items.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <Link className="row link-row" to={to}>
                    <span className="avatar alt" aria-hidden><Icon size={20} /></span>
                    <span className="row-main"><span className="row-title">{label}</span></span>
                    <ChevronIcon />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
      <button className="btn btn-secondary" onClick={() => signOut()}><SignOutIcon size={18} />Sign out</button>
    </div>
  )
}
