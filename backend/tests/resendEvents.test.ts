import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { fixture, draft, now } from './fixture'
import { SendLedger } from '../ledger'
import { ingestResendEvent } from '../resendEvents'

const secret = `whsec_${Buffer.alloc(32, 7).toString('base64')}`
const endpoint = { owner: 'alice', credentialId: 'credential', secret }
async function setup() {
  const f = await fixture()
  const db = f.env.DB
  await db.batch([
    db.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','credential','test')"),
    db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
    db.prepare("INSERT INTO resend_senders VALUES('alice','mail','credential',1,'domain','example.com')"),
    db.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"),
    db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','opt-in',1)"),
  ])
  const ledger = new SendLedger(db, 'https://mail.test')
  const intent = await ledger.create('alice', draft('event-intent', 1, 'campaign'), now)
  await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
  await ledger.dispatch('alice', intent.id, { send: async () => ({ status: 'unknown' as const }), reconcile: async () => ({ status: 'unknown' as const }) }, now,
    { provider: 'resend', credentialId: 'credential', credentialRevision: 1 })
  return { ...f, db, ledger, intent }
}
function payload(intentId: string, type = 'email.sent', providerId = '56761188-7520-42d8-8898-ff6fc54ce618') {
  return { type, created_at: new Date(now).toISOString(), data: { email_id: providerId,
    created_at: new Date(now).toISOString(), from: 'alice@example.com', to: ['recipient0@example.com'], subject: 'Hello',
    tags: { elevateo_intent_id: intentId }, ...(type === 'email.bounced' ? { bounce: { type: 'Permanent', subType: 'General', message: 'Rejected' } } : {}) } }
}
function signed(body: unknown, id = 'msg_test') {
  const raw = Buffer.from(JSON.stringify(body))
  const timestamp = String(now / 1000)
  const signature = `v1,${createHmac('sha256', Buffer.alloc(32, 7)).update(`${id}.${timestamp}.`).update(raw).digest('base64')}`
  return { raw, headers: { id, timestamp, signature } }
}

test('signed acceptance is durable, replay-safe and conflicting replay rolls back', async () => {
  const f = await setup()
  try {
    const event = signed(payload(f.intent.id))
    await ingestResendEvent(f.db, endpoint, event.raw, event.headers, now)
    await ingestResendEvent(f.db, endpoint, event.raw, event.headers, now)
    assert.equal((await f.db.prepare('SELECT status FROM send_intents WHERE owner=? AND id=?').bind('alice', f.intent.id).first<{ status: string }>())?.status, 'accepted')
    const conflict = signed(payload(f.intent.id, 'email.complained'))
    await assert.rejects(ingestResendEvent(f.db, endpoint, conflict.raw, conflict.headers, now))
    assert.equal(await f.db.prepare('SELECT * FROM suppressions').first(), null)
    assert.equal((await f.db.prepare('SELECT count(*) n FROM resend_event_receipts').first<{ n: number }>())?.n, 1)
  } finally { await f.close() }
})
test('late complaint after revocation suppresses and cancels waiting intent; delivery cannot clear suppression', async () => {
  const f = await setup()
  try {
    const waiting = await f.ledger.create('alice', draft('waiting', 1, 'campaign'), now)
    await f.ledger.approve('alice', waiting.id, waiting.revision, now, 60_000)
    await f.db.prepare("UPDATE resend_credentials SET sealed=NULL,revision=2 WHERE owner='alice'").run()
    for (const [type, id] of [['email.complained', 'complaint'], ['email.delivered', 'delivery']]) {
      const event = signed(payload(f.intent.id, type), id)
      await ingestResendEvent(f.db, endpoint, event.raw, event.headers, now)
    }
    assert.equal((await f.db.prepare('SELECT status FROM send_intents WHERE owner=? AND id=?').bind('alice', waiting.id).first<{ status: string }>())?.status, 'cancelled')
    assert.equal((await f.db.prepare('SELECT reason FROM suppressions').first<{ reason: string }>())?.reason, 'complaint')
  } finally { await f.close() }
})
test('rejects signature, owner, sender, recipient and terminal-state mismatches without receipts', async () => {
  const f = await setup()
  try {
    const event = signed(payload(f.intent.id))
    await assert.rejects(ingestResendEvent(f.db, endpoint, event.raw, { ...event.headers, signature: 'v1,bad' }, now))
    await assert.rejects(ingestResendEvent(f.db, { ...endpoint, owner: 'bob' }, event.raw, event.headers, now))
    for (const changed of [{ from: 'other@example.com' }, { to: ['other@example.com'] }]) {
      const body = payload(f.intent.id); Object.assign(body.data, changed)
      const mismatch = signed(body)
      await assert.rejects(ingestResendEvent(f.db, endpoint, mismatch.raw, mismatch.headers, now))
    }
    await f.db.prepare("UPDATE send_intents SET status='rejected' WHERE owner='alice'").run()
    await assert.rejects(ingestResendEvent(f.db, endpoint, event.raw, event.headers, now))
    assert.equal(await f.db.prepare('SELECT * FROM resend_event_receipts').first(), null)
  } finally { await f.close() }
})

test('provider ID cannot be reused for another intent and transaction leaves no second receipt', async () => {
  const f = await setup()
  try {
    const first = signed(payload(f.intent.id), 'first')
    await ingestResendEvent(f.db, endpoint, first.raw, first.headers, now)
    const second = await f.ledger.create('alice', draft('second', 1, 'campaign'), now)
    await f.ledger.approve('alice', second.id, second.revision, now, 60_000)
    await f.ledger.dispatch('alice', second.id, { send: async () => ({ status: 'unknown' as const }), reconcile: async () => ({ status: 'unknown' as const }) }, now,
      { provider: 'resend', credentialId: 'credential', credentialRevision: 1 })
    const collision = signed(payload(second.id), 'collision')
    await assert.rejects(ingestResendEvent(f.db, endpoint, collision.raw, collision.headers, now))
    assert.equal((await f.db.prepare('SELECT count(*) n FROM resend_event_receipts').first<{ n: number }>())?.n, 1)
    assert.equal((await f.db.prepare('SELECT status FROM send_intents WHERE id=?').bind(second.id).first<{ status: string }>())?.status, 'unknown')
  } finally { await f.close() }
})
test('bounce suppression is bounded and never changes another owner', async () => {
  const f = await setup()
  try {
    await f.db.prepare("INSERT INTO contacts VALUES('bob','recipient0@example.com','opt-in',1)").run()
    const event = signed(payload(f.intent.id, 'email.bounced'))
    await ingestResendEvent(f.db, endpoint, event.raw, event.headers, now)
    assert.equal((await f.db.prepare("SELECT opted_in FROM contacts WHERE owner='bob'").first<{ opted_in: number }>())?.opted_in, 1)
    assert.equal((await f.db.prepare("SELECT reason FROM suppressions WHERE owner='alice'").first<{ reason: string }>())?.reason, 'bounce')
    await assert.rejects(ingestResendEvent(f.db, endpoint, new Uint8Array(65_537), event.headers, now))
    const unsupported = signed({ ...payload(f.intent.id), owner: 'bob' }, 'unsupported')
    await assert.rejects(ingestResendEvent(f.db, endpoint, unsupported.raw, unsupported.headers, now))
  } finally { await f.close() }
})
