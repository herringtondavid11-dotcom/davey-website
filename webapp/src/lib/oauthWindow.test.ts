import { describe, expect, it } from 'vitest'
import { installIosLinkOAuthFix, isIosBrowser, linkIframeSrcForIos } from './oauthWindow'

const TOKEN_URL =
  'https://cdn.plaid.com/link/v2/stable/link.html?token=link-production-abc&isMobile=true&isLinkWebSdk=true&origin=https%3A%2F%2Fdaveypersonalfinance.com'

describe('iOS Chase OAuth window', () => {
  it('recognizes iPhone Safari and Chrome, not desktop or Android', () => {
    expect(isIosBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(isIosBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(isIosBrowser('Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')).toBe(true)
    expect(isIosBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 5) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36')).toBe(false)
    expect(isIosBrowser('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36')).toBe(false)
  })

  it('makes Link open the bank immediately and without the iframe noopener workaround', () => {
    const next = linkIframeSrcForIos(TOKEN_URL)
    const url = new URL(next)
    expect(url.searchParams.get('isMobile')).toBe('false')
    expect(url.searchParams.get('isWebview')).toBe('true')
    expect(url.searchParams.get('token')).toBe('link-production-abc')
    expect(url.searchParams.get('isLinkWebSdk')).toBe('true')
    expect(url.searchParams.get('origin')).toBe('https://daveypersonalfinance.com')
  })

  it('leaves desktop Link and other iframes alone, and does not rewrite twice', () => {
    const desktop = TOKEN_URL.replace('isMobile=true', 'isMobile=false')
    expect(linkIframeSrcForIos(desktop)).toBe(desktop)
    expect(linkIframeSrcForIos('https://example.com/?isMobile=true')).toBe('https://example.com/?isMobile=true')
    const once = linkIframeSrcForIos(TOKEN_URL)
    expect(linkIframeSrcForIos(once)).toBe(once)
    expect(once.match(/isWebview=true/g)).toEqual(['isWebview=true'])
  })

  it('rewrites the Link iframe when it is created on an iPhone', () => {
    installIosLinkOAuthFix('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1')
    const frame = document.createElement('iframe')
    frame.id = 'plaid-link-iframe-1'
    frame.src = TOKEN_URL
    document.body.appendChild(frame)
    expect(new URL(frame.src).searchParams.get('isMobile')).toBe('false')
    expect(new URL(frame.src).searchParams.get('isWebview')).toBe('true')
    expect(new URL(frame.src).searchParams.get('token')).toBe('link-production-abc')
    frame.remove()
  })
})
