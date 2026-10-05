import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SendLedger } from '../ledger'
import { sendLookupResponse } from '../contracts/v1'
import { draft, fixture, now, request } from './fixture'

// AIDEV-NOTE: Real D1 exercises exact owner/key lookup, including absent keys and untrusted query parameters.
test('lookup recovers the exact owner request without exposing content or changing send state', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const created = await ledger.create('alice', draft('lost-response'), now)
    const response = await request(f.env, '/v1/send-intents/lookup?idempotencyKey=lost-response')
    assert.equal(response.status, 200)
    const result = sendLookupResponse.parse(await response.json())
    assert.equal(result.intent?.id, created.id)
    assert.equal(result.intent?.idempotency_key, 'lost-response')
    assert.equal(result.intent?.status, 'draft')
    assert.equal(result.intent?.successor_id, null)
    assert.equal(result.simulated, true)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE owner=? AND id=?')
      .bind('alice', created.id).first())?.status, 'draft')
    const absent = await request(f.env, '/v1/send-intents/lookup?idempotencyKey=missing')
    assert.equal(absent.status, 200)
    assert.deepEqual(await absent.json(), { intent: null, simulated: true })
  } finally { await f.close() }
})

test('lookup cannot discover another owner request, even when owners reuse the same key', async () => {
  const f = await fixture()
  try {
    await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled) VALUES('bob','mail','fake','bob','bob@example.com',1)").run()
    const ledger = new SendLedger(f.env.DB)
    const foreign = await ledger.create('bob', draft('foreign-key'), now)
    const hidden = await request(f.env, '/v1/send-intents/lookup?idempotencyKey=foreign-key')
    assert.equal(hidden.status, 200)
    assert.deepEqual(await hidden.json(), { intent: null, simulated: true })
    const own = await ledger.create('alice', draft('foreign-key'), now)
    const result = sendLookupResponse.parse(await (await request(f.env,
      '/v1/send-intents/lookup?idempotencyKey=foreign-key')).json())
    assert.equal(result.intent?.id, own.id)
    assert.notEqual(result.intent?.id, foreign.id)
  } finally { await f.close() }
})

test('lookup rejects missing, duplicate, oversized, malformed and extra query parameters', async () => {
  const f = await fixture()
  try {
    for (const query of ['', '?idempotencyKey=', '?idempotencyKey=a&idempotencyKey=b',
      `?idempotencyKey=${'a'.repeat(129)}`, '?idempotencyKey=a%2Fb', '?idempotencyKey=a&owner=bob']) {
      const response = await request(f.env, `/v1/send-intents/lookup${query}`)
      assert.equal(response.status, 400, query)
      const payload = await response.json() as { error: { code: string } }
      assert.equal(payload.error.code, 'validation_failed', query)
    }
    assert.equal((await request(f.env, '/v1/send-intents/lookup?idempotencyKey=valid', 'GET', undefined, 'invalid')).status, 401)
  } finally { await f.close() }
})
