import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SendLedger } from '../ledger'
import { draft, fixture, now, request } from './fixture'

// AIDEV-NOTE: Missing and foreign IDs share a 404; only an owned non-cancellable request returns a conflict.
test('cancel distinguishes owned state conflicts from absent or foreign requests', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const own = await ledger.create('alice', draft('cancel-own'), now)
    assert.equal((await request(f.env, `/v1/send-intents/${own.id}/cancel`, 'POST')).status, 200)
    assert.equal((await request(f.env, `/v1/send-intents/${own.id}/cancel`, 'POST')).status, 409)
    await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled) VALUES('bob','mail','fake','bob','bob@example.com',1)").run()
    const foreign = await ledger.create('bob', draft('cancel-foreign'), now)
    for (const id of ['missing', foreign.id]) {
      const response = await request(f.env, `/v1/send-intents/${id}/cancel`, 'POST')
      assert.equal(response.status, 404)
      assert.equal((await response.json() as { error: { code: string } }).error.code, 'intent_not_found')
    }
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE owner=? AND id=?').bind('bob', foreign.id).first())?.status, 'draft')
  } finally { await f.close() }
})
