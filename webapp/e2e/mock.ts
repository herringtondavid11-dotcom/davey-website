import { expect, type Page, type Route } from '@playwright/test'
import { EMAIL_2FA_ENABLED } from '../src/flags'

export { EMAIL_2FA_ENABLED }

export const SUPABASE = 'https://zvyargbnvccdqgmtytck.supabase.co'
export const EMAIL = 'alex@example.com'
export const PASSWORD = 'correct horse battery'
export const GOOD_CODE = '123456'
/** The 6-digit sign-in code in the email (AUTH-EMAIL-FIX.md). */
export const EMAIL_CODE = '482139'

type Row = Record<string, unknown>
type Factor = { id: string; friendly_name: string; factor_type: 'totp'; status: 'verified' | 'unverified'; created_at: string; updated_at: string }

function b64url(o: object) {
  return Buffer.from(JSON.stringify(o)).toString('base64url')
}

const today = new Date()
const iso = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10)

/** Test-only access code and pass (the real PIN is the ACCESS_PIN Supabase secret, never in this repo). */
export const TEST_PIN = '246810'
export const TEST_PASS = 'dap_' + 'T'.repeat(43)

export function fixtures() {
  const accounts: Row[] = [
    { id: 'acc-1', plaid_account_id: 'p-1', name: 'Plaid Checking', nickname: 'Joint checking', mask: '0000', type: 'depository', subtype: 'checking', current_balance: 8420.17, available_balance: 8120.17, iso_currency_code: 'USD', institution_name: 'Chase', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-2', plaid_account_id: 'p-2', name: 'Plaid Saving', nickname: null, mask: '1111', type: 'depository', subtype: 'savings', current_balance: 25000, available_balance: 25000, iso_currency_code: 'USD', institution_name: 'Chase', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-3', plaid_account_id: 'p-3', name: 'Sapphire Preferred', nickname: 'Travel card', mask: '3333', type: 'credit', subtype: 'credit card', current_balance: 1875.42, credit_limit: 15000, apr: 21.49, minimum_payment: 40, next_payment_due_date: iso(-9), iso_currency_code: 'USD', institution_name: 'Chase', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-4', plaid_account_id: 'p-4', name: 'Brokerage', nickname: null, mask: '4444', type: 'investment', subtype: 'brokerage', current_balance: 512640.55, iso_currency_code: 'USD', institution_name: 'Fidelity', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-5', plaid_account_id: 'p-5', name: 'Home Mortgage', nickname: null, mask: '5555', type: 'loan', subtype: 'mortgage', current_balance: 412300, interest_rate: 6.25, original_principal: 450000, origination_date: '2021-06-01', term_months: 360, minimum_payment: 2770.73, property_value: 690000, iso_currency_code: 'USD', institution_name: 'Rocket Mortgage', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-7', plaid_account_id: 'p-7', name: 'Blue Cash Everyday', nickname: null, mask: '7777', type: 'credit', subtype: 'credit card', current_balance: 3400, credit_limit: 6000, apr: 27.24, minimum_payment: 85, iso_currency_code: 'USD', institution_name: 'American Express', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-8', plaid_account_id: 'p-8', name: 'Auto Loan', nickname: 'Car', mask: '8888', type: 'loan', subtype: 'auto', current_balance: 18250, interest_rate: 5.9, original_principal: 32000, origination_date: '2023-03-01', term_months: 60, minimum_payment: 617.2, iso_currency_code: 'USD', institution_name: 'Capital One', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-6', plaid_account_id: 'p-6', name: 'Everyday Business Checking', nickname: 'Studio', mask: '6666', type: 'depository', subtype: 'checking', current_balance: 12800, iso_currency_code: 'USD', institution_name: 'Wells Fargo', created_at: '2026-01-02T00:00:00Z', is_business: true },
  ].map((a) => ({ is_business: false, ...a }))
  const merchants: [string, number, string, string, boolean?][] = [
    ['Whole Foods Market', 84.2, 'Groceries', 'acc-1'],
    ['Adobe', 59.99, 'Subscriptions', 'acc-3', true],
    ['Payroll – Acme Corp', -4200, 'Income', 'acc-1'],
    ['Blue Bottle Coffee', 6.5, 'Dining', 'acc-3'],
    ['Springfield Electric', 142.88, 'Bills & Utilities', 'acc-1'],
    ['Delta Air Lines', 412.3, 'Travel', 'acc-3', true],
    ['Shell', 58.12, 'Gas & Transport', 'acc-3'],
    ['Trader Joe’s', 63.45, 'Groceries', 'acc-1'],
    ['Netflix', 15.49, 'Subscriptions', 'acc-3'],
    ['Interest', -21.7, 'Income', 'acc-2'],
    ['Home Depot', 231.04, 'Home', 'acc-3'],
    ['Staples', 48.9, 'Business Expenses', 'acc-3', true],
    ['Canva', 12.99, 'Subscriptions', 'acc-3'],
  ]
  const transactions: Row[] = merchants.map(([m, amount, category, account, biz], i) => ({
    id: `txn-${i + 1}`,
    account_id: account,
    date: iso(Math.floor(i / 2)),
    name: m.toUpperCase(),
    merchant_name: m,
    amount,
    category,
    notes: i === 0 ? 'Weekly shop' : null,
    is_business: !!biz,
    pending: i === 1,
    iso_currency_code: 'USD',
  }))
  // Six months of history: payroll, rent and subscriptions on fixed days (cash flow, recurring).
  const history: [string, number, string, string, number, boolean?][] = [
    ['Payroll – Acme Corp', -4200, 'Income', 'acc-1', 1],
    ['Greystar Rent', 2400, 'Home', 'acc-1', 3],
    ['Netflix', 15.49, 'Subscriptions', 'acc-3', 9],
    ['Spotify', 11.99, 'Subscriptions', 'acc-3', 14],
    ['Equinox', 49, 'Health', 'acc-3', 20],
    ['Safeway', 180, 'Groceries', 'acc-1', 12],
    ['Adobe', 59.99, 'Subscriptions', 'acc-6', 18, true],
    ['Stripe Payout', -3500, 'Income', 'acc-6', 25, true],
  ]
  const now = new Date()
  for (let back = 1; back <= 6; back++) {
    history.forEach(([m, amount, category, account, day, biz], j) => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, day)
      transactions.push({
        id: `txn-h${back}-${j}`, account_id: account, date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        name: m.toUpperCase(), merchant_name: m, amount: amount + (category === 'Groceries' ? back * 7 : 0), category, notes: null, is_business: !!biz, pending: false, iso_currency_code: 'USD',
      })
    })
  }
  transactions.push({ id: 'txn-xfer', account_id: 'acc-1', date: iso(3), name: 'TRANSFER TO SAVINGS', merchant_name: null, amount: 500, category: 'Transfer', notes: null, is_business: false, pending: false, iso_currency_code: 'USD' })
  return { accounts, transactions }
}

