import assert from 'node:assert/strict'
import test from 'node:test'
import { resetFixtureRows } from '../local/reset'
import { SendLedger } from '../ledger'
import { fixture, draft, now } from './fixture'

test('browser reset clears native bearer tickets and Resend FK children before reusable identities', async () => {
  const f = await fixture()
  try {
    const db = f.env.DB
    await db.batch([
      db.prepare("INSERT INTO native_draft_tickets VALUES('ticket',NULL,'alice','session','request','mail','[]','draft',?)").bind(now + 60_000),
      db.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','key','synthetic')"),
      db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
      db.prepare("INSERT INTO resend_senders VALUES('alice','mail','key',1,'domain','example.com')"),
    ])
    await db.batch([db.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"), db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','opt-in',1)")])
    const ledger = new SendLedger(db, 'https://mail.test')
    const intent = await ledger.create('alice', draft('reset', 1, 'campaign'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await ledger.dispatch('alice', intent.id, { send: async () => ({ status: 'unknown' }), reconcile: async () => ({ status: 'unknown' }) }, now, { provider: 'resend', credentialId: 'key', credentialRevision: 1 })
    await db.batch([
      db.prepare("INSERT INTO resend_event_receipts VALUES('alice','key','event','hash',?,'provider',?)").bind(intent.id, now),
      db.prepare("INSERT INTO resend_message_links VALUES('alice','key','provider',?)").bind(intent.id),
    ])
    await resetFixtureRows(db)
    await resetFixtureRows(db)
    for (const table of ['native_draft_tickets', 'resend_event_receipts', 'resend_message_links',
      'resend_senders', 'resend_credentials', 'send_intents', 'mailboxes', 'sessions']) {
      assert.equal((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first())?.n, 0, table)
    }
    await db.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('alice','mail','fake','subject','alice@example.com')").run()
  } finally { await f.close() }
})
