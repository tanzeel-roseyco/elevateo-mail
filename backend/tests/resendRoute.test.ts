import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now, token } from './fixture'
import { sha256 } from '../core'
import { base64url } from '../credentialVault'
import { createResendRuntime } from '../resendConfig'
import { resendRoute } from '../resendRoute'

const base = '/v1/resend/connections'
const domainId = '00000000-0000-4000-8000-000000000001'
async function setup() {
  const f = await fixture()
  const runtime = (await createResendRuntime(f.env.DB, { RESEND_CONNECTIONS_ENABLED: 'true',
    RESEND_ENCRYPTION_KEY: base64url(new Uint8Array(32)) }, async () => Response.json({
    id: domainId, name: 'example.com', status: 'verified', capabilities: { sending: 'enabled' },
  })))!
  const session = { owner: 'alice', token_hash: await sha256(token), expires_at: now + 86_400_000 }
  const call = (path: string, method = 'GET', body?: unknown) => resendRoute(new Request(`https://app.test${path}`, {
    method, ...(body === undefined ? {} : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }), path.split('?')[0]!, session, f.env.DB, runtime, now)
  return { ...f, runtime, session, call }
}

// AIDEV-NOTE: Real database and encryption, synthetic domain HTTP only; no credentials or external network needed.
test('Resend HTTP manages redacted credentials, verified disabled sender, replacement and revocation', async () => {
  const f = await setup()
  try {
    assert.deepEqual(await (await f.call(base))!.json(), { connections: [] })
    const response = (await f.call(base, 'POST', { apiKey: 'synthetic-secret' }))!
    assert.equal(response.status, 201); assert.equal(response.headers.get('cache-control'), 'no-store')
    const created = await response.json() as { id: string; revision: number; revoked: number }
    assert.deepEqual(created, { id: created.id, revision: 1, revoked: 0 })
    const path = `${base}/${created.id}`
    assert.deepEqual(await (await f.call(base))!.json(), { connections: [created] })
    assert.deepEqual(await (await f.call(path))!.json(), created)
    const sender = await (await f.call(`${path}/sender`, 'POST', { address: 'sender@example.com', domainId }))!.json() as { id: string }
    assert.equal((await f.env.DB.prepare('SELECT send_enabled FROM mailboxes WHERE id=?').bind(sender.id).first())?.send_enabled, 0)
    assert.deepEqual(await (await f.call(`${path}/replace`, 'POST', { revision: 1, apiKey: 'new-secret' }))!.json(),
      { id: created.id, revision: 2, revoked: 0 })
    await assert.rejects(f.call(`${path}/replace`, 'POST', { revision: 1, apiKey: 'stale' }), /connection_changed/)
    assert.deepEqual(await (await f.call(`${path}/revoke`, 'POST', { revision: 2 }))!.json(),
      { id: created.id, revision: 3, revoked: 1 })
    assert.equal((await f.env.DB.prepare('SELECT connected FROM mailboxes WHERE id=?').bind(sender.id).first())?.connected, 0)
  } finally { await f.close() }
})

test('Resend HTTP enforces disabled, method, body, query, session and owner boundaries', async () => {
  const f = await setup()
  try {
    const status = '/v1/resend/status'
    assert.deepEqual(await (await resendRoute(new Request(`https://app.test${status}`), status, f.session, f.env.DB, undefined, now))!.json(), { enabled: false })
    assert.deepEqual(await (await resendRoute(new Request(`https://app.test${base}`), base, f.session, f.env.DB, undefined, now))!.json(), { connections: [] })
    await assert.rejects(f.call(base, 'PUT', {}), /method_not_allowed/)
    await assert.rejects(f.call(`${base}?x=1`), /validation_failed/)
    await assert.rejects(f.call(base, 'POST', { apiKey: 'key', owner: 'bob' }))
    await assert.rejects(f.call(base, 'POST', { apiKey: 'x'.repeat(8193) }))
    const created = await (await f.call(base, 'POST', { apiKey: 'key' }))!.json() as { id: string }
    await f.env.DB.prepare('UPDATE sessions SET owner=? WHERE token_hash=?').bind('bob', f.session.token_hash).run()
    f.session.owner = 'bob'
    assert.deepEqual(await (await f.call(base))!.json(), { connections: [] })
    await assert.rejects(f.call(`${base}/${created.id}`), /connection_not_found/)
    await assert.rejects(f.call(`${base}/${created.id}/revoke`, 'POST', { revision: 1 }), /connection_changed/)
    await f.env.DB.prepare('DELETE FROM sessions').run()
    await assert.rejects(f.call(base), /unauthorized/)
  } finally { await f.close() }
})
