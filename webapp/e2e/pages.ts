/** Every other screen: path, file name, and a heading that proves it rendered. */
export const PAGES: { path: string; name: string; heading: string | RegExp; phoneOnly?: boolean }[] = [
  { path: '/app/accounts', name: '10-accounts', heading: 'Accounts' },
  { path: '/app/help', name: '11-connection-help', heading: 'Connection help' },
  { path: '/app/budget', name: '13-budget', heading: 'Budget' },
  { path: '/app/cash-flow', name: '14-cash-flow', heading: 'Cash flow' },
  { path: '/app/recurring', name: '15-recurring', heading: 'Recurring' },
  { path: '/app/credit-cards', name: '16-credit-cards', heading: 'Credit cards' },
  { path: '/app/loans', name: '17-loans', heading: 'Mortgages & loans' },
  { path: '/app/investments', name: '18-investments', heading: 'Investments' },
  { path: '/app/household', name: '19-household', heading: 'Household' },
  { path: '/app/more', name: '12-more', heading: 'More', phoneOnly: true },
]
