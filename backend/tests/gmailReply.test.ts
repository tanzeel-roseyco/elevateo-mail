import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, draft, now } from './fixture'
import { extractReplyHeaders, resolveReply } from '../gmailReply'
import { sendInputSchema } from '../policies/send'
import { SendLedger, type IntentRow } from '../ledger'
import { GmailProvider } from '../providers/gmail'
import { syncGmailPage } from '../gmailSync'

// AIDEV-NOTE: Real D1 sync-to-envelope tests prove provenance; injected transport never contacts Gmail.
test('synced RFC source produces threaded MIME and rejects stale approval', async () => {
  const f = await fixture(); const db = f.env.DB
  try {
    await db.prepare("UPDATE mailboxes SET provider='gmail' WHERE owner='alice' AND id='mail'").run()
    await db.prepare("INSERT INTO provider_credentials(owner,id,provider,subject,sealed) VALUES('alice','connection','gmail','subject','fixture')").run()
    await syncGmailPage(db, 'alice', 'mail', { read: async () => ({ messages: [{ id: 'source', threadId: 'thread',
      sender: 'recipient0@example.com', subject: 'Hello', body: 'Original', at: now,
      replyHeaders: { messageId: '<source@example.com>', references: ['<root@example.com>'] } }], deleted: [], cursor: '1', next: null }) },
    { id: 'connection', revision: 1 })
    const ledger = new SendLedger(db); const input = { ...draft('reply'), replyToMessageId: 'source' }
    const created = await ledger.create('alice', input, now)
    await assert.rejects(resolveReply(db, 'bob', sendInputSchema.parse(input), 'gmail'), /reply_source_unavailable/u)
    assert.deepEqual(await ledger.create('alice', input, now), created)
    const row = await db.prepare('SELECT * FROM send_intents WHERE id=?').bind(created.id).first<IntentRow>()
    const envelope = await ledger.envelope(row!)
    assert.equal(envelope.reply?.sourceId, 'source')
    const provider = new GmailProvider('token', true, async (_url, init) => {
      const payload = JSON.parse(init!.body as string) as { raw: string; threadId: string }
      assert.equal(payload.threadId, 'thread')
      const mime = atob(payload.raw.replaceAll('-', '+').replaceAll('_', '/'))
      assert.match(mime, /In-Reply-To: <source@example.com>/u)
      assert.match(mime, /References: <root@example.com>\r\n <source@example.com>/u)
      return new Response(JSON.stringify({ id: 'sent' }), { status: 200 })
    })
    assert.equal((await provider.send(envelope)).status, 'accepted')
    await assert.rejects(ledger.approve('alice', created.id, 'f'.repeat(64), now, 1000), /approval_conflict/u)
    await assert.rejects(ledger.create('alice', { ...input, replyToMessageId: 'other' }, now), /idempotency_conflict/u)
    await assert.rejects(ledger.create('alice', { ...input, idempotencyKey: 'changed', to: ['other@example.com'] }, now), /reply_identity_changed/u)
    await assert.rejects(ledger.create('alice', { ...input, idempotencyKey: 'missing', replyToMessageId: 'missing' }, now), /reply_source_unavailable/u)
    await db.prepare("UPDATE messages SET subject=' Hello ' WHERE owner='alice' AND id='source'").run()
    const spaced = await ledger.create('alice', { ...input, idempotencyKey: 'spaced', subject: ' Hello ' }, now)
    const spacedRow = await db.prepare('SELECT * FROM send_intents WHERE id=?').bind(spaced.id).first<IntentRow>()
    assert.equal((await ledger.envelope(spacedRow!)).subject, ' Hello ')
    assert.equal(sendInputSchema.parse({ ...draft('ordinary'), subject: ' Hello ' }).subject, 'Hello')
    await db.prepare("INSERT INTO gmail_sync_issues(owner,mailbox_id,message_id,reason,epoch) VALUES('alice','mail','source','message_content_unsupported','epoch')").run()
    await assert.rejects(ledger.create('alice', { ...input, idempotencyKey: 'incomplete' }, now), /reply_source_unavailable/u)
  } finally { await f.close() }
})
test('reply headers reject duplicates, injection and excessive references', () => {
  const id = { name: 'Message-ID', value: '<source@example.com>' }
  assert.deepEqual(extractReplyHeaders([id]), { messageId: id.value, references: [] })
  assert.equal(extractReplyHeaders([]), undefined)
  assert.equal(extractReplyHeaders([id, id]), undefined)
  assert.equal(extractReplyHeaders([{ ...id, value: '<"source"@example.com>' }]), undefined)
  assert.equal(extractReplyHeaders([{ ...id, value: '<source@example.com>\r\nBcc: victim@example.com' }]), undefined)
  assert.equal(extractReplyHeaders([id, { name: 'References', value: Array(21).fill('<x@example.com>').join(' ') }]), undefined)
})
