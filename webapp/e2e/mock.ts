import type { Page, Route } from '@playwright/test'

export const SUPABASE = 'https://zvyargbnvccdqgmtytck.supabase.co'
export const EMAIL = 'alex@example.com'
export const PASSWORD = 'correct horse battery'
export const GOOD_CODE = '123456'

type Row = Record<string, unknown>
type Factor = { id: string; friendly_name: string; factor_type: 'totp'; status: 'verified' | 'unverified'; created_at: string; updated_at: string }

function b64url(o: object) {
  return Buffer.from(JSON.stringify(o)).toString('base64url')
}

const today = new Date()
const iso = (daysAgo: number) => new Date(today.getTime() - daysAgo * 86400000).toISOString().slice(0, 10)

export function fixtures() {
  const accounts: Row[] = [
    { id: 'acc-1', plaid_account_id: 'p-1', name: 'Plaid Checking', nickname: 'Joint checking', mask: '0000', type: 'depository', subtype: 'checking', current_balance: 8420.17, available_balance: 8120.17, iso_currency_code: 'USD', institution_name: 'Chase', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-2', plaid_account_id: 'p-2', name: 'Plaid Saving', nickname: null, mask: '1111', type: 'depository', subtype: 'savings', current_balance: 25000, available_balance: 25000, iso_currency_code: 'USD', institution_name: 'Chase', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-3', plaid_account_id: 'p-3', name: 'Sapphire Preferred', nickname: 'Travel card', mask: '3333', type: 'credit', subtype: 'credit card', current_balance: 1875.42, iso_currency_code: 'USD', institution_name: 'Chase', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-4', plaid_account_id: 'p-4', name: 'Brokerage', nickname: null, mask: '4444', type: 'investment', subtype: 'brokerage', current_balance: 512640.55, iso_currency_code: 'USD', institution_name: 'Fidelity', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-5', plaid_account_id: 'p-5', name: 'Home Mortgage', nickname: null, mask: '5555', type: 'loan', subtype: 'mortgage', current_balance: 412300, iso_currency_code: 'USD', institution_name: 'Rocket Mortgage', created_at: '2026-01-02T00:00:00Z' },
    { id: 'acc-6', plaid_account_id: 'p-6', name: 'Everyday Business Checking', nickname: 'Studio', mask: '6666', type: 'depository', subtype: 'checking', current_balance: 12800, iso_currency_code: 'USD', institution_name: 'Wells Fargo', created_at: '2026-01-02T00:00:00Z', is_business: true },
  ].map((a) => ({ is_business: false, ...a }))
  const merchants: [string, number, string, string, boolean?][] = [
    ['Whole Foods Market', 84.2, 'Groceries', 'acc-1'],
    ['Adobe', 59.99, 'Subscriptions', 'acc-3', true],
    ['Payroll – Acme Corp', -4200, 'Income', 'acc-1'],
    ['Blue Bottle Coffee', 6.5, 'Dining', 'acc-3'],
    ['PG&E', 142.88, 'Bills & Utilities', 'acc-1'],
    ['Delta Air Lines', 412.3, 'Travel', 'acc-3', true],
    ['Shell', 58.12, 'Gas & Transport', 'acc-3'],
    ['Trader Joe’s', 63.45, 'Groceries', 'acc-1'],
    ['Netflix', 15.49, 'Subscriptions', 'acc-3'],
    ['Interest', -21.7, 'Income', 'acc-2'],
    ['Home Depot', 231.04, 'Home', 'acc-3'],
    ['Staples', 48.9, 'Business Expenses', 'acc-3', true],
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
    plaid_items: [
      { id: 'item-row-1', plaid_item_id: 'item-chase', institution_name: 'Chase', status: 'good', error_code: null, last_synced_at: new Date(Date.now() - 3600_000).toISOString() },
      { id: 'item-row-2', plaid_item_id: 'item-wf', institution_name: 'Wells Fargo', status: 'login_required', error_code: 'ITEM_LOGIN_REQUIRED', error_message: 'Sign in to Wells Fargo again', last_synced_at: new Date(Date.now() - 4 * 86400_000).toISOString() },
    ],
  }
}

