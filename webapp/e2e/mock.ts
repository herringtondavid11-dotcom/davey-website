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


/** Plaid category codes as the app receives them (the web maps them with the app's mapper). */
const PFC: Record<string, [string, string]> = {
  groceries: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_GROCERIES'],
  coffee: ['FOOD_AND_DRINK', 'FOOD_AND_DRINK_COFFEE'],
  payroll: ['INCOME', 'INCOME_WAGES'],
  interest: ['INCOME', 'INCOME_INTEREST_EARNED'],
  income: ['INCOME', 'INCOME_OTHER_INCOME'],
  software: ['GENERAL_SERVICES', 'GENERAL_SERVICES_OTHER_GENERAL_SERVICES'],
  power: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_GAS_AND_ELECTRICITY'],
  rent: ['RENT_AND_UTILITIES', 'RENT_AND_UTILITIES_RENT'],
  flights: ['TRAVEL', 'TRAVEL_FLIGHTS'],
  gas: ['TRANSPORTATION', 'TRANSPORTATION_GAS'],
  streaming: ['ENTERTAINMENT', 'ENTERTAINMENT_TV_AND_MOVIES'],
  music: ['ENTERTAINMENT', 'ENTERTAINMENT_MUSIC_AND_AUDIO'],
  gym: ['PERSONAL_CARE', 'PERSONAL_CARE_GYMS_AND_FITNESS_CENTERS'],
  hardware: ['HOME_IMPROVEMENT', 'HOME_IMPROVEMENT_HARDWARE'],
  office: ['GENERAL_MERCHANDISE', 'GENERAL_MERCHANDISE_OFFICE_SUPPLIES'],
  transfer: ['TRANSFER_OUT', 'TRANSFER_OUT_ACCOUNT_TRANSFER'],
}

export interface FixtureItem {
  item_id: string
  institution_name: string
  status: string
  /** plaid-sync fails for this Item (login required). */
  failing?: boolean
  accounts: Row[]
}

/** App-format accounts (cents) per Item, as plaid-sync and plaid-exchange return them. */
export function fixtureItems(): FixtureItem[] {
  const acct = (id: string, name: string, mask: string, type: string, subtype: string, cents: number, extra: Row = {}) => ({
    account_id: id, name, official_name: null, mask, type, subtype, current_balance_cents: cents, available_balance_cents: extra.available ?? null,
    limit_cents: null, iso_currency_code: 'USD', liabilities_status: null, ...extra,
  })
  return [
    { item_id: 'item-chase', institution_name: 'Chase', status: 'ok', accounts: [
      acct('p-1', 'Plaid Checking', '0000', 'depository', 'checking', 842017, { available_balance_cents: 812017 }),
      acct('p-2', 'Plaid Saving', '1111', 'depository', 'savings', 2500000),
      acct('p-3', 'Sapphire Preferred', '3333', 'credit', 'credit card', 187542, { limit_cents: 1500000, liability_kind: 'credit', apr_basis_points: 2149, next_payment_amount_cents: 4000, next_payment_due_date: iso(-9) }),
    ] },
    { item_id: 'item-amex', institution_name: 'American Express', status: 'ok', accounts: [
      acct('p-7', 'Blue Cash Everyday', '7777', 'credit', 'credit card', 340000, { limit_cents: 600000, liability_kind: 'credit', apr_basis_points: 2724, next_payment_amount_cents: 8500 }),
    ] },
    { item_id: 'item-fidelity', institution_name: 'Fidelity', status: 'ok', accounts: [acct('p-4', 'Brokerage', '4444', 'investment', 'brokerage', 51264055)] },
    { item_id: 'item-rocket', institution_name: 'Rocket Mortgage', status: 'ok', accounts: [
      acct('p-5', 'Home Mortgage', '5555', 'loan', 'mortgage', 41230000, { liability_kind: 'mortgage', apr_basis_points: 625, origination_principal_cents: 45000000, origination_date: '2021-06-01', loan_term_months: 360, next_payment_amount_cents: 277073 }),
    ] },
    { item_id: 'item-capone', institution_name: 'Capital One', status: 'ok', accounts: [
      acct('p-8', 'Auto Loan', '8888', 'loan', 'auto', 1825000, { apr_basis_points: 590, origination_principal_cents: 3200000, origination_date: '2023-03-01', loan_term_months: 60, next_payment_amount_cents: 61720 }),
    ] },
    { item_id: 'item-boa', institution_name: 'Bank of America', status: 'ok', accounts: [acct('p-6', 'Business Advantage Checking', '6666', 'depository', 'checking', 1280000)] },
    { item_id: 'item-wf', institution_name: 'Wells Fargo', status: 'login_required', failing: true, accounts: [] },
  ]
}

