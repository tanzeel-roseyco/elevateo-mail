import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now, request, token } from './fixture'
import { handleRequest } from '../worker'
import { sessionCookieName } from '../core'

async function code(response: Response, status: number, expected: string) {
  assert.equal(response.status, status)
  assert.equal((await response.json() as { error: { code: string } }).error.code, expected)
}
const base = '/v1/resend/connections'
// AIDEV-NOTE: Incident-time removal must work even when the encryption key is unavailable or misconfigured.
for (const enabled of ['false', 'true']) test(`Resend ${enabled} configuration preserves metadata and revocation`, async () => {
  const f = await fixture()
  try {
    const env = { ...f.env, RESEND_CONNECTIONS_ENABLED: enabled }
    await env.DB.batch([
      env.DB.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','grant','synthetic'),('bob','foreign','synthetic')"),
      env.DB.prepare("UPDATE mailboxes SET provider='resend' WHERE owner='alice' AND id='mail'"),
      env.DB.prepare("INSERT INTO resend_senders VALUES('alice','mail','grant',1,'domain','example.com')"),
    ])
    const failure = enabled === 'true' ? 'resend_configuration_invalid' : 'resend_disabled'
    if (enabled === 'true') await code(await request(env, '/v1/resend/status'), 503, failure)
    else assert.deepEqual(await (await request(env, '/v1/resend/status')).json(), { enabled: false })
    for (const [path, body] of [[base, { apiKey: 'synthetic' }], [`${base}/grant/replace`, { revision: 1, apiKey: 'synthetic' }],
      [`${base}/grant/sender`, { address: 'sender@example.com', domainId: 'domain' }]] as const) {
      await code(await request(env, path, 'POST', body), 503, failure)
    }
    assert.deepEqual(await (await request(env, base)).json(), { connections: [{ id: 'grant', revision: 1, revoked: 0 }] })
    assert.deepEqual(await (await request(env, `${base}/grant`)).json(), { id: 'grant', revision: 1, revoked: 0 })
    await code(await request(env, `${base}/foreign`), 404, 'connection_not_found')
    await code(await request(env, `${base}/foreign/revoke`, 'POST', { revision: 1 }), 409, 'connection_changed')
    await code(await request(env, `${base}/grant/revoke`, 'POST', { revision: 2 }), 409, 'connection_changed')
    await code(await request(env, base, 'GET', undefined, 'invalid'), 401, 'unauthorized')
    const cookieCall = (headers: Record<string, string>) => handleRequest(new Request(`https://backend.test${base}/grant/revoke`, {
      method: 'POST', headers: { cookie: `${sessionCookieName}=${token}`, 'content-type': 'application/json', ...headers },
      body: JSON.stringify({ revision: 1 }),
    }), env, now)
    await code(await cookieCall({}), 403, 'csrf_failed')
    await code(await cookieCall({ origin: 'https://backend.test', 'x-elevateo-csrf': '1', 'x-elevateo-account': 'f'.repeat(32) }), 401, 'unauthorized')
    const removed = await cookieCall({ origin: 'https://backend.test', 'x-elevateo-csrf': '1' })
    assert.equal(removed.status, 200)
    assert.deepEqual(await removed.json(), { id: 'grant', revision: 2, revoked: 1 })
    assert.deepEqual(await env.DB.prepare("SELECT connected,verified,send_enabled,ai_send FROM mailboxes WHERE owner='alice' AND id='mail'").first(),
      { connected: 0, verified: 0, send_enabled: 0, ai_send: 0 })
    assert.equal((await env.DB.prepare("SELECT sealed FROM resend_credentials WHERE owner='bob' AND id='foreign'").first())?.sealed, 'synthetic')
  } finally { await f.close() }
})
