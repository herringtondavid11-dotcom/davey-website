import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from '../config'

export const LAST_ACTIVE_KEY = 'davey.lastActive'
export const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

export function readLastActive(storage: Pick<Storage, 'getItem'> | undefined): number | null {
  try {
    const v = Number(storage?.getItem(LAST_ACTIVE_KEY))
    return Number.isFinite(v) && v > 0 ? v : null
  } catch {
    return null
  }
}

export function writeLastActive(storage: Pick<Storage, 'setItem'> | undefined, t: number) {
  try {
    storage?.setItem(LAST_ACTIVE_KEY, String(t))
  } catch {
    /* storage blocked: the in-memory timer still applies */
  }
}

export type IdleState = 'active' | 'warning' | 'expired'

export function idleState(lastActive: number, now: number, timeout = IDLE_TIMEOUT_MS, warning = IDLE_WARNING_MS): IdleState {
  const idle = now - lastActive
  if (idle >= timeout) return 'expired'
  if (idle >= timeout - warning) return 'warning'
  return 'active'
}