/** App-format transactions: amount_cents negative = money out. */
export function fixtureTransactions(): Row[] {
  const rows: Row[] = []
  const add = (id: string, account: string, date: string, name: string, dollarsOut: number, pfc: keyof typeof PFC, pending = false) =>
    rows.push({ transaction_id: id, account_id: account, amount_cents: -Math.round(dollarsOut * 100), iso_currency_code: 'USD', date, name, pending,
      pending_transaction_id: null, category_primary: PFC[pfc][0], category_detailed: PFC[pfc][1] })
  const recent: [string, number, keyof typeof PFC, string][] = [
    ['Whole Foods Market', 84.2, 'groceries', 'p-1'],
    ['Adobe', 59.99, 'software', 'p-3'],
    ['Payroll – Acme Corp', -4200, 'payroll', 'p-1'],
    ['Blue Bottle Coffee', 6.5, 'coffee', 'p-3'],
    ['PG&E', 142.88, 'power', 'p-1'],
    ['Delta Air Lines', 412.3, 'flights', 'p-3'],
    ['Shell', 58.12, 'gas', 'p-3'],
    ['Trader Joe’s', 63.45, 'groceries', 'p-1'],
    ['Netflix', 15.49, 'streaming', 'p-3'],
    ['Interest', -21.7, 'interest', 'p-2'],
    ['Home Depot', 231.04, 'hardware', 'p-7'],
    ['Staples', 48.9, 'office', 'p-6'],
    ['Canva', 12.99, 'software', 'p-7'],
  ]
  recent.forEach(([m, amt, pfc, acct], i) => add(`txn-${i + 1}`, acct, iso(Math.floor(i / 2)), m, amt, pfc, i === 1))
  const history: [string, number, keyof typeof PFC, string, number][] = [
    ['Payroll – Acme Corp', -4200, 'payroll', 'p-1', 1],
    ['Greystar Rent', 2400, 'rent', 'p-1', 3],
    ['Netflix', 15.49, 'streaming', 'p-3', 9],
    ['Spotify', 11.99, 'music', 'p-3', 14],
    ['Equinox', 49, 'gym', 'p-3', 20],
    ['Safeway', 180, 'groceries', 'p-1', 12],
    ['Adobe', 59.99, 'software', 'p-6', 18],
    ['Stripe Payout', -3500, 'income', 'p-6', 25],
  ]
  const now = new Date()
  for (let back = 1; back <= 6; back++) {
    history.forEach(([m, amt, pfc, acct, day], j) => {
      const d = new Date(now.getFullYear(), now.getMonth() - back, day)
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      add(`txn-h${back}-${j}`, acct, date, m, amt + (pfc === 'groceries' ? back * 7 : 0), pfc)
    })
  }
  add('txn-xfer', 'p-1', iso(3), 'TRANSFER TO SAVINGS', 500, 'transfer')
  return rows
}

/** This browser's edits, as a user would have made them (nicknames, a Business account, categories, budgets). */
export function seededEdits() {
  return {
    accounts: { 'p-1': { nickname: 'Joint checking' }, 'p-3': { nickname: 'Travel card' }, 'p-8': { nickname: 'Car' }, 'p-6': { nickname: 'Studio', usage: 'business' } },
    transactions: {
      'txn-2': { category: 'Subscriptions', usage: 'business' },
      'txn-6': { category: 'Travel', usage: 'business' },
      'txn-1': { notes: 'Weekly shop' },
      'txn-13': { category: 'Subscriptions' },
    },
    budgets: [
      { id: 'b1', category: 'Groceries', amount: 600 },
      { id: 'b2', category: 'Dining Out', amount: 150 },
      { id: 'b3', category: 'Subscriptions', amount: 120 },
      { id: 'b4', category: 'Travel', amount: 300 },
    ],
  }
}

