import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { fixture, draft, now } from './fixture'
import { SendLedger } from '../ledger'
import { handleRequest } from '../worker'

const endpointId = 'endpoint_12345678901234567890'
const path = `https://backend.test/v1/resend/events/${endpointId}`
const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
const config = (owner = 'alice') => JSON.stringify({ [endpointId]: { owner, credentialId: 'credential', secret } })
function signed(body: string) {
  const id = 'msg_route', timestamp = String(now / 1000)
  return { 'svix-id': id, 'svix-timestamp': timestamp,
    'svix-signature': `v1,${createHmac('sha256', Buffer.alloc(32, 7)).update(`${id}.${timestamp}.${body}`).digest('base64')}` }
}
test('public signed route resolves only the configured owner and persists acceptance without session', async () => {
  const f = await fixture()
  try {
    const db = f.env.DB
    await db.batch([
      db.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','credential','test')"),
      db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
      db.prepare("INSERT INTO resend_senders VALUES('alice','mail','credential',1,'domain','example.com')"),
      db.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"),
      db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','opt-in',1)"),
    ])
    const ledger = new SendLedger(db, 'https://mail.test')
    const intent = await ledger.create('alice', draft('route-intent', 1, 'campaign'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await ledger.dispatch('alice', intent.id, { send: async () => ({ status: 'unknown' as const }), reconcile: async () => ({ status: 'unknown' as const }) }, now,
      { provider: 'resend', credentialId: 'credential', credentialRevision: 1 })
    const body = JSON.stringify({ type: 'email.sent', created_at: new Date(now).toISOString(), data: {
      email_id: '56761188-7520-42d8-8898-ff6fc54ce618', created_at: new Date(now).toISOString(),
      from: 'alice@example.com', to: ['recipient0@example.com'], subject: 'Hello', tags: { elevateo_intent_id: intent.id },
    } })
    const send = (owner: string, headers = signed(body), raw = body) => handleRequest(new Request(path,
      { method: 'POST', headers, body: raw }), Object.assign({}, f.env, { RESEND_EVENT_ENDPOINTS: config(owner) }), now)
    assert.equal((await send('bob')).status, 409)
    assert.equal((await send('alice', signed(body), `${body} `)).status, 401)
    const response = await send('alice')
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    assert.deepEqual(await response.json(), { captured: true })
    assert.equal((await db.prepare('SELECT status FROM send_intents WHERE id=?').bind(intent.id).first<{ status: string }>())?.status, 'accepted')
    assert.equal((await send('alice')).status, 200)
  } finally { await f.close() }
})

test('route is disabled by default, configuration is lazy and invalid config never leaks secrets', async () => {
  const f = await fixture()
  try {
    const send = (url: string, method: string, configured?: string) => handleRequest(new Request(url, { method }),
      Object.assign({}, f.env, configured === undefined ? {} : { RESEND_EVENT_ENDPOINTS: configured }), now)
    assert.equal((await send(path, 'POST')).status, 404)
    assert.equal((await send(path, 'GET', config())).status, 405)
    assert.equal((await send(`${path}?owner=bob`, 'POST', config())).status, 400)
    for (const bad of ['invalid-secret-value', '{}', config().replace(secret, 'whsec_AA=='), 'x'.repeat(90_001)]) {
      const response = await send(path, 'POST', bad)
      assert.equal(response.status, 503)
      assert.equal(response.headers.get('cache-control'), 'no-store')
      assert.doesNotMatch(await response.text(), /invalid-secret-value|whsec_/u)
    }
    assert.equal((await send('https://backend.test/v1/me', 'GET', 'invalid')).status, 401)
    assert.equal((await send(`${path}other`, 'POST', config())).status, 404)
  } finally { await f.close() }
})

test('streamed body limit applies without content length before signature verification', async () => {
  const f = await fixture()
  try {
    for (const [size, status] of [[65_536, 401], [65_537, 413]]) {
      const response = await handleRequest(new Request(path, { method: 'POST', body: new Uint8Array(size!) }),
        Object.assign({}, f.env, { RESEND_EVENT_ENDPOINTS: config() }), now)
      assert.equal(response.status, status)
      assert.equal(response.headers.get('cache-control'), 'no-store')
    }
    const raw = '{invalid'
    const response = await handleRequest(new Request(path, { method: 'POST', body: raw, headers: signed(raw) }),
      Object.assign({}, f.env, { RESEND_EVENT_ENDPOINTS: config() }), now)
    assert.equal(response.status, 400)
  } finally { await f.close() }
})
