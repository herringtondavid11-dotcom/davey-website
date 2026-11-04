/**
 * Chase (and any other institution Link opens with a popup) was stuck on about:blank on
 * iOS Safari and iOS Chrome. Link's mobile path waits 800ms, then calls window.open from
 * its iframe. iOS only navigates that window when window.open runs in the same turn as
 * the tap; after the timer the tab stays about:blank, Link shows "Almost done", and
 * Continue ends as ITEM_LOGIN_REQUIRED / requires_oauth. No oauth_state_id ever arrives.
 *
 * On top of that, Link adds noopener to the popup features on current iOS when it thinks
 * it is inside an iframe, and WebKit then drops the bank URL.
 *
 * Rewriting the iframe URL makes Link take the immediate open (isMobile=false) and skip
 * the iframe noopener workaround (isWebview=true). The iframe, onSuccess, and /app/oauth
 * resume stay as they are, so institutions that don't use a popup are unchanged.
 */
export function isIosBrowser(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua)
}

export function linkIframeSrcForIos(src: string): string {
  if (!src.includes('plaid.com') || !src.includes('isMobile=true')) return src
  let next = src.replace('isMobile=true', 'isMobile=false')
  if (!next.includes('isWebview=')) next += `${next.includes('?') ? '&' : '?'}isWebview=true`
  return next
}

let installed = false

function iframeSrcDescriptor(): PropertyDescriptor | undefined {
  let proto: object | null = HTMLIFrameElement.prototype
  while (proto) {
    const desc = Object.getOwnPropertyDescriptor(proto, 'src')
    if (desc?.get && desc.set) return desc
    proto = Object.getPrototypeOf(proto)
  }
  return undefined
}

/** Installed once, before link-initialize.js creates its iframe. No-op off iOS. */
export function installIosLinkOAuthFix(ua: string = navigator.userAgent): void {
  if (installed || typeof HTMLIFrameElement === 'undefined' || !isIosBrowser(ua)) return
  installed = true
  const desc = iframeSrcDescriptor()
  if (desc?.get && desc.set) {
    Object.defineProperty(HTMLIFrameElement.prototype, 'src', {
      configurable: true,
      enumerable: desc.enumerable ?? true,
      get() {
        return desc.get!.call(this)
      },
      set(value: string) {
        const id = (this as HTMLIFrameElement).id ?? ''
        const next = id.startsWith('plaid-link-iframe') ? linkIframeSrcForIos(String(value)) : String(value)
        desc.set!.call(this, next)
      },
    })
  }
  const append = Element.prototype.appendChild
  Element.prototype.appendChild = function <T extends Node>(node: T): T {
    if (node instanceof HTMLIFrameElement && node.id.startsWith('plaid-link-iframe')) {
      const next = linkIframeSrcForIos(node.src)
      if (next !== node.src) node.src = next
    }
    return append.call(this, node) as T
  }
}