export interface MockOptions {
  /** plaid-link-token answers mode:'update' for reconnects (the server change is deployed). */
  updateMode?: boolean
  /** plaid-report-issue Edge Function is deployed. */
  reportFunction?: boolean
  /** 'verified' = user already has an authenticator; 'none' = must enroll. */
  mfa?: 'verified' | 'none'
  backup?: boolean
  signedIn?: boolean
}

export async function mockBackend(page: Page, opts: MockOptions = {}) {
  const state = {
    ...fixtures(),
    factors: [] as Factor[],
    aal: 'aal1' as 'aal1' | 'aal2',
    calls: [] as { path: string; method: string; body: unknown }[],
    linkTokenBody: null as unknown,
    extra: extraTables() as Record<string, Row[]>,
    reportBody: null as unknown,
    exchangeBody: null as unknown,
  }
  const now = new Date().toISOString()
  if ((opts.mfa ?? 'verified') === 'verified') {
    state.factors.push({ id: 'f-primary', friendly_name: 'Davey authenticator', factor_type: 'totp', status: 'verified', created_at: now, updated_at: now })
    if (opts.backup ?? true) state.factors.push({ id: 'f-backup', friendly_name: 'Davey backup', factor_type: 'totp', status: 'verified', created_at: now, updated_at: now })
  }

  const user = () => ({
    id: 'user-1', aud: 'authenticated', role: 'authenticated', email: EMAIL, email_confirmed_at: now,
    app_metadata: { provider: 'email' }, user_metadata: {}, created_at: now, updated_at: now,
    factors: state.factors,
  })
  const session = () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    const amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) }, ...(state.aal === 'aal2' ? [{ method: 'totp', timestamp: Math.floor(Date.now() / 1000) }] : [])]
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

    // ---- Auth ----
    if (path === '/auth/v1/token') {
      if (url.searchParams.get('grant_type') === 'password') {
        if (body.email !== EMAIL || body.password !== PASSWORD) return json(route, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400)
        state.aal = 'aal1'
        return json(route, session())
      }
      return json(route, session())
    }
    if (path === '/auth/v1/user' && method === 'GET') return json(route, user())
    if (path === '/auth/v1/user' && method === 'PUT') return json(route, user())
    if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } })
    if (path === '/auth/v1/recover') return json(route, {})
    if (path === '/auth/v1/verify') {
      if (body.token_hash !== 'good-hash') return json(route, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' }, 403)
      state.aal = 'aal1'
      return json(route, session())
    }
    if (path === '/auth/v1/factors' && method === 'POST') {
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
      if (body.mode === 'update' && !opts.updateMode) return json(route, { link_token: 'link-production-web-123', expiration: now })
      return json(route, { link_token: 'link-production-web-123', expiration: now, ...(body.mode === 'update' ? { mode: 'update' } : {}) })
    }
    if (path === '/functions/v1/plaid-report-issue') {
      if (!opts.reportFunction) return json(route, { message: 'Function not found' }, 404)
      state.reportBody = body
      return json(route, { ok: true })
    }
    if (path === '/functions/v1/plaid-exchange') {
      state.exchangeBody = body
      state.accounts.push({ id: 'acc-new', plaid_account_id: 'p-new-1', name: 'Platypus Checking', nickname: null, mask: '4321', type: 'depository', subtype: 'checking', current_balance: 1500, iso_currency_code: 'USD', institution_name: 'First Platypus Bank', created_at: new Date().toISOString() })
      return json(route, { item_id: 'item-new' })
    }
    if (path === '/functions/v1/plaid-sync') return json(route, { added: 0 })

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
        return {
          open: function () { setTimeout(function () { opts.onSuccess('public-production-abc', {
            institution: { institution_id: 'ins_109508', name: 'First Platypus Bank' },
            accounts: [{ id: 'p-new-1', name: 'Plaid Checking', mask: '4321', type: 'depository', subtype: 'checking' }],
            link_session_id: 'ls-1' }); }, 50); },
          exit: function () {}, destroy: function () {}
        };
      } };`,
    }),
  )

  if (opts.signedIn) {
    state.aal = 'aal2'
    await page.addInitScript((s) => {
      localStorage.setItem('sb-zvyargbnvccdqgmtytck-auth-token', JSON.stringify(s))
    }, session())
  }
  return state
}

/** Collect CSP violations and page errors so tests can assert none happened. */
export function watchConsole(page: Page) {
  const problems: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text())
  })
  page.on('pageerror', (e) => problems.push(e.message))
  return problems
}
