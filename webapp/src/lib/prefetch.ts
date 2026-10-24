// The main tabs' screen code, downloaded while the browser is idle after the signed-in shell first paints. The first
// visit to a tab used to wait for its chunk (a spinner on a slow phone connection); now it renders at once. Same
// import specifiers as App.tsx's lazy routes, so these are the same chunks, not copies. The Investments tables are
// warmed the same way.
const TAB_SCREENS = [
  () => import('../screens/Overview'),
  () => import('../screens/Budget'),
  () => import('../screens/Accounts'),
  () => import('../screens/Investments'),
  () => import('../screens/Transactions'),
  () => import('../screens/More'),
  () => import('../screens/Tax'),
  () => import('../screens/Settings'),
]

import { prefetchTable } from './useTable'

let started = false

type Schedule = (run: () => void) => void

// After the first screen has had its own requests to itself (about a second), then when the browser is idle, so the
// downloads never compete with what's on screen.
const whenIdle: Schedule = (run) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
  setTimeout(() => {
    if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 4000 })
    else run()
  }, 1000)
}

/** Starts the idle download once per page load. Failures are ignored: the route loads its chunk on demand anyway. */
export function prefetchTabScreens(schedule: Schedule = whenIdle): void {
  if (started) return
  started = true
  schedule(() => {
    for (const load of TAB_SCREENS) void load().catch(() => undefined)
    // Investments reads three server tables the shell doesn't: warm them too, one after another.
    void (async () => { for (const name of ['holdings', 'securities', 'snapshots'] as const) await prefetchTable(name) })()
  })
}
