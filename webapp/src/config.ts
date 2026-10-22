// Public configuration. The publishable (anon) key is public by design: row-level security protects the data.
// It is the same key the marketing site's invite pages use (assets/js/config.js). Override with VITE_* env vars.
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || 'https://zvyargbnvccdqgmtytck.supabase.co'
export const SUPABASE_ANON_KEY: string =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_cJpaZife9jClSJVtv3tHtw_xganiB7L'

export const SITE_ORIGIN = 'https://daveypersonalfinance.com'
export const APP_BASE = '/app'
/** Must also be registered in the Plaid Dashboard (Team Settings › API › Allowed redirect URIs). */
export const PLAID_REDIRECT_URI = `${SITE_ORIGIN}${APP_BASE}/oauth`
export const PLAID_SCRIPT_URL = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'

export const IDLE_TIMEOUT_MS = 30 * 60 * 1000
export const IDLE_WARNING_MS = 2 * 60 * 1000

/** Plaid convention: positive amount = money leaving the account. Flip if the app stores the opposite. */
export const AMOUNT_POSITIVE_IS_OUTFLOW = true
