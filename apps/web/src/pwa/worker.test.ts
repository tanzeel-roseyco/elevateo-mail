// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createHash, webcrypto } from 'node:crypto'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'

// AIDEV-NOTE: Execute the shipped worker template against hostile network responses, not a parallel implementation.
function worker(body = 'static', status = 200) {
  const hash = createHash('sha256').update('static').digest('hex')
  const entries = [{ url: '/assets/app-abc.js', hash }, { url: '/shell-abc.html', hash }]
  const handlers = new Map<string, (event: unknown) => void>()
  const cache = { put: vi.fn(), match: vi.fn(async () => new Response('static')) }
  const caches = { open: vi.fn(async () => cache), delete: vi.fn(), keys: vi.fn(async () => ['elevateo-shell-old', 'other-app', 'elevateo-shell-new']) }
  const fetch = vi.fn(async () => new Response(body, { status }))
  const source = readFileSync(new URL('../../scripts/pwa/worker.js', import.meta.url), 'utf8')
    .replace('__ENTRIES__', JSON.stringify(entries)).replace('__SHELL__', '"/shell-abc.html"').replace('__VERSION__', '"new"')
  runInNewContext(source, { self: { location: { origin: 'https://mail.test' }, addEventListener: (name: string, fn: (event: unknown) => void) => handlers.set(name, fn) }, caches, fetch, crypto: webcrypto, URL, Uint8Array })
  const install = () => new Promise<void>((resolve, reject) => handlers.get('install')!({ waitUntil: (promise: Promise<void>) => promise.then(resolve, reject) }))
  return { handlers, caches, cache, fetch, install }
}
it('precaches only integrity-verified static bytes without credentials', async () => {
  const w = worker()
  await w.install()
  expect(w.cache.put).toHaveBeenCalledTimes(2)
  expect(w.fetch).toHaveBeenCalledWith('/assets/app-abc.js', { credentials: 'omit', cache: 'no-store', redirect: 'error' })
})
it('rejects a successful login-page fallback and deletes the partial cache', async () => {
  const w = worker('<html>Private login fallback</html>')
  await expect(w.install()).rejects.toThrow('Static asset changed')
  expect(w.cache.put).not.toHaveBeenCalled()
  expect(w.caches.delete).toHaveBeenCalledWith('elevateo-shell-new')
})
it('rejects unavailable static artifacts', async () => {
  const w = worker('missing', 404)
  await expect(w.install()).rejects.toThrow('Static asset unavailable')
  expect(w.caches.delete).toHaveBeenCalledWith('elevateo-shell-new')
})
it.each(['/v1/session', '/api/mail', '/auth/complete', '/attachments/private', '/?token=secret', '/assets/app-abc.js?token=secret', 'https://other.test/assets/app-abc.js'])('bypasses private or unversioned requests: %s', (path) => {
  const w = worker()
  const respondWith = vi.fn()
  w.handlers.get('fetch')!({ request: { url: new URL(path, 'https://mail.test').href, method: 'GET', mode: 'navigate' }, respondWith })
  expect(respondWith).not.toHaveBeenCalled()
})
it('does not intercept writes or replay them', () => {
  const w = worker()
  const respondWith = vi.fn()
  w.handlers.get('fetch')!({ request: { url: 'https://mail.test/', method: 'POST' }, respondWith })
  expect(respondWith).not.toHaveBeenCalled()
  expect([...w.handlers.keys()]).toEqual(['install', 'activate', 'fetch'])
})
it('removes only obsolete app caches at activation', async () => {
  const w = worker()
  await new Promise<void>((resolve, reject) => w.handlers.get('activate')!({ waitUntil: (p: Promise<void>) => p.then(resolve, reject) }))
  expect(w.caches.delete).toHaveBeenCalledExactlyOnceWith('elevateo-shell-old')
})
