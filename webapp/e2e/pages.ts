/** Every other screen: path, file name, and a heading that proves it rendered. */
export const PAGES: { path: string; name: string; heading: string | RegExp; phoneOnly?: boolean }[] = [
  { path: '/app/accounts', name: '10-accounts', heading: 'Accounts' },
  { path: '/app/help', name: '11-connection-help', heading: 'Connection help' },
  { path: '/app/budget', name: '13-budget', heading: 'Budget' },
  { path: '/app/cash-flow', name: '14-cash-flow', heading: 'Cash flow' },
  { path: '/app/more', name: '12-more', heading: 'More', phoneOnly: true },
]
