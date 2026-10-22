import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { EMAIL_2FA_ENABLED, IDLE_TIMEOUT_MS } from '../config'
import { ACTIVITY_EVENTS, idleState, readLastActive, writeLastActive, type IdleState } from '../lib/idle'
import { clearPendingLink } from '../lib/plaid'
import { supabase } from '../lib/supabase'
import { resetResolvedTables } from '../lib/tables'
import { clearTableCache } from '../lib/useTable'

export type AuthStatus = 'loading' | 'signedOut' | 'needsEmailCode' | 'ready'

interface AuthContextValue {
  status: AuthStatus
  session: Session | null
  email?: string
  recovery: boolean
  clearRecovery: () => void
  idle: IdleState
  signOutReason: 'idle' | null
  refresh: () => Promise<void>
  signOut: (reason?: 'idle') => Promise<void>
  stayActive: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

// 2-step verification on the web: after the password, a code emailed to the account's address (David, 2026-10-22: email
// code instead of an authenticator app / QR code). A session counts as verified when it was signed in with an emailed
// code or link (otp / magiclink), a password-reset link (recovery), or an authenticator code (totp, older sessions).
const VERIFIED_METHODS = new Set(['otp', 'magiclink', 'recovery', 'totp', 'email/signup', 'invite'])

/** The sign-in methods recorded in the access token (`amr`). */
export function sessionMethods(accessToken: string): string[] {
  try {
    const part = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))) as { amr?: { method?: string }[] }
    return (claims.amr ?? []).map((a) => String(a.method ?? ''))
  } catch {
    return []
  }
}

export function isEmailVerifiedSession(accessToken: string): boolean {
  return sessionMethods(accessToken).some((m) => VERIFIED_METHODS.has(m))
}

async function computeStatus(session: Session | null): Promise<AuthStatus> {
  if (!session) return 'signedOut'
  if (!EMAIL_2FA_ENABLED) return 'ready'
  return isEmailVerifiedSession(session.access_token) ? 'ready' : 'needsEmailCode'
}

const storage = () => (typeof window === 'undefined' ? undefined : window.localStorage)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [recovery, setRecovery] = useState(false)
  const [idle, setIdle] = useState<IdleState>('active')
  const [signOutReason, setSignOutReason] = useState<'idle' | null>(null)
  const lastActive = useRef(Date.now())

  const apply = useCallback(async (s: Session | null) => {
    setSession(s)
    const next = await computeStatus(s)
    setStatus(next)
  }, [])

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession()
    await apply(data.session)
  }, [apply])

  const signOut = useCallback(async (reason?: 'idle') => {
    // scope 'local': signing out on the web must not sign the iPhone or Mac out.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined)
    try {
      // An idle sign-out keeps a bank connection that's mid-OAuth (resumable only by the same user).
      if (reason !== 'idle') clearPendingLink()
      clearTableCache()
      resetResolvedTables()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
    setRecovery(false)
    setSignOutReason(reason ?? null)
    setIdle('active')
    await apply(null)
  }, [apply])

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      const last = readLastActive(storage())
      if (data.session && last && idleState(last, Date.now()) === 'expired') {
        await signOut('idle')
        return
      }
      await apply(data.session)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'MFA_CHALLENGE_VERIFIED' || event === 'USER_UPDATED') {
        // Defer: calling Supabase inside the callback can deadlock its auth lock.
        setTimeout(() => !cancelled && apply(s), 0)
      }
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [apply, signOut])

  // Sign-up sent the company access pass as user metadata (for the Auth hook). Once signed in it has done its job:
  // clear it so it doesn't ride along in every access token.
  const scrubbed = useRef(false)
  useEffect(() => {
    if (status !== 'ready' || scrubbed.current || !session?.user.user_metadata?.access_pass) return
    scrubbed.current = true
    void supabase.auth.updateUser({ data: { access_pass: null } }).catch(() => undefined)
  }, [status, session])

  const stayActive = useCallback(() => {
    lastActive.current = Date.now()
    writeLastActive(storage(), lastActive.current)
    setIdle('active')
  }, [])

  // 30-minute idle timeout while any session exists (including mid-2FA).
  useEffect(() => {
    if (!session) return
    stayActive()
    let lastWrite = 0
    const onActivity = () => {
      const now = Date.now()
      lastActive.current = now
      if (now - lastWrite > 5000) {
        lastWrite = now
        writeLastActive(storage(), now)
      }
    }
    for (const e of ACTIVITY_EVENTS) window.addEventListener(e, onActivity, { passive: true })
    const tick = () => {
      // Other tabs share the timestamp, so activity anywhere keeps every tab alive.
      const stored = readLastActive(storage()) ?? 0
      const last = Math.max(lastActive.current, stored)
      const state = idleState(last, Date.now(), IDLE_TIMEOUT_MS)
      if (state === 'expired') void signOut('idle')
      else setIdle(state)
    }
    const timer = window.setInterval(tick, 10_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      for (const e of ACTIVITY_EVENTS) window.removeEventListener(e, onActivity)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [session, signOut, stayActive])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      email: session?.user.email,
      recovery,
      clearRecovery: () => setRecovery(false),
      idle,
      signOutReason,
      refresh,
      signOut,
      stayActive,
    }),
    [status, session, recovery, idle, signOutReason, refresh, signOut, stayActive],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth outside AuthProvider')
  return ctx
}
