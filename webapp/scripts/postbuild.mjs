// GitHub Pages has no rewrites. Each SPA route gets its own copy of index.html (served at /app/<route> with a 200,
// so the Plaid OAuth redirect lands on a real page). Any other /app/* path falls back via the root 404.html.
import { copyFileSync, existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const out = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app')
export const ROUTES = [
  'oauth', 'transactions', 'connect', 'settings', 'profile', 'login', 'signup', 'access', 'forgot', 'reset', 'security', 'accounts', 'help', 'more',
  'budget', 'cash-flow', 'recurring', 'credit-cards', 'loans', 'investments', 'household', 'exports', 'tax',
]

const index = join(out, 'index.html')
if (!existsSync(index)) throw new Error('Build output missing: ' + index)
for (const route of ROUTES) copyFileSync(index, join(out, route + '.html'))

const html = readFileSync(index, 'utf8')
if (!html.includes('Content-Security-Policy')) throw new Error('CSP meta missing from build')
if (/<script(?![^>]*\bsrc=)[^>]*>/.test(html)) throw new Error('Inline script found: CSP would block it')
const assets = readdirSync(join(out, 'assets'))
if (!assets.some((f) => f.endsWith('.js'))) throw new Error('No JS bundle in build')
for (const f of ['sw.js', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) {
  if (!existsSync(join(out, f))) throw new Error('PWA file missing: ' + f)
}
console.log(`postbuild: ${ROUTES.length} route pages, ${assets.length} assets in ${out}`)