function household() {
  return {
    household_id: 'hh-1', role: 'owner', can_invite: true, email_enabled: true,
    members: [
      { user_id: 'user-1', role: 'owner', display_name: 'Alex', hide_ai_history: false, joined_at: '2026-01-02T00:00:00Z', is_you: true },
      { user_id: 'user-2', role: 'member', display_name: 'Jordan', hide_ai_history: false, joined_at: '2026-03-14T00:00:00Z', is_you: false },
    ],
    invite: null,
    invites: [] as Row[],
    member_access: { state: 'premium', until: null },
    profile: { first_name: 'Alex', last_name: 'Rivera', display_name: 'Alex', phone: '', email: EMAIL, needs_name: false },
  }
}

export interface MockOptions {
  /** 'verified' = user already has an authenticator; 'none' = must enroll. */
  mfa?: 'verified' | 'none'
  backup?: boolean
  signedIn?: boolean
  /** Seed this browser's edits (default true). */
  edits?: boolean
  /** Household functions are not web-enabled (no CORS → unreachable). */
  householdDown?: boolean
  /** Report to Plaid (link-support) is not web-enabled. */
  reportDown?: boolean
  /** ask-ai: 'answer' (default), 'limit', or 'down' (not web-enabled). */
  ai?: 'answer' | 'limit' | 'down'
  /** login-activity Edge Function is deployed. */
  activityFunction?: boolean
  /** plaid-link-token without update mode (older server): no mode in the reply. */
  noUpdateMode?: boolean
}


