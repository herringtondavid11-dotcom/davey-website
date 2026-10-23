// Davey web service worker: makes /app installable and opens offline to the last app shell.
// Only same-origin GET requests under /app/ are cached. Supabase, Plaid and every other origin are never
// touched, so no account data is ever stored by the service worker.
// v2: a new deploy takes over immediately, and a working network never serves a stale shell.
const VERSION = 'davey-app-v2'
const SHELL = '/app/'

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch(SHELL, { cache: 'reload' })
      .then(async (res) => {
        if (!res.ok) return
        const cache = await caches.open(VERSION)
        await cache.put(SHELL, res)
      })
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin || !url.pathname.startsWith('/app/')) return

  // Pages: network first, bypassing the HTTP cache, so an old shell is only used when the network fails.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'reload' })
        .then((res) => {
          if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
            const copy = res.clone()
            caches.open(VERSION).then((c) => c.put(SHELL, copy))
          }
          return res
        })
        .catch(() => caches.match(SHELL)),
    )
    return
  }

  // Hashed build assets and icons: cache first (file names change on every build).
  if (url.pathname.startsWith('/app/assets/') || /\.(png|woff2?|webmanifest)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(VERSION).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
  }
})
