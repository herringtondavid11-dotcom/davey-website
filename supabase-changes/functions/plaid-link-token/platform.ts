// Pure helpers (no Deno APIs) so they can be unit-tested from the web app's Vitest suite.

export type Platform = 'ios' | 'web'

/** The only redirect URI the web app may use. Must be registered in the Plaid Dashboard. */
export const WEB_REDIRECT_URI = 'https://daveypersonalfinance.com/app/oauth'
/** The iOS universal link (herringtondavid11-dotcom.github.io, see that repo's README). Override with PLAID_IOS_REDIRECT_URI. */
export const DEFAULT_IOS_REDIRECT_URI = 'https://herringtondavid11-dotcom.github.io/plaid/oauth'

export function parsePlatform(body: unknown): Platform {
  const p = (body as { platform?: unknown } | null)?.platform
  return typeof p === 'string' && p.toLowerCase() === 'web' ? 'web' : 'ios'
}

export interface LinkTokenOptions {
  platform: Platform
  userId: string
  clientName?: string
  products?: string[]
  countryCodes?: string[]
  webhook?: string
  iosRedirectUri?: string
  /** Update mode: an existing Item's access token (re-authentication). */
  accessToken?: string
}

/**
 * The /link/token/create body (without client_id/secret). Web always uses WEB_REDIRECT_URI and never sends
 * iOS-only fields; a redirect_uri supplied by the client is ignored, so a caller can't point OAuth elsewhere.
 */
export function linkTokenRequest(o: LinkTokenOptions): Record<string, unknown> {
  const req: Record<string, unknown> = {
    client_name: o.clientName ?? 'Davey',
    language: 'en',
    country_codes: o.countryCodes ?? ['US'],
    user: { client_user_id: o.userId },
    redirect_uri: o.platform === 'web' ? WEB_REDIRECT_URI : (o.iosRedirectUri ?? DEFAULT_IOS_REDIRECT_URI),
  }
  if (o.accessToken) req.access_token = o.accessToken
  else req.products = o.products ?? ['transactions']
  if (o.webhook) req.webhook = o.webhook
  return req
}
