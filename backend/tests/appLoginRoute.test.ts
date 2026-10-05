import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appLoginRoute } from '../appLoginRoute'
import { loginCookieName } from '../appLogin'

// AIDEV-NOTE: HTTP boundary tests deliberately use a port without provider or database access.
function setup() {
  let calls = 0
  const service = {
    async begin() { calls++; return { authorizationUrl: 'https://identity.example/authorize', expiresAt: 123,
      nonceCookie: `${loginCookieName}=nonce-secret; Secure; HttpOnly; SameSite=Strict; Path=/` } },
    async complete(callback: string, nonce: string) {
      calls++; assert.equal(callback, 'https://backend.test/login/callback?code=secret')
      assert.equal(nonce, 'nonce-secret')
      return { accountId: 'account', expiresAt: 456, sessionCookie: '__Host-elevateo_session=session-secret; Secure; HttpOnly; SameSite=Strict; Path=/',
        clearNonceCookie: `${loginCookieName}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` }
    },
  }
  return { service, calls: () => calls }
}
function request(path: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return new Request(`https://backend.test${path}`, { method: 'POST',
    headers: { origin: 'https://backend.test', 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) })
}
test('login endpoints fail closed when disabled and ignore unrelated routes', async () => {
  assert.equal(await appLoginRoute(request('/other')), null)
  await assert.rejects(appLoginRoute(request('/v1/login/begin')), { code: 'login_disabled', status: 503 })
})
test('begin exposes authorization metadata but keeps nonce exclusively in cookie', async () => {
  const f = setup(); const response = (await appLoginRoute(request('/v1/login/begin'), f.service))!
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.match(response.headers.get('set-cookie')!, /nonce-secret/u)
  assert.deepEqual(await response.json(), { authorizationUrl: 'https://identity.example/authorize', expiresAt: 123 })
})
test('complete places session and cleared nonce in headers, never JSON', async () => {
  const f = setup(); const response = (await appLoginRoute(request('/v1/login/complete', {
    callbackUrl: 'https://backend.test/login/callback?code=secret',
  }, { cookie: `${loginCookieName}=nonce-secret` }), f.service))!
  assert.match(response.headers.get('set-cookie')!, /session-secret/u)
  assert.match(response.headers.get('set-cookie')!, /Max-Age=0/u)
  assert.deepEqual(await response.json(), { signedIn: true, accountId: 'account', expiresAt: 456 })
})
test('wrong origin, duplicate nonce and invalid bodies never reach login port', async () => {
  const f = setup()
  await assert.rejects(appLoginRoute(request('/v1/login/begin', {}, { origin: 'https://foreign.test' }), f.service), { code: 'csrf_failed' })
  await assert.rejects(appLoginRoute(request('/v1/login/begin', { extra: true }), f.service))
  for (const cookie of ['', `${loginCookieName}=a; ${loginCookieName}=b`]) {
    await assert.rejects(appLoginRoute(request('/v1/login/complete', {
      callbackUrl: 'https://backend.test/login/callback?code=secret',
    }, { cookie }), f.service), { code: 'login_state_invalid' })
  }
  assert.equal(f.calls(), 0)
})
test('callback serves isolated same-origin handoff without reflecting query secrets', async () => {
  const f = setup(); const response = (await appLoginRoute(new Request(
    'https://backend.test/login/callback?code=private-code&state=private-state'), f.service))!
  const html = await response.text()
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.match(response.headers.get('content-security-policy')!, /default-src 'none'.*frame-ancestors 'none'/u)
  assert.match(html, /history.replaceState/u)
  assert.match(html, /fetch\('\/v1\/login\/complete'/u)
  assert.doesNotMatch(html, /private-code|private-state/u)
  assert.equal(f.calls(), 0)
})
