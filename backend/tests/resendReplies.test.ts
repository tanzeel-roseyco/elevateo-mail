import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { test } from 'node:test'
import { fixture, draft, now, request } from './fixture'
import { createSequence } from '../sequences'
import { ResendProvider } from '../providers/resend'
import { envelopeSchema } from '../providers/ports'
import { SendLedger } from '../ledger'
import { ingestResendReply } from '../resendReplies'
import { replyChannelSchema } from '../resendReplyEnvelope'
const channel = { owner: 'alice', credentialId: 'credential', domain: 'replies.example.com' }
const endpoint = { ...channel, secret: `whsec_${Buffer.alloc(32, 7).toString('base64')}` }
function signed(to: string, from = 'recipient0@example.com', id = 'reply_one') {
  const raw = Buffer.from(JSON.stringify({ type: 'email.received', created_at: new Date(now).toISOString(),
    data: { email_id: '56761188-7520-42d8-8898-ff6fc54ce618', created_at: new Date(now).toISOString(), from, to: [to] } }))
  const timestamp = String(now / 1000)
  return { raw, headers: { id, timestamp, signature: `v1,${createHmac('sha256', Buffer.alloc(32, 7))
    .update(`${id}.${timestamp}.`).update(raw).digest('base64')}` } }
}
test('immutable correlated reply stops waiting campaign sends; retry is stable and consent remains intact', async () => {
  const f = await fixture(), db = f.env.DB
  try {
    await db.batch([
      db.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','credential','test')"),
      db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
      db.prepare("INSERT INTO resend_senders VALUES('alice','mail','credential',1,'domain','example.com')"),
      db.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"),
      db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','opt-in',1)"),
    ])
    const ledger = new SendLedger(db, 'https://mail.test', channel)
    const source = await ledger.create('alice', draft('reply-source', 1, 'campaign'), now)
    assert.deepEqual(await ledger.create('alice', draft('reply-source', 1, 'campaign'), now), source)
    const stored = await db.prepare('SELECT envelope FROM send_intents WHERE id=?').bind(source.id).first<{envelope: string}>()
    const address = (JSON.parse(stored!.envelope) as {resendReplyTo: string}).resendReplyTo
    let posted = false
    const transport = new ResendProvider('fixture', 'alice@example.com', true, async (_url, init) => {
      assert.equal((JSON.parse(String(init.body)) as {reply_to:string}).reply_to, address)
      posted = true
      return Response.json({ id: 'fixture-receipt' })
    })
    await transport.send(envelopeSchema.parse(JSON.parse(stored!.envelope)))
    assert.equal(posted, true)
    const waiting = await ledger.create('alice', draft('reply-waiting', 1, 'campaign'), now)
    const configured = { ...f.env, RESEND_REPLY_ENDPOINTS: JSON.stringify({ ['r'.repeat(24)]: endpoint }) }
    const sequence = await createSequence(db, 'alice', 'campaign', { idempotencyKey: 'reply-sequence', mailboxId: 'mail',
      recipient: 'recipient0@example.com', steps: [{ subject: 'Follow up', body: 'Text', scheduledAt: new Date(now + 60_000).toISOString() }] },
      now, 'https://mail.test', configured)
    const step = await db.prepare('SELECT envelope FROM send_intents WHERE id=?').bind(sequence.steps[0]!.id).first<{envelope:string}>()
    assert.match((JSON.parse(step!.envelope) as {resendReplyTo:string}).resendReplyTo, /@replies.example.com$/u)
    assert.equal((await request(configured, `/v1/resend/replies/${'r'.repeat(24)}`, 'GET', undefined, '')).status, 405)
    assert.equal((await request(configured, `/v1/resend/replies/${'r'.repeat(24)}`, 'POST', {}, '')).status, 401)
    assert.equal((await request(configured, `/v1/resend/replies/${'x'.repeat(24)}`, 'POST', {}, '')).status, 404)
    const event = signed(address)
    await assert.rejects(ingestResendReply(db, endpoint, event.raw, event.headers, now), /reply_correlation_failed/u)
    await ledger.approve('alice', source.id, source.revision, now, 60_000)
    await ledger.dispatch('alice', source.id, { send: async () => ({ status: 'unknown' }), reconcile: async () => ({ status: 'unknown' }) }, now,
      { provider: 'resend', credentialId: 'credential', credentialRevision: 1 })
    const wrong = signed(address, 'other@example.com')
    await assert.rejects(ingestResendReply(db, endpoint, wrong.raw, wrong.headers, now), /reply_correlation_failed/u)
    await assert.rejects(ingestResendReply(db, { ...endpoint, owner: 'bob' }, event.raw, event.headers, now), /reply_correlation_failed/u)
    await assert.rejects(ingestResendReply(db, endpoint, event.raw, { ...event.headers, signature: 'invalid' }, now), /event_unauthorized/u)
    await ingestResendReply(db, endpoint, event.raw, event.headers, now)
    await ingestResendReply(db, endpoint, event.raw, event.headers, now)
    assert.equal((await db.prepare('SELECT status FROM send_intents WHERE id=?').bind(waiting.id).first<{status: string}>())?.status, 'cancelled')
    assert.equal((await db.prepare('SELECT opted_in FROM contacts WHERE owner=?').bind('alice').first<{opted_in: number}>())?.opted_in, 1)
    assert.equal((await db.prepare('SELECT count(*) n FROM resend_reply_receipts').first<{n: number}>())?.n, 1)
    const conflict = signed(address, 'RECIPIENT0@example.com')
    await assert.rejects(ingestResendReply(db, endpoint, conflict.raw, conflict.headers, now), /reply_event_conflict/u)
  } finally { await f.close() }
})
test('reply config rejects roots and protected shared receiving subdomain', () => {
  for (const domain of ['example.com', 'in.elevateoco.com', 'a..example.com']) {
    assert.equal(replyChannelSchema.safeParse({ ...channel, domain }).success, false)
  }
})
