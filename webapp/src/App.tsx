import { lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { FullPageSpinner } from './components/Spinner'
import { DataProvider } from './lib/DataProvider'
import { hashSession, supabase } from './lib/supabase'
import { Connect, OAuthReturn } from './screens/Connect'
import { ForgotPassword } from './screens/ForgotPassword'
import { Login } from './screens/Login'
import { MfaChallenge } from './screens/MfaChallenge'
import { MfaEnroll } from './screens/MfaEnroll'
import { Overview } from './screens/Overview'
import { ResetLinkExpired, ResetPassword } from './screens/ResetPassword'
import { RotateBackup } from './screens/RotateBackup'
import { Transactions } from './screens/Transactions'

// Less-used screens load on demand; Overview, Transactions and Connect stay in the main bundle.
const Accounts = lazy(() => import('./screens/Accounts').then((m) => ({ default: m.Accounts })))
const Budget = lazy(() => import('./screens/Budget').then((m) => ({ default: m.Budget })))
const CashFlow = lazy(() => import('./screens/CashFlow').then((m) => ({ default: m.CashFlow })))
const CreditCards = lazy(() => import('./screens/CreditCards').then((m) => ({ default: m.CreditCards })))
const Exports = lazy(() => import('./screens/Exports').then((m) => ({ default: m.Exports })))
const Household = lazy(() => import('./screens/Household').then((m) => ({ default: m.Household })))
const Tax = lazy(() => import('./screens/Tax').then((m) => ({ default: m.Tax })))
const Investments = lazy(() => import('./screens/Investments').then((m) => ({ default: m.Investments })))
const Loans = lazy(() => import('./screens/Loans').then((m) => ({ default: m.Loans })))
const RecurringScreen = lazy(() => import('./screens/Recurring').then((m) => ({ default: m.RecurringScreen })))
const ConnectionHelp = lazy(() => import('./screens/ConnectionHelp').then((m) => ({ default: m.ConnectionHelp })))
const More = lazy(() => import('./screens/More').then((m) => ({ default: m.More })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))

/** Signed in + 2-step verified (aal2), or the right step to get there. */
function Gate({ children, signedOut }: { children: ReactNode; signedOut?: ReactNode }) {
  const { status, mustRotateBackup, enrolling } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullPageSpinner />
  if (status === 'signedOut') {
    if (signedOut) return <>{signedOut}</>
    const next = location.pathname + location.search
    return <Navigate to={next === '/' ? '/login' : `/login?next=${encodeURIComponent(next)}`} replace />
  }
  if (status === 'needsMfa') return <MfaChallenge />
  if (status === 'needsEnroll' || enrolling) return <MfaEnroll />
  if (mustRotateBackup) return <RotateBackup />
  return <>{children}</>
}

/** Reset links are single use: each token is verified at most once per browser tab (StrictMode runs effects twice). */
const verifiedTokens = new Set<string>()
function claimToken(tokenHash: string): boolean {
  const key = `davey.verified.${tokenHash}`
  try {
    if (verifiedTokens.has(tokenHash) || sessionStorage.getItem(key)) return false
    sessionStorage.setItem(key, '1')
  } catch {
    if (verifiedTokens.has(tokenHash)) return false
  }
  verifiedTokens.add(tokenHash)
  return true
}

/**
 * The reset link's landing page. Supabase's verify page has usually used the link already and sent a session (PKCE
 * ?code=, exchanged by supabase-js on load, or #access_token): then it goes straight to "Choose a new password".
 * A ?token_hash= link is verified only when there's no session yet, and only once. "Expired" only without a session.
 */
function ResetRoute() {
  const { refresh } = useAuth()
  const [checking, setChecking] = useState(true)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    void (async () => {
      try {
        await hashSession
        const { data } = await supabase.auth.getSession()
        if (!data.session && tokenHash && claimToken(tokenHash)) {
          await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash })
        }
        await refresh()
      } finally {
        window.history.replaceState(null, '', window.location.pathname)
        setChecking(false)
      }
    })()
  }, [refresh])
  if (checking) return <FullPageSpinner />
  return (
    <Gate signedOut={<ResetLinkExpired />}>
      <ResetPassword />
    </Gate>
  )
}

function Protected() {
  return (
    <Gate>
      <DataProvider>
        <Layout />
      </DataProvider>
    </Gate>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset" element={<ResetRoute />} />
      <Route element={<Protected />}>
        <Route index element={<Overview />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/connect" element={<Connect />} />
        <Route path="/oauth" element={<OAuthReturn />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/accounts" element={<Accounts />} />
        <Route path="/help" element={<ConnectionHelp />} />
        <Route path="/more" element={<More />} />
        <Route path="/budget" element={<Budget />} />
        <Route path="/cash-flow" element={<CashFlow />} />
        <Route path="/recurring" element={<RecurringScreen />} />
        <Route path="/credit-cards" element={<CreditCards />} />
        <Route path="/loans" element={<Loans />} />
        <Route path="/investments" element={<Investments />} />
        <Route path="/household" element={<Household />} />
        <Route path="/exports" element={<Exports />} />
        <Route path="/tax" element={<Tax />} />
        <Route path="/security" element={<Navigate to="/settings" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export function App() {
  return (
    <BrowserRouter basename="/app">
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
