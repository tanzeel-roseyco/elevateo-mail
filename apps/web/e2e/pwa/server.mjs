import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { resolve, extname } from 'node:path'

// AIDEV-NOTE: Test-only server serves production bytes; no real account, mail or credentials are used.
let version = 1
const root = resolve('dist')
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' }
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1:4180')
  res.setHeader('Cache-Control', 'no-store')
  if (url.pathname === '/__test/version' && req.method === 'POST') {
    version += 1
    res.end(String(version)); return
  }
  if (url.pathname.startsWith('/v1/') || url.pathname.startsWith('/v2/')) {
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/v1/auth/sso/status') {
      res.end(JSON.stringify({ enabled: false, provider: null, password_login_enabled: true })); return
    }
    res.statusCode = 401
    res.end(JSON.stringify({ code: 'unauthenticated', message: 'Sign in to continue.', request_id: 'pwa-test-request' })); return
  }
  const path = resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname))
  if (!path.startsWith(root + '/')) { res.statusCode = 404; res.end(); return }
  try {
    let content = await readFile(path)
    if (url.pathname === '/sw.js') content = Buffer.from(content.toString().replace("const CACHE = 'elevateo-shell-'", `const CACHE = 'elevateo-shell-test${version}-'`))
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream')
    res.end(content)
  } catch { res.statusCode = 404; res.end('Not found') }
}).listen(4180, '0.0.0.0')
