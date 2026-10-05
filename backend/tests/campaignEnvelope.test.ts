import assert from 'node:assert/strict'
import { test } from 'node:test'
import { campaignEnvelope, campaignOrigin } from '../campaignEnvelope'
import { SendLedger } from '../ledger'
import { sha256 } from '../core'
import { draft, fixture, now } from './fixture'
import type { SendEnvelope } from '../providers/ports'

// AIDEV-NOTE: Real D1 verifies issuance and retries atomically; no provider transport or credential is needed.
const envelope: SendEnvelope = { id: 'intent', owner: 'alice', mailboxId: 'mail', from: 'alice@example.com',
  to: ['recipient0@example.com'], cc: [], bcc: [], subject: 'Hello', body: 'Body', kind: 'campaign', revision: 'a'.repeat(64) }
test('campaign footer origin and supported recipient/body boundaries are enforced', async () => {
  for (const origin of ['http://mail.test', 'https://user:pass@mail.test', 'https://mail.test/path', 'https://mail.test?q=1']) {
    assert.throws(() => campaignOrigin(origin), /unsubscribe_origin_invalid/)
  }
  assert.equal(campaignOrigin('https://mail.test/'), 'https://mail.test')
  await assert.rejects(campaignEnvelope({ ...envelope, cc: ['copy@example.com'] }, 'resend', 'https://mail.test'), /recipient_shape_unsupported/)
  await assert.rejects(campaignEnvelope({ ...envelope, body: 'a'.repeat(100_000) }, 'resend', 'https://mail.test'), /campaign_body_too_large/)
  assert.equal((await campaignEnvelope(envelope, 'fake', 'https://mail.test')).token, null)
  await assert.rejects(campaignEnvelope(envelope, 'resend'), /unsubscribe_origin_required/)
})
test('Resend footer token is owner-bound and immutable across sequential and concurrent retries', async () => {
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
    const input = draft('footer', 1, 'campaign')
    const [first, raced] = await Promise.all([ledger.create('alice', input, now), ledger.create('alice', input, now)])
    assert.equal(first.id, raced.id)
    const before = await db.prepare('SELECT envelope,envelope_hash FROM send_intents WHERE owner=? AND id=?').bind('alice', first.id)
      .first<{ envelope: string; envelope_hash: string }>()
    const body = (JSON.parse(before!.envelope) as SendEnvelope).body
    const token = /https:\/\/mail\.test\/unsubscribe\/([a-f0-9]{64})$/u.exec(body)?.[1]
    assert.ok(token)
    assert.equal(before!.envelope_hash, await sha256(before!.envelope))
    assert.deepEqual(await db.prepare('SELECT owner,email FROM unsubscribe_tokens WHERE token_hash=?').bind(await sha256(token)).first(),
      { owner: 'alice', email: 'recipient0@example.com' })
    assert.equal((await new SendLedger(db, 'https://changed.test').create('alice', input, now + 1)).id, first.id)
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM unsubscribe_tokens').first<{ n: number }>())!.n, 1)
    assert.equal((await db.prepare('SELECT envelope FROM send_intents WHERE id=?').bind(first.id).first<{ envelope: string }>())!.envelope, before!.envelope)
    await assert.rejects(ledger.create('alice', { ...input, body: 'changed' }, now), /idempotency_conflict/)
    await assert.rejects(ledger.create('bob', input, now), /mailbox_not_found/)
  } finally { await f.close() }
})
