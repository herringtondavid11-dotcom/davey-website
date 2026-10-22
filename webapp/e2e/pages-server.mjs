// Mimics GitHub Pages for the repo root: /foo serves foo.html or foo/index.html, unknown paths get 404.html (404).
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

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
      res.writeHead(200, { 'Content-Type': types[extname(candidate)] ?? 'application/octet-stream' })
      return res.end(await readFile(candidate))
    }
  }
  res.writeHead(404, { 'Content-Type': types['.html'] })
  res.end(await readFile(join(root, '404.html')))
}).listen(port, () => console.log(`pages server on http://localhost:${port}`))
