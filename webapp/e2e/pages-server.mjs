// Mimics GitHub Pages for the repo root: /foo serves foo.html or foo/index.html, unknown paths get 404.html (404).
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = fileURLToPath(new URL('../../', import.meta.url))
const port = Number(process.env.PORT || 4173)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.txt': 'text/plain' }

async function isFile(p) {
  try { return (await stat(p)).isFile() } catch { return false }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const path = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '')
  const base = join(root, path)
  for (const candidate of [base, base + '.html', join(base, 'index.html')]) {
    if (await isFile(candidate)) {
      let body = await readFile(candidate)
      // Local test server is plain http: WebKit (unlike Chromium) applies the CSP's upgrade-insecure-requests to
      // localhost and then fails every asset with a TLS error. Production is https and keeps the directive.
      if (extname(candidate) === '.html') body = Buffer.from(body.toString('utf8').replace(/;?\s*upgrade-insecure-requests/g, ''))
      // GitHub Pages gzips text responses; so does this server, so Lighthouse measures what production sends.
      const type = types[extname(candidate)] ?? 'application/octet-stream'
      const gzip = /text|javascript|json|svg/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')
      res.writeHead(200, { 'Content-Type': type, ...(gzip ? { 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' } : {}) })
      return res.end(gzip ? gzipSync(body) : body)
    }
  }
  res.writeHead(404, { 'Content-Type': types['.html'] })
  res.end(await readFile(join(root, '404.html')))
}).listen(port, () => console.log(`pages server on http://localhost:${port}`))
