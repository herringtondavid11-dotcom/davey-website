// Service-worker registration and the install prompt.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()

export function registerPwa() {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
  // A new worker calls skipWaiting and clients.claim. Reload once so an open tab drops the old shell
  // (the one that still asked for an emailed code) instead of waiting for every tab to close.
  let hadController = !!navigator.serviceWorker.controller
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true
      return
    }
    window.location.reload()
  })
  const update = () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`, { scope: import.meta.env.BASE_URL })
      .then((reg) => reg.update())
      .catch(() => undefined)
  }
  window.addEventListener('load', update)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') update()
  })
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export function canPromptInstall() {
  return deferred !== null
}

export function onInstallChange(cb: () => void) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  listeners.forEach((l) => l())
  return outcome === 'accepted'
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true
}

export function isIosSafari() {
  const ua = navigator.userAgent
  return /iPhone|iPad|iPod/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
}
