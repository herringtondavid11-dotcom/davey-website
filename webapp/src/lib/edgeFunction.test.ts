import { describe, expect, it } from 'vitest'
import { DEFAULT_IOS_REDIRECT_URI, WEB_REDIRECT_URI, linkTokenRequest, parsePlatform } from '../../../supabase-changes/functions/plaid-link-token/platform'
import { PLAID_REDIRECT_URI } from '../config'

describe('plaid-link-token platform handling', () => {
  it('detects web, defaults to iOS', () => {
    expect(parsePlatform({ platform: 'web' })).toBe('web')
    expect(parsePlatform({ platform: 'WEB' })).toBe('web')
    expect(parsePlatform({})).toBe('ios')
    expect(parsePlatform(null)).toBe('ios')
  })
  it('web uses the web redirect URI, matching the app config', () => {
    expect(WEB_REDIRECT_URI).toBe(PLAID_REDIRECT_URI)
    const req = linkTokenRequest({ platform: 'web', userId: 'u1' })
    expect(req).toEqual({
      client_name: 'Davey',
      language: 'en',
      country_codes: ['US'],
      user: { client_user_id: 'u1' },
      redirect_uri: 'https://daveypersonalfinance.com/app/oauth',
      products: ['transactions'],
    })
  })
  it('iOS keeps the universal link and any override', () => {
    expect(linkTokenRequest({ platform: 'ios', userId: 'u1' }).redirect_uri).toBe(DEFAULT_IOS_REDIRECT_URI)
    expect(linkTokenRequest({ platform: 'ios', userId: 'u1', iosRedirectUri: 'https://x/y' }).redirect_uri).toBe('https://x/y')
  })
  it('update mode sends access_token instead of products', () => {
    const req = linkTokenRequest({ platform: 'web', userId: 'u1', accessToken: 'access-1', webhook: 'https://hook' })
    expect(req.access_token).toBe('access-1')
    expect(req.products).toBeUndefined()
    expect(req.webhook).toBe('https://hook')
  })
})