export function extraTables(): Record<string, Row[]> {
  return {
    budgets: [
      { id: 'b1', category: 'Groceries', amount: 600 },
      { id: 'b2', category: 'Dining', amount: 150 },
      { id: 'b3', category: 'Subscriptions', amount: 120 },
      { id: 'b4', category: 'Travel', amount: 300 },
    ],
    household_members: [
      { id: 'm1', household_id: 'hh-1', user_id: 'user-1', display_name: 'Alex', role: 'owner', joined_at: '2026-01-02T00:00:00Z' },
      { id: 'm2', household_id: 'hh-1', user_id: 'user-2', display_name: 'Jordan', role: 'member', joined_at: '2026-03-14T00:00:00Z' },
    ],
    household_invites: [],
    profiles: [{ id: 'user-1', first_name: 'Alex', last_name: 'Rivera', display_name: 'Alex', phone: '', email: 'alex@example.com' }],
    investment_holdings: [
      { id: 'h1', account_id: 'acc-4', security_id: 's1', quantity: 820, institution_price: 287.4, institution_value: 235668, cost_basis: 180000 },
      { id: 'h2', account_id: 'acc-4', security_id: 's2', quantity: 410, institution_price: 451.2, institution_value: 184992, cost_basis: 150000 },
      { id: 'h3', account_id: 'acc-4', security_id: 's3', quantity: 900, institution_price: 72.1, institution_value: 64890, cost_basis: 70000 },
      { id: 'h4', account_id: 'acc-4', security_id: 's4', quantity: 27090.55, institution_price: 1, institution_value: 27090.55, cost_basis: 27090.55 },
    ],
    investment_securities: [
      { security_id: 's1', name: 'Vanguard Total Stock Market ETF', ticker_symbol: 'VTI', type: 'etf' },
      { security_id: 's2', name: 'Apple Inc.', ticker_symbol: 'AAPL', type: 'equity' },
      { security_id: 's3', name: 'Vanguard Total Bond Market ETF', ticker_symbol: 'BND', type: 'fixed income' },
      { security_id: 's4', name: 'Cash sweep', ticker_symbol: 'CASH', type: 'cash' },
    ],
    // A year of reconstructed history for the brokerage (Plaid account p-4) plus Davey's two real days.
    investment_snapshots: Array.from({ length: 366 }, (_, i) => {
      const d = new Date(Date.now() - (365 - i) * 86_400_000)
      const value = 420_000 + i * 250 + (i === 200 ? 5_000 : 0)
      return { account_id: 'p-4', date: d.toISOString().slice(0, 10), value: i === 365 ? 512_640.55 : value, net_flow: i === 200 ? 5_000 : 0, estimated: i < 364 }
    }),
    plaid_items: [
      { id: 'item-row-3', plaid_item_id: 'item-fid', institution_name: 'Fidelity', status: 'good', error_code: null, last_synced_at: new Date(Date.now() - 3600_000).toISOString() },
      { id: 'item-row-1', plaid_item_id: 'item-chase', institution_name: 'Chase', status: 'good', error_code: null, last_synced_at: new Date(Date.now() - 3600_000).toISOString() },
      { id: 'item-row-2', plaid_item_id: 'item-wf', institution_name: 'Wells Fargo', status: 'login_required', error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'Sign in to Wells Fargo again', last_synced_at: new Date(Date.now() - 4 * 86400_000).toISOString() },
    ],
  }
}

