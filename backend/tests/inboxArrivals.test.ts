import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, request } from './fixture'
import { GmailCursorExpired, syncGmailPage } from '../gmailSync'

const message = (id: string) => ({ id, threadId: 'thread', sender: 'a@example.com', subject: 'Mail', body: 'Text', at: 1, inbox: !['sent', 'archived'].includes(id) })
const page = (ids: string[]) => ({ messages: ids.map(message), deleted: [], cursor: '10', next: null })
// AIDEV-NOTE: Use real D1 commits to prove retries, imported history, and failed credential fences cannot notify.
test('arrival counter excludes full scans and imports; history insertion counts once and remains owner-scoped', async () => {
  const f = await fixture(); const db = f.env.DB
  const sync = (ids: string[]) => syncGmailPage(db, 'alice', 'mail', { read: async () => page(ids) }, { id: 'connection', revision: 1 })
  const count = async () => (await db.prepare("SELECT arrival_count FROM mailboxes WHERE owner='alice' AND id='mail'").first())?.arrival_count
  try {
    await db.prepare("UPDATE mailboxes SET provider='gmail' WHERE owner='alice' AND id='mail'").run()
    await db.prepare("INSERT INTO provider_credentials(owner,id,provider,subject,sealed) VALUES('alice','connection','gmail','subject','fixture')").run()
    await db.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('bob','mail','gmail','bob','bob@example.com')").run()
    await sync(['old']); assert.equal(await count(), 0)
    await sync([]) // Finish bounded prune and enter incremental history.
    await db.prepare("INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at) VALUES('alice','mail','imported','thread','a@example.com','Import','Text',1)").run()
    await sync(['old', 'new', 'imported', 'sent', 'archived']); assert.equal(await count(), 1)
    await sync(['new']); assert.equal(await count(), 1)
    assert.equal((await db.prepare("SELECT arrival_count FROM mailboxes WHERE owner='bob'").first())?.arrival_count, 0)
    const response = await request(f.env, '/v1/mailboxes')
    assert.equal((await response.json() as { items: { arrival_count: number }[] }).items[0]?.arrival_count, 1)
    const detail = await request(f.env, '/v1/messages/mail/new')
    assert.equal(detail.status, 200)
    assert.equal('gmail_inbox' in (await detail.json() as { message: object }).message, false)
    await syncGmailPage(db, 'alice', 'mail', { read: async () => { throw new GmailCursorExpired() } }, { id: 'connection', revision: 1 })
    await sync(['rescan']); assert.equal(await count(), 1)
  } finally { await f.close() }
})

test('revoked credential during history fetch commits neither arrival nor message', async () => {
  const f = await fixture(); const db = f.env.DB
  try {
    await db.prepare("UPDATE mailboxes SET provider='gmail' WHERE owner='alice' AND id='mail'").run()
    await db.prepare("INSERT INTO provider_credentials(owner,id,provider,subject,sealed) VALUES('alice','connection','gmail','subject','fixture')").run()
    await db.prepare("INSERT INTO gmail_sync(owner,mailbox_id,mode,cursor,epoch) VALUES('alice','mail','history','10','epoch')").run()
    await assert.rejects(syncGmailPage(db, 'alice', 'mail', { read: async () => {
      await db.prepare("UPDATE provider_credentials SET revision=revision+1,sealed=NULL").run()
      return page(['new'])
    } }, { id: 'connection', revision: 1 }), /sync_conflict/)
    assert.equal((await db.prepare('SELECT arrival_count FROM mailboxes').first())?.arrival_count, 0)
    assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM messages').first())?.n, 0)
  } finally { await f.close() }
})