export async function mockBackend(page: Page, opts: MockOptions = {}) {
  const items = fixtureItems()
  const transactions = fixtureTransactions()
  const state = {
    items,
    transactions,
    factors: [] as Factor[],
    aal: 'aal1' as 'aal1' | 'aal2',
    calls: [] as { path: string; method: string; body: unknown }[],
    linkTokenBody: null as unknown,
    reportBody: null as unknown,
    inviteBody: null as unknown,
    aiBodies: [] as Record<string, unknown>[],
    exchangeBody: null as unknown,
    syncBodies: [] as Row[],
    household: household(),
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

    // ---- Edge Functions (the app's real contracts) ----
    const fail = (status: number, error: string, message: string) => json(route, { error, message }, status)
    if (path === '/functions/v1/plaid-item-status') {
      return json(route, { items: items.map((i) => ({ item_id: i.item_id, needs_sync: false, status: i.status, institution_name: i.institution_name, created_at: '2026-01-02T00:00:00Z' })) })
    }
    if (path === '/functions/v1/plaid-sync') {
      state.syncBodies.push(body)
      const item = items.find((i) => i.item_id === body.item_id)
      if (!item) return fail(404, 'item_not_found', 'That bank connection was not found.')
      if (item.failing) return fail(400, 'ITEM_LOGIN_REQUIRED', `Sign in to ${item.institution_name} again`)
      const ids = new Set(item.accounts.map((a) => a.account_id))
      const txns = transactions.filter((t) => ids.has(t.account_id))
      // Two pages, like Plaid's has_more.
      const half = Math.ceil(txns.length / 2)
      const first = body.cursor == null
      return json(route, { added: first ? txns.slice(0, half) : txns.slice(half), modified: [], removed: [], accounts: item.accounts, next_cursor: first ? `c-${item.item_id}` : `end-${item.item_id}`, has_more: first && txns.length > 1 })
    }
    if (path === '/functions/v1/plaid-link-token') {
      state.linkTokenBody = body
      return json(route, { link_token: 'link-production-web-123', expiration: now, hosted_link_url: null, preselected: false, ...(body.item_id && !opts.noUpdateMode ? { mode: 'update' } : {}) })
    }
    if (path === '/functions/v1/plaid-exchange') {
      state.exchangeBody = body
      const accounts = [{ account_id: 'p-new-1', name: 'Platypus Checking', official_name: null, mask: '4321', type: 'depository', subtype: 'checking', current_balance_cents: 150000, available_balance_cents: 150000, limit_cents: null, iso_currency_code: 'USD', liabilities_status: null }]
      items.push({ item_id: 'item-new', institution_name: 'First Platypus Bank', status: 'ok', accounts })
      return json(route, { item_id: 'item-new', institution_name: 'First Platypus Bank', institution_id: 'ins_109508', institution_logo: null, institution_color: null, accounts })
    }
    if (path === '/functions/v1/link-support') {
      if (opts.reportDown) return route.abort('failed')
      state.reportBody = body
      return json(route, { reported: true, id: 'rep-1' })
    }
    if (path.startsWith('/functions/v1/household-') || path === '/functions/v1/profile-update') {
      if (opts.householdDown) return route.abort('failed')
      const h = state.household
      if (path.endsWith('household-status')) return json(route, h)
      if (path.endsWith('household-invite')) {
        state.inviteBody = body
        if (body.action === 'create') {
          h.invites.push({ id: 'inv-1', status: 'pending', first_name: String(body.first_name), last_name: String(body.last_name ?? ''), email: (body.email as string) ?? null, relationship: String(body.relationship), expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() })
          return json(route, { invite: h.invites.at(-1), link: 'https://daveypersonalfinance.com/join?t=tok-new-123', sms_body: '', email: body.send_email ? 'sent' : 'skipped', email_enabled: true })
        }
        if (body.action === 'cancel') { h.invites = h.invites.filter((i) => i.id !== body.invite_id); return json(route, { cancelled: true }) }
        return json(route, { link: 'https://daveypersonalfinance.com/join?t=tok-again-456' })
      }
      if (path.endsWith('household-remove-member')) { h.members = h.members.filter((m) => m.is_you); return json(route, { removed: true }) }
      if (path.endsWith('household-leave')) return json(route, { left: true })
      if (path.endsWith('profile-update')) {
        state.inviteBody = body
        Object.assign(h.profile, { first_name: body.first_name, last_name: body.last_name, phone: body.phone ?? '' })
        return json(route, { profile: h.profile })
      }
    }
    if (path === '/functions/v1/ask-ai') {
      if (opts.ai === 'down') return route.abort('failed')
      state.aiBodies.push(body)
      if (opts.ai === 'limit') return fail(429, 'plan_limit', "You've used this month's 5 free Davey AI questions. Davey Premium includes 100 a month.")
      const sse = (events: Row[]) => route.fulfill({ status: 200, headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*' }, body: events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') })
      if (body.round === 0) {
        return sse([
          { type: 'meta', model: 'claude-sonnet-5-5', round: 0 },
          { type: 'progress', tool: 'recurring_charges', label: 'Finding repeating charges' },
          { type: 'tool_calls', content: [{ type: 'tool_use', id: 'tu_1', name: 'recurring_charges', input: {} }, { type: 'tool_use', id: 'tu_2', name: 'spending_by_category', input: { start: iso(30), end: iso(0), group_by: 'none' } }] },
          { type: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
        ])
      }
      return sse([
        { type: 'meta', model: 'claude-sonnet-5-5', round: 1 },
        { type: 'delta', text: 'You could cancel ' },
        { type: 'answer', envelope: { blocks: [
          { type: 'text', text: 'You could cancel **Spotify** and **Equinox**:\n- Spotify ($11.99)\n- Equinox ($49.00)\n\nThat saves about $61 a month.' },
          { type: 'metric_cards', cards: [{ label: 'Subscriptions / month', value: '$136.47' }, { label: 'Possible savings', value: '$60.99', tone: 'positive' }] },
          { type: 'table', table: { columns: ['Charge', 'Monthly'], rows: [['Spotify', '$11.99'], ['Equinox', '$49.00']] } },
          { type: 'actions', actions: [{ label: 'Open Recurring', deeplink: 'davey://recurring' }] },
        ], follow_ups: ['What else could I cut?', 'Show my biggest bills'] } },
        { type: 'done', usage: { input_tokens: 10, output_tokens: 5 } },
      ])
    }
    if (path === '/functions/v1/login-activity') {
      if (!opts.activityFunction) return route.abort('failed')
      return json(route, { events: [
        { created_at: new Date(Date.now() - 3600_000).toISOString(), action: 'login', ip_address: '73.15.2.10', user_agent: 'Davey/1.0 CFNetwork Darwin iPhone' },
        { created_at: new Date(Date.now() - 86400_000).toISOString(), action: 'user_updated_password', ip_address: '73.15.2.10' },
      ] })
    }
    if (path.startsWith('/rest/v1/')) return json(route, { code: 'PGRST205', message: 'The web app must not read tables directly' }, 404)

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

  if (opts.edits ?? true) {
    await page.addInitScript((e) => {
      if (!localStorage.getItem('davey.web-edits.seeded')) {
        localStorage.setItem('davey.web-edits.user-1', JSON.stringify(e))
        localStorage.setItem('davey.web-edits.seeded', '1')
      }
    }, seededEdits())
  }
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

/** This browser's saved web edits for the signed-in mock user. */
export async function webEdits(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('davey.web-edits.user-1') ?? '{}'))
}
