import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { FullPageSpinner } from './components/Spinner'
import { DataProvider } from './lib/DataProvider'
import { supabase } from './lib/supabase'
import { Accounts } from './screens/Accounts'
import { Budget } from './screens/Budget'
import { CashFlow } from './screens/CashFlow'
import { CreditCards } from './screens/CreditCards'
import { Household } from './screens/Household'
import { Investments } from './screens/Investments'
import { Loans } from './screens/Loans'
import { RecurringScreen } from './screens/Recurring'
import { Connect, OAuthReturn } from './screens/Connect'
import { ConnectionHelp } from './screens/ConnectionHelp'
import { More } from './screens/More'
import { ForgotPassword } from './screens/ForgotPassword'
import { Login } from './screens/Login'
import { MfaChallenge } from './screens/MfaChallenge'
import { MfaEnroll } from './screens/MfaEnroll'
import { Overview } from './screens/Overview'
import { ResetLinkExpired, ResetPassword } from './screens/ResetPassword'
import { RotateBackup } from './screens/RotateBackup'
import { Settings } from './screens/Settings'
import { Transactions } from './screens/Transactions'

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

/** Accepts ?token_hash=…&type=recovery links (the PKCE ?code= form is handled by supabase-js on load). */
function ResetRoute() {
  const { refresh } = useAuth()
  const [checking, setChecking] = useState(true)
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const done = () => {
      window.history.replaceState(null, '', window.location.pathname)
      setChecking(false)
    }
    if (tokenHash) {
      supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash }).then(() => refresh()).finally(done)
    } else {
      supabase.auth.getSession().finally(done)
    }
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