// ---- Davey's real server shape: household_records (see src/lib/serverData.ts) ----
const HOUSEHOLD = 'house-1'
const daveyType = (a: Row) =>
  a.type === 'credit' ? 'creditCard' : a.type === 'loan' ? 'loan' : a.type === 'investment' ? 'investment'
    : a.subtype === 'savings' ? 'savings' : 'checking'
const cents = (n: unknown) => Math.round(Number(n ?? 0) * 100)
const categoryId = (name: string) => `cat-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
// Noon UTC: the same calendar day in every US time zone (the browser runs as Los Angeles, Node as UTC).
const localMidnight = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d, 12)).toISOString() }

/** The fixtures (web-shaped rows) as the app's household records: what production actually serves. */
export function householdRecords(state: { accounts: Row[]; transactions: Row[]; extra: Record<string, Row[]> }) {
  const records: { household_id: string; entity: string; id: string; payload: Row; updated_at: string }[] = []
  const add = (entity: string, id: string, payload: Row) => records.push({ household_id: HOUSEHOLD, entity, id, payload, updated_at: '2026-10-01T00:00:00Z' })
  const banks = new Map<string, string>()
  for (const item of state.extra.plaid_items ?? []) {
    const id = `bank-${String(item.institution_name).toLowerCase().replace(/\W+/g, '-')}`
    banks.set(String(item.institution_name), id)
    add('bankConnection', id, { itemID: item.plaid_item_id, institutionName: item.institution_name, status: item.status === 'login_required' ? 'needsReauth' : 'ok', lastSyncedAt: item.last_synced_at })
  }
  const categories = new Set<string>()
  for (const t of state.transactions) if (t.category) categories.add(String(t.category))
  for (const b of state.extra.budgets ?? []) categories.add(String(b.category))
  for (const name of categories) add('category', categoryId(name), { name, kind: name === 'Income' ? 'income' : name === 'Transfer' ? 'transfer' : 'expense' })
  const sums = new Map<string, number>()
  for (const t of state.transactions) sums.set(String(t.account_id), (sums.get(String(t.account_id)) ?? 0) - cents(t.amount))
  for (const a of state.accounts) {
    const type = daveyType(a)
    const balance = (type === 'creditCard' || type === 'loan' ? -1 : 1) * cents(a.current_balance)
    add('account', String(a.id), {
      name: a.name, nickname: a.nickname ?? null, mask: a.mask, type, externalID: a.plaid_account_id ?? null, source: 'plaid',
      startingBalance: balance - (sums.get(String(a.id)) ?? 0), availableBalance: a.available_balance === undefined ? null : cents(a.available_balance),
      bankConnectionID: banks.get(String(a.institution_name)) ?? null, isBusiness: a.is_business === true, isArchived: a.is_hidden === true,
      createdAt: a.created_at,
      creditLimit: a.credit_limit === undefined ? null : cents(a.credit_limit),
      aprBasisPoints: a.apr ?? a.interest_rate ? Math.round(Number(a.apr ?? a.interest_rate) * 100) : null,
      originalPrincipal: a.original_principal === undefined ? null : cents(a.original_principal),
      loanStartDate: a.origination_date ? localMidnight(String(a.origination_date)) : null,
      loanTermMonths: a.term_months ?? null,
      monthlyPayment: type === 'loan' && a.minimum_payment !== undefined ? cents(a.minimum_payment) : null,
      nextPaymentAmount: type === 'creditCard' && a.minimum_payment !== undefined ? cents(a.minimum_payment) : null,
      nextPaymentDueDate: a.next_payment_due_date ? localMidnight(String(a.next_payment_due_date)) : null,
      linkedPropertyID: a.property_value !== undefined ? `${a.id}-home` : null,
      goalTarget: a.goal_target ?? null, goalStart: a.goal_start ?? null, goalTargetDate: a.goal_target_date ?? null,
    })
    // Davey keeps a mortgage's home as its own (real estate) account.
    if (a.property_value !== undefined) {
      add('account', `${a.id}-home`, { name: 'Home', type: 'property', source: 'manual', startingBalance: cents(a.property_value), isArchived: false })
    }
  }
  for (const t of state.transactions) {
    add('transaction', String(t.id), {
      accountID: t.account_id, amount: -cents(t.amount), date: localMidnight(String(t.date)), payee: t.merchant_name ?? t.name,
      note: t.notes ?? '', categoryID: t.category ? categoryId(String(t.category)) : null, isPending: t.pending === true, source: 'plaid',
    })
  }
  const month = new Date().getFullYear() * 100 + new Date().getMonth() + 1
  for (const b of state.extra.budgets ?? []) add('budget', String(b.id), { categoryID: categoryId(String(b.category)), limit: cents(b.amount), monthKey: month })
  // Recurring rules entered in the app (not detected from transactions); a paused one stays hidden.
  add('recurring', 'rec-insurance', { payee: 'Summit Home Insurance', amount: -12000, frequency: 'monthly', startDate: localMidnight('2026-01-15'), isPaused: false, postedCount: 0 })
  add('recurring', 'rec-paused', { payee: 'Paused Gym', amount: -4500, frequency: 'monthly', startDate: localMidnight('2026-01-03'), isPaused: true })
  return records
}

export interface MockOptions {
  /** Plaid Link fails the first standard session with API_ERROR (Shellpoint); the fallback token succeeds. */
  apiErrorFirst?: boolean
  /** plaid-link-token answers mode:'update' for reconnects (the server change is deployed). */
  updateMode?: boolean
  /** household-invite Edge Function is deployed. */
  inviteFunction?: boolean
  /** ask-ai answers (true), returns the monthly limit (limit), or isn't web-enabled (undefined). */
  aiFunction?: boolean | 'limit'
  /** login-activity Edge Function is deployed. */
  activityFunction?: boolean
  /** link-support isn't web-enabled yet (CORS): the browser can't reach it. */
  reportDown?: boolean
  /** household-invite / -remove-member / -leave aren't web-enabled yet. */
  householdActionsDown?: boolean
  /** 'verified' = user already has an authenticator; 'none' = must enroll. */
  mfa?: 'verified' | 'none'
  backup?: boolean
  signedIn?: boolean
  /** The brokerage was linked without Plaid Investments (Investments shows "Finish setting up"). */
  investmentsConsent?: boolean
  /** Supabase's email limit is hit (no custom SMTP yet). */
  emailRateLimited?: boolean
  /** The account was created on the web: its metadata still holds the access pass from sign-up. */
  passInMetadata?: boolean
  /** A leftover unfinished "Davey authenticator" setup that Supabase doesn't list but still blocks the name. */
  hiddenStaleFactor?: boolean
  /** The household's bank count has reached the server's limit (server_flags.max_bank_connections). */
  bankLimit?: number
  /** Plaid Link stays open (no success/exit) until the test calls window.__plaidClose(). */
  plaidHold?: boolean
  /** false: no company access pass on this device (the access-code screen shows first). Default true. */
  accessPass?: boolean
  /** access-pin isn't deployed yet (404). */
  accessPinDown?: boolean
  /** The user doesn't share a household (Davey on the web has nothing to show or connect into). */
  noHousehold?: boolean
}

export async function mockBackend(page: Page, opts: MockOptions = {}) {
  const state = {
    ...fixtures(),
    factors: [] as Factor[],
    aal: 'aal1' as 'aal1' | 'aal2',
    calls: [] as { path: string; method: string; body: unknown }[],
    linkTokenBody: null as unknown,
    linkTokenBodies: [] as Row[],
    linkEvents: [] as Row[],
    extra: extraTables() as Record<string, Row[]>,
    reportBody: null as unknown,
    inviteBody: null as unknown,
    aiBody: null as Record<string, unknown> | null,
    exchangeBody: null as unknown,
    pushes: [] as Row[],
    pushed: [] as { household_id: string; entity: string; id: string; payload: Row; updated_at: string }[],
    syncBodies: [] as Row[],
    investmentsBodies: [] as Row[],
    pinFailures: 0,
    recovery: false,
    pkceExchanges: [] as Row[],
    verifyCalls: 0,
    otpSends: [] as Row[],
    metadata: (opts.passInMetadata ? { first_name: 'Alex', access_pass: TEST_PASS } : {}) as Row,
    signUpBody: null as Row | null,
  }
  const now = new Date().toISOString()
  if ((opts.mfa ?? 'verified') === 'verified') {
    state.factors.push({ id: 'f-primary', friendly_name: 'Davey authenticator', factor_type: 'totp', status: 'verified', created_at: now, updated_at: now })
    if (opts.backup ?? true) state.factors.push({ id: 'f-backup', friendly_name: 'Davey backup', factor_type: 'totp', status: 'verified', created_at: now, updated_at: now })
  }

  const user = () => ({
    id: 'user-1', aud: 'authenticated', role: 'authenticated', email: EMAIL, email_confirmed_at: now,
    app_metadata: { provider: 'email' }, user_metadata: state.metadata, created_at: now, updated_at: now,
    factors: state.factors,
  })
  const session = () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const t = Math.floor(Date.now() / 1000)
    // aal2 here means "verified by the emailed code" (amr otp); a password-reset link gives a recovery session.
    const amr = state.recovery ? [{ method: 'recovery', timestamp: t }] : [{ method: 'password', timestamp: t }, ...(state.aal === 'aal2' ? [{ method: 'otp', timestamp: t }] : [])]
    const token = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: 'user-1', email: EMAIL, role: 'authenticated', aal: state.aal, amr, exp, session_id: 'sess-1' })}.sig`
    return { access_token: token, refresh_token: 'refresh-1', token_type: 'bearer', expires_in: 3600, expires_at: exp, user: user() }
  }

  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'Access-Control-Allow-Origin': '*' } })

  await page.route(`${SUPABASE}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const method = req.method()
    const path = url.pathname
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' } })
    let body: Row = {}
    try { body = req.postDataJSON() ?? {} } catch { /* none */ }
    state.calls.push({ path: path + url.search, method, body })

    // ---- Company access code (test PIN only; the real one is a Supabase secret) ----
    if (path === '/functions/v1/access-pin') {
      if (opts.accessPinDown) return json(route, { message: 'Function not found' }, 404)
      if (body.action === 'check') return json(route, { valid: body.pass === TEST_PASS, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
      if (state.pinFailures >= 5) return json(route, { error: 'locked', retry_at: new Date(Date.now() + 15 * 60_000).toISOString() }, 429)
      if (body.pin === TEST_PIN) return json(route, { pass: TEST_PASS, expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString() })
      state.pinFailures += 1
      if (state.pinFailures >= 5) return json(route, { error: 'locked', retry_at: new Date(Date.now() + 15 * 60_000).toISOString() }, 429)
      return json(route, { error: 'wrong_pin', attempts_left: 5 - state.pinFailures }, 401)
    }
    if (path === '/auth/v1/signup') {
      state.signUpBody = body
      if (opts.emailRateLimited) return json(route, { code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded', error_code: 'over_email_send_rate_limit' }, 429)
      const meta = (body.data ?? {}) as Row
      if (meta.access_pass !== TEST_PASS) return json(route, { code: 403, error_code: 'unexpected_failure', msg: 'Davey is invite-only right now. Enter the company access code at daveypersonalfinance.com/app first.' }, 403)
      return json(route, { id: 'user-new', aud: 'authenticated', role: 'authenticated', email: body.email, user_metadata: meta, app_metadata: { provider: 'email' }, identities: [{ id: 'i1' }], created_at: now, updated_at: now })
    }

    // ---- Auth ----
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'pkce') {
        // The emailed link, after Supabase's verify page: ?code= on our callback, exchanged with this browser's verifier.
        state.pkceExchanges.push(body)
        if (body.auth_code !== 'pkce-good' || !body.code_verifier) return json(route, { code: 400, error_code: 'flow_state_not_found', msg: 'invalid flow state, no valid flow state found' }, 400)
        state.aal = 'aal2'
        return json(route, session())
      }
      if (url.searchParams.get('grant_type') === 'password') {
        if (body.email !== EMAIL || body.password !== PASSWORD) return json(route, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
        state.aal = 'aal1'
        return json(route, session())
      }
      return json(route, session())
    }
    if (path === '/auth/v1/user' && method === 'GET') return json(route, user())
    if (path === '/auth/v1/user' && method === 'PUT') {
      if (body.data && typeof body.data === 'object') {
        state.metadata = { ...state.metadata, ...(body.data as Row) }
        for (const [k, v] of Object.entries(state.metadata)) if (v === null) delete state.metadata[k]
      }
      return json(route, user())
    }
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
    if (path === '/auth/v1/recover') {
      if (opts.emailRateLimited) return json(route, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }, 429)
      return json(route, {})
    }
    if (path === '/auth/v1/otp') {
      state.otpSends.push(body)
      if (opts.emailRateLimited) return json(route, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }, 429)
      return json(route, {})
    }
    if (path === '/auth/v1/verify' && body.type === 'email' && body.token_hash) {
      state.verifyCalls += 1
      if (body.token_hash !== 'link-hash-good') return json(route, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
      state.aal = 'aal2'
      return json(route, session())
    }
    if (path === '/auth/v1/verify' && body.type === 'email') {
      state.verifyCalls += 1
      if (body.email !== EMAIL || body.token !== EMAIL_CODE) return json(route, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
      state.aal = 'aal2'
      return json(route, session())
    }
    if (path === '/auth/v1/verify') {
      state.recovery = body.token_hash === 'good-hash'
      if (body.token_hash !== 'good-hash') return json(route, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
      state.aal = 'aal1'
      return json(route, session())
    }
    if (path === '/auth/v1/factors' && method === 'POST') {
      if (opts.hiddenStaleFactor && body.friendly_name === 'Davey authenticator') {
        return json(route, { code: 422, error_code: 'mfa_factor_name_conflict', msg: 'A factor with the friendly name "Davey authenticator" for this user already exists' }, 422)
      }
      const id = `f-${state.factors.length + 1}-${Date.now()}`
      state.factors.push({ id, friendly_name: String(body.friendly_name), factor_type: 'totp', status: 'unverified', created_at: now, updated_at: now })
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#fff"/><rect x="1" y="1" width="3" height="3"/><rect x="6" y="1" width="3" height="3"/><rect x="1" y="6" width="3" height="3"/><rect x="5" y="5" width="2" height="2"/></svg>`
      return json(route, { id, type: 'totp', friendly_name: body.friendly_name, totp: { qr_code: `data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`, secret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', uri: 'otpauth://totp/Davey' } })
    }
    const factorMatch = path.match(/^\/auth\/v1\/factors\/([^/]+)(?:\/(challenge|verify))?$/)
    if (factorMatch) {
      const [, id, action] = factorMatch
      if (method === 'DELETE') {
        state.factors = state.factors.filter((f) => f.id !== id)
        return json(route, { id })
      }
      if (action === 'challenge') return json(route, { id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 })
      if (action === 'verify') {
        const code = String(body.code)
        const factor = state.factors.find((f) => f.id === id)
        // Primary: only GOOD_CODE works. Backup factors: the app derives a TOTP from the key, any 6 digits accepted.
        const ok = factor && (factor.friendly_name === 'Davey backup' ? /^\d{6}$/.test(code) : code === GOOD_CODE)
        if (!ok) return json(route, { code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422)
        factor!.status = 'verified'
        state.aal = 'aal2'
        return json(route, session())
      }
    }

    // ---- household_records (the app's shared copy; the only accounts/transactions on the server) ----
    if (path === '/rest/v1/household_records' && method === 'GET') {
      if (opts.noHousehold) return json(route, [])
      const entity = url.searchParams.get('entity')?.replace(/^eq\./, '')
      const all = [...householdRecords(state), ...state.pushed.filter((r) => !householdRecords(state).some((x) => x.entity === r.entity && x.id === r.id))]
      const rows = all.filter((r) => r.entity === entity)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? rows.length)
      return json(route, rows.slice(offset, offset + limit))
    }
    if (path === '/rest/v1/household_members' && method === 'GET' && opts.noHousehold) return json(route, [])
    if (path === '/rest/v1/rpc/push_household_records') {
      state.pushes.push(body)
      const list = (body.p_records as { entity: string; id: string; payload: Row }[]) ?? []
      for (const r of list) {
        // Edits land on the web-shaped fixture rows; new records (an imported bank) are kept as pushed.
        const account = r.entity === 'account' ? state.accounts.find((a) => a.id === r.id) : undefined
        const tx = r.entity === 'transaction' ? state.transactions.find((t) => t.id === r.id) : undefined
        const budget = r.entity === 'budget' ? (state.extra.budgets ?? []).find((b) => b.id === r.id) : undefined
        if (budget) Object.assign(budget, { amount: Number(r.payload.limit) / 100 })
        else if (account) Object.assign(account, {
          nickname: r.payload.nickname ?? null, is_business: r.payload.isBusiness === true,
          goal_target: r.payload.goalTarget ?? null, goal_start: r.payload.goalStart ?? null, goal_target_date: r.payload.goalTargetDate ?? null,
        })
        else if (tx) {
          const category = householdRecords(state).find((c) => c.entity === 'category' && c.id === r.payload.categoryID)
          Object.assign(tx, { notes: r.payload.note || null, category: category ? category.payload.name : null })
        } else {
          state.pushed = state.pushed.filter((x) => !(x.entity === r.entity && x.id === r.id))
          state.pushed.push({ household_id: HOUSEHOLD, entity: r.entity, id: r.id, payload: r.payload, updated_at: now })
        }
      }
      return json(route, list.length)
    }

    // ---- REST ----
    const rest = path.match(/^\/rest\/v1\/(\w+)$/)
    if (rest) {
      const name = rest[1]
      const rows = name === 'accounts' || name === 'transactions' ? (state[name] as Row[]) : state.extra[name]
      if (!rows) return json(route, { code: 'PGRST205', message: `Could not find the table 'public.${name}' in the schema cache` }, 404)
      if (method === 'POST') {
        const added = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: `${name}-${rows.length + i + 1}`, ...r }))
        rows.push(...added)
        return json(route, added, 201)
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        const i = rows.findIndex((r) => String(r.id) === id)
        const removed = i >= 0 ? rows.splice(i, 1) : []
        return json(route, removed)
      }
      if (method === 'GET') {
        let list = rows
        for (const v of url.searchParams.getAll('date')) {
          const [op, val] = [v.slice(0, 3), v.slice(4)]
          list = list.filter((r) => (op === 'gte' ? String(r.date) >= val : op === 'lte' ? String(r.date) <= val : true))
        }
        if (list !== rows) {
          const offset = Number(url.searchParams.get('offset') ?? 0)
          const limit = Number(url.searchParams.get('limit') ?? list.length)
          return json(route, list.slice(offset, offset + limit))
        }
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const limit = Number(url.searchParams.get('limit') ?? rows.length)
        return json(route, rows.slice(offset, offset + limit))
      }
      if (method === 'PATCH') {
        const id = url.searchParams.get('id')?.replace(/^eq\./, '')
        const row = rows.find((r) => String(r.id) === id)
        if (!row) return json(route, [])
        Object.assign(row, body)
        return json(route, [row])
      }
    }

    // ---- Edge Functions ----
    if (path === '/functions/v1/plaid-link-token') {
      state.linkTokenBody = body
      state.linkTokenBodies.push(body)
      if (opts.bankLimit && !body.item_id) return json(route, { error: 'plan_limit', message: `You've connected ${opts.bankLimit} banks, Davey Premium's fair-use limit. Disconnect one you no longer use, or contact support and we'll help.` }, 402)
      // Shellpoint: Plaid fails the first (standard) session with API_ERROR; the fallback token works.
      if (opts.apiErrorFirst && !body.item_id) return json(route, { link_token: body.fallback ? 'link-fallback-1' : 'link-api-error', expiration: now, config: body.fallback ? 'fallback' : 'standard' })
      if (body.mode === 'update' && !opts.updateMode) return json(route, { link_token: 'link-production-web-123', expiration: now })
      return json(route, { link_token: 'link-production-web-123', expiration: now, ...(body.mode === 'update' ? { mode: 'update' } : {}) })
    }
    if (path === '/functions/v1/link-support') {
      if (opts.reportDown) return route.abort('failed')
      if (body.action === 'event') {
        state.linkEvents.push(body)
        return json(route, { logged: true })
      }
      state.reportBody = body
      return json(route, { reported: true })
    }
    if (path === '/functions/v1/household-invite' || path === '/functions/v1/household-remove-member' || path === '/functions/v1/household-leave') {
      if (opts.householdActionsDown) return route.abort('failed')
      state.inviteBody = body
      const invites = state.extra.household_invites
      if (path.endsWith('remove-member')) {
        state.extra.household_members = state.extra.household_members.filter((m) => m.user_id === 'user-1')
        return json(route, { removed: true })
      }
      if (path.endsWith('household-leave')) return json(route, { left: true })
      if (body.action === 'create') {
        invites.push({ id: 'inv-1', kind: 'link', household_id: 'hh-1', invitee_first_name: body.first_name, invitee_last_name: body.last_name ?? null, invitee_email: body.email ?? null, relationship: body.relationship, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), used_at: null, revoked: false })
        return json(route, { invite: invites.at(-1), link: 'https://daveypersonalfinance.com/join?t=tok-new-123', email: body.send_email ? 'sent' : 'skipped' })
      }
      if (body.action === 'cancel') {
        const inv = invites.find((i) => i.id === body.invite_id)
        if (inv) inv.revoked = true
        return json(route, { cancelled: true })
      }
      return json(route, { link: 'https://daveypersonalfinance.com/join?t=tok-again-456' })
    }
    if (path === '/functions/v1/plaid-item-status') {
      return json(route, { items: [{ item_id: 'item-fid', needs_sync: false, status: 'ok', institution_name: 'Fidelity Investments',
        investments_status: opts.investmentsConsent ? 'needs_consent' : 'ok' }] })
    }
    if (path === '/functions/v1/plaid-investments') {
      state.investmentsBodies.push(body)
      return json(route, { status: 'ok', accounts: [] })
    }
    if (path === '/functions/v1/plaid-exchange') {
      state.exchangeBody = body
      return json(route, { item_id: 'item-new', institution_name: 'First Platypus Bank', accounts: [] })
    }
    if (path === '/functions/v1/plaid-sync') {
      state.syncBodies.push(body)
      // The function's wire format (toAppAccount / toAppTransaction): cents, app sign.
      return json(route, {
        added: [{ transaction_id: 'ptx-1', account_id: 'p-new-1', amount_cents: -1250, date: iso(1), name: 'Platypus Coffee', pending: false, category_primary: 'FOOD_AND_DRINK', category_detailed: null }],
        modified: [], removed: [],
        accounts: [{ account_id: 'p-new-1', name: 'Platypus Checking', official_name: null, mask: '4321', type: 'depository', subtype: 'checking', current_balance_cents: 150000, available_balance_cents: 150000, limit_cents: null }],
        next_cursor: 'cursor-new', has_more: false,
      })
    }
    if (path === '/functions/v1/household-invite') {
      if (!opts.inviteFunction) return json(route, { message: 'Function not found' }, 404)
      state.inviteBody = body
      return json(route, { token: 'tok-new-123' })
    }
    if (path === '/functions/v1/ask-ai') {
      if (!opts.aiFunction) return json(route, { message: 'Function not found' }, 404)
      state.aiBody = body
      if (opts.aiFunction === 'limit') return json(route, { error: 'limit' }, 429)
      return json(route, { answer: 'You could cancel:\n- Spotify ($11.99)\n- Equinox ($49)\n\nThat saves about **$61** a month.' })
    }
    if (path === '/functions/v1/login-activity') {
      if (!opts.activityFunction) return json(route, { message: 'Function not found' }, 404)
      return json(route, { events: [
        { created_at: new Date(Date.now() - 3600_000).toISOString(), action: 'login', ip_address: '73.15.2.10', user_agent: 'Davey/1.0 CFNetwork Darwin iPhone' },
        { created_at: new Date(Date.now() - 86400_000).toISOString(), action: 'user_updated_password', ip_address: '73.15.2.10' },
      ] })
    }

    return json(route, { message: `unmocked ${method} ${path}` }, 404)
  })

  // Plaid Link: a fake link-initialize.js. open() reports success right away; receivedRedirectUri is recorded.
  await page.route('https://cdn.plaid.com/**', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: `window.__plaidCreates = [];
      window.Plaid = { create: function (opts) {
        window.__plaidCreates.push({ token: opts.token, receivedRedirectUri: opts.receivedRedirectUri || null });
        // Like Plaid: an iframe added to <body> at create time, sized with an inline style attribute (which Davey's
        // CSP blocks, exactly as in production).
        var frame = document.createElement('iframe');
        frame.id = 'plaid-link-iframe-' + window.__plaidCreates.length;
        frame.title = 'Plaid Link';
        frame.setAttribute('style', 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;border:0;display:block');
        document.body.appendChild(frame);
        window.__plaidClose = function (status, institutionName) {
          opts.onExit(null, {
            status: arguments.length ? status : 'requires_credentials',
            link_session_id: 'ls-held',
            institution: institutionName ? { institution_id: 'ins_56', name: institutionName } : null,
          });
        };
        return {
          open: function () { if (${opts.plaidHold ? 'true' : 'false'}) return; setTimeout(function () {
            if (opts.token === 'link-api-error') return opts.onExit(
              { error_type: 'API_ERROR', error_code: 'INTERNAL_SERVER_ERROR', error_message: 'an unexpected error occurred', display_message: null },
              { status: null, link_session_id: 'ls-shellpoint', request_id: 'req-shellpoint', institution: { institution_id: 'ins_119891', name: 'Shellpoint Mortgage Servicing' } });
            opts.onSuccess('public-production-abc', {
            institution: { institution_id: 'ins_109508', name: 'First Platypus Bank' },
            accounts: [{ id: 'p-new-1', name: 'Plaid Checking', mask: '4321', type: 'depository', subtype: 'checking' }],
            link_session_id: 'ls-1' }); }, 50); },
          exit: function () {}, destroy: function () { frame.remove(); }
        };
      } };`,
    }),
  )

  if (opts.accessPass ?? true) {
    await page.addInitScript((pass) => {
      localStorage.setItem('davey.accessPass', JSON.stringify({ pass, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }))
    }, TEST_PASS)
  }
  if (opts.signedIn) {
    state.aal = 'aal2'
    await page.addInitScript((s) => {
      localStorage.setItem('sb-zvyargbnvccdqgmtytck-auth-token', JSON.stringify(s))
    }, session())
  }
  return state
}

/** Every payload pushed for one record (push_household_records), oldest first. */
export function pushedPayloads(state: { pushes: Record<string, unknown>[] }, entity: string, match: (id: string, payload: Record<string, unknown>) => boolean) {
  return state.pushes.flatMap((p) => (p.p_records as { entity: string; id: string; payload: Record<string, unknown> }[]))
    .filter((r) => r.entity === entity && match(r.id, r.payload)).map((r) => r.payload)
}

/** Collect CSP violations and page errors so tests can assert none happened. */
export function watchConsole(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    // Plaid's script sets inline styles on its iframe; the CSP refuses them and app.css sizes the frame instead.
    if (m.type() === 'error' && /Refused to apply inline style/.test(m.text())) return
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text())
  })
  page.on('pageerror', (e) => problems.push(e.message))
  return problems
}

/** After the password: with web 2-step on, type the emailed code; with it off (EMAIL_2FA_ENABLED=false) nothing to do. */
export async function finishSignIn(page: Page) {
  if (!EMAIL_2FA_ENABLED) return
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  await page.getByLabel('6-digit code').fill(EMAIL_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
}
