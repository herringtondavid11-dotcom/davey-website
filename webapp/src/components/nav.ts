import type { ComponentType, SVGProps } from 'react'
import {
  AccountsIcon,
  BudgetIcon,
  CardIcon,
  CashFlowIcon,
  DownloadIcon,
  HelpIcon,
  HomeIcon,
  OverviewIcon,
  ReceiptIcon,
  RecurringIcon,
  ProfileIcon,
  SettingsIcon,
  TransactionsIcon,
  TrendIcon,
  UsersIcon,
} from './Icons'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement> & { size?: number }>
  end?: boolean
  businessOnly?: boolean
}

// The five tabs, in the app's order: Overview · Budget · Accounts · Investments · Ask (Ask opens the Davey AI panel, so
// it's a button in Layout rather than a route).
export const TAB_ITEMS: NavItem[] = [
  { to: '/', label: 'Overview', icon: OverviewIcon, end: true },
  { to: '/budget', label: 'Budget', icon: BudgetIcon },
  { to: '/accounts', label: 'Accounts', icon: AccountsIcon },
  { to: '/investments', label: 'Investments', icon: TrendIcon },
]

export const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: TAB_ITEMS },
  {
    label: 'Money',
    items: [
      { to: '/transactions', label: 'Transactions', icon: TransactionsIcon },
      { to: '/cash-flow', label: 'Cash flow', icon: CashFlowIcon },
      { to: '/recurring', label: 'Recurring', icon: RecurringIcon },
      { to: '/credit-cards', label: 'Credit cards', icon: CardIcon },
      { to: '/loans', label: 'Mortgages & loans', icon: HomeIcon },
    ],
  },
  { label: 'Business', items: [{ to: '/tax', label: 'Tax', icon: ReceiptIcon, businessOnly: true }] },
  {
    label: 'More',
    items: [
      { to: '/household', label: 'Household', icon: UsersIcon },
      { to: '/profile', label: 'Profile', icon: ProfileIcon },
      { to: '/exports', label: 'Exports', icon: DownloadIcon },
      { to: '/help', label: 'Connection help', icon: HelpIcon },
      { to: '/settings', label: 'Settings', icon: SettingsIcon },
    ],
  },
]

/** Opens the Davey AI panel (AskAI listens). */
export const openAsk = () => window.dispatchEvent(new Event('davey:ask'))
