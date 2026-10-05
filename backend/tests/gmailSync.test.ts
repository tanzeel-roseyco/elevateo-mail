import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture } from './fixture'
import { GmailCursorExpired, syncGmailPage as syncWithCredential, type GmailSyncProvider, type GmailSyncRequest } from '../gmailSync'

const credential = { id: 'connection', revision: 1 }
const syncGmailPage = (db: D1Database, owner: string, mailbox: string, adapter: GmailSyncProvider) =>
  syncWithCredential(db, owner, mailbox, adapter, credential)

const mail = (id: string, body = 'Hello') => ({ id, threadId: 'thread', sender: 'sender@example.com', subject: 'Subject', body, at: 1 })
const page = (messages: ReturnType<typeof mail>[] = [], cursor = '10', next: string | null = null, deleted: string[] = []) =>
  ({ messages, cursor, next, deleted })
const provider = (value: unknown): GmailSyncProvider => ({ read: async () => value })
const issue = (id: string) => ({ id, reason: 'message_content_unsupported' })
async function setup() {
  const f = await fixture()
  await f.env.DB.prepare("UPDATE mailboxes SET provider='gmail' WHERE owner='alice' AND id='mail'").run()
  await f.env.DB.prepare("INSERT INTO provider_credentials(owner,id,provider,subject,sealed) VALUES('alice','connection','gmail','subject','fixture-ciphertext')").run()
  return f
}
// AIDEV-NOTE: Real D1 tests cover cursor persistence and write fences, rather than mocking transaction behavior.
test('incomplete messages persist alongside cursor progress and resolve on successful read or deletion', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    const result = await syncGmailPage(db, 'alice', 'mail', provider({ ...page([mail('good')]), incomplete: [issue('bad'), issue('gone')] }))
    assert.equal(result.imported, 1)
    assert.equal((await db.prepare('SELECT cursor FROM gmail_sync').first())?.cursor, '10')
    assert.deepEqual((await db.prepare('SELECT message_id,reason FROM gmail_sync_issues ORDER BY message_id').all()).results,
      [{ message_id: 'bad', reason: 'message_content_unsupported' }, { message_id: 'gone', reason: 'message_content_unsupported' }])
    await syncGmailPage(db, 'alice', 'mail', provider(null))
    await syncGmailPage(db, 'alice', 'mail', provider(page([mail('bad')], '20', null, ['gone'])))
    assert.equal((await db.prepare('SELECT count(*) AS n FROM gmail_sync_issues').first())?.n, 0)
    assert.equal((await db.prepare('SELECT count(*) AS n FROM messages').first())?.n, 2)
  } finally { await f.close() }
})

test('incomplete entries reject duplicates and overflow; rescan prunes obsolete issues', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    for (const incomplete of [[issue('good')], Array.from({ length: 26 }, (_, i) => issue(`bad${i}`))]) {
      await assert.rejects(syncGmailPage(db, 'alice', 'mail', provider({ ...page([mail('good')]), incomplete })), /sync_provider_invalid/)
    }
    assert.equal((await db.prepare('SELECT version FROM gmail_sync').first())?.version, 0)
    await syncGmailPage(db, 'alice', 'mail', provider({ ...page(), incomplete: [issue('gone')] }))
    await syncGmailPage(db, 'alice', 'mail', provider(null))
    await syncGmailPage(db, 'alice', 'mail', { read: async () => { throw new GmailCursorExpired() } })
    await syncGmailPage(db, 'alice', 'mail', provider(page([], '30')))
    await syncGmailPage(db, 'alice', 'mail', provider(null))
    assert.equal((await db.prepare('SELECT count(*) AS n FROM gmail_sync_issues').first())?.n, 0)
  } finally { await f.close() }
})

test('full pages deduplicate, then history pagination preserves its starting cursor', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    await syncGmailPage(db, 'alice', 'mail', provider(page([mail('a')], '10', 'next')))
    let request: GmailSyncRequest | undefined
    await syncGmailPage(db, 'alice', 'mail', { read: async input => { request = input; return page([mail('a', 'Updated'), mail('b')]) } })
    assert.deepEqual(request, { subject: 'subject', mode: 'full', cursor: '10', pageToken: 'next', limit: 25 })
    await syncGmailPage(db, 'alice', 'mail', provider(null)) // Pruning does not call the provider.
    await syncGmailPage(db, 'alice', 'mail', provider(page([], '20', 'history-next', ['b'])))
    const result = await syncGmailPage(db, 'alice', 'mail', { read: async input => { request = input; return page([], '20') } })
    assert.equal(request?.cursor, '10'); assert.equal(request?.pageToken, 'history-next')
    assert.equal(result.status, 'caught_up')
    assert.deepEqual((await db.prepare('SELECT id,body FROM messages').all()).results, [{ id: 'a', body: 'Updated' }])
    assert.equal((await db.prepare('SELECT cursor FROM gmail_sync').first())?.cursor, '20')
    assert.equal((await db.prepare('SELECT count(*) AS n FROM contacts').first())?.n, 0)
  } finally { await f.close() }
})
test('expired history resets and rescans; pruning preserves manually imported messages', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    await syncGmailPage(db, 'alice', 'mail', provider(page([mail('old')])))
    await syncGmailPage(db, 'alice', 'mail', provider(null))
    await db.prepare("INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at) VALUES('alice','mail','manual','t','x@example.com','','',1)").run()
    const reset = await syncGmailPage(db, 'alice', 'mail', { read: async () => { throw new GmailCursorExpired() } })
    assert.equal(reset.status, 'reset')
    await syncGmailPage(db, 'alice', 'mail', provider(page([mail('new')], '30')))
    await syncGmailPage(db, 'alice', 'mail', provider(null))
    assert.deepEqual((await db.prepare('SELECT id FROM messages ORDER BY id').all()).results, [{ id: 'manual' }, { id: 'new' }])
  } finally { await f.close() }
})
test('invalid and failed pages leave the cursor and messages untouched', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    for (const invalid of [null, page([{ ...mail('bad-date'), at: 8_640_000_000_000_001 }]),
      page([mail('a'), mail('a')]), page(Array.from({ length: 26 }, (_, i) => mail(`m${i}`))),
      page(Array.from({ length: 12 }, (_, i) => mail(`m${i}`, 'x'.repeat(100_000))))]) {
      await assert.rejects(syncGmailPage(db, 'alice', 'mail', provider(invalid)), /sync_provider_invalid/)
    }
    await assert.rejects(syncGmailPage(db, 'alice', 'mail', { read: async () => { throw new Error('network') } }), /network/)
    assert.equal((await db.prepare('SELECT version FROM gmail_sync').first())?.version, 0)
    assert.equal((await db.prepare('SELECT count(*) AS n FROM messages').first())?.n, 0)
    await syncGmailPage(db, 'alice', 'mail', provider(page([], '10', 'next')))
    await assert.rejects(syncGmailPage(db, 'alice', 'mail', provider(page([], '10', 'next'))), /sync_provider_invalid/)
    await assert.rejects(syncGmailPage(db, 'alice', 'mail', provider(page([], 'different'))), /sync_provider_invalid/)
  } finally { await f.close() }
})
test('ownership rejects reads and disconnect/reconnect fences an in-flight page', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    let called = false
    await assert.rejects(syncGmailPage(db, 'bob', 'mail', { read: async () => { called = true; return page() } }), /mailbox_not_found/)
    assert.equal(called, false)
    let release!: (value: unknown) => void; let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const pending = syncGmailPage(db, 'alice', 'mail', { read: () => { started(); return new Promise(resolve => { release = resolve }) } })
    await ready
    await db.prepare("UPDATE mailboxes SET connected=0 WHERE owner='alice' AND id='mail'").run()
    await db.prepare("UPDATE mailboxes SET connected=1 WHERE owner='alice' AND id='mail'").run()
    release({ ...page([mail('stale')]), incomplete: [{ id: 'bad', reason: 'message_content_unsupported' }] })
    await assert.rejects(pending, /sync_conflict/)
    assert.equal((await db.prepare('SELECT count(*) AS n FROM messages').first())?.n, 0)
    assert.equal((await db.prepare('SELECT count(*) AS n FROM gmail_sync_issues').first())?.n, 0)
  } finally { await f.close() }
})
test('two workers reading the same cursor cannot overwrite the winning page', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    let release!: (value: unknown) => void; let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const pending = syncGmailPage(db, 'alice', 'mail', { read: () => { started(); return new Promise(resolve => { release = resolve }) } })
    await ready
    await syncGmailPage(db, 'alice', 'mail', provider(page([mail('winner')])))
    release(page([mail('loser')]))
    await assert.rejects(pending, /sync_conflict/)
    assert.deepEqual((await db.prepare('SELECT id FROM messages').all()).results, [{ id: 'winner' }])
  } finally { await f.close() }
})

test('provider ID collisions preserve imported content through history deletion and rescan', async () => {
  const f = await setup(); const db = f.env.DB
  try {
    await db.prepare("INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at) VALUES('alice','mail','manual','t','x@example.com','','Imported',1)").run()
    assert.equal((await syncGmailPage(db, 'alice', 'mail', provider(page([mail('manual', 'Provider')])))).imported, 0)
    await syncGmailPage(db, 'alice', 'mail', provider(null))
    assert.equal((await syncGmailPage(db, 'alice', 'mail', provider(page([], '20', null, ['manual', 'absent'])))).deleted, 0)
    await syncGmailPage(db, 'alice', 'mail', { read: async () => { throw new GmailCursorExpired() } })
    await syncGmailPage(db, 'alice', 'mail', provider(page([], '30')))
    await syncGmailPage(db, 'alice', 'mail', provider(null))
    assert.deepEqual((await db.prepare('SELECT id,body,gmail_epoch FROM messages').all()).results,
      [{ id: 'manual', body: 'Imported', gmail_epoch: null }])
  } finally { await f.close() }
})

for (const change of ['revoke', 'replace'] as const) test(`credential ${change} fences an in-flight page and rejects stale reads`, async () => {
  const f = await setup(); const db = f.env.DB
  try {
    let release!: (value: unknown) => void; let started!: () => void
    const ready = new Promise<void>(resolve => { started = resolve })
    const pending = syncGmailPage(db, 'alice', 'mail', { read: () => { started(); return new Promise(resolve => { release = resolve }) } })
    await ready
    await db.prepare('UPDATE provider_credentials SET revision=revision+1,sealed=? WHERE owner=? AND id=?')
      .bind(change === 'revoke' ? null : 'replacement-ciphertext', 'alice', credential.id).run()
    release(page([mail('stale')]))
    await assert.rejects(pending, /sync_conflict/)
    assert.equal((await db.prepare('SELECT count(*) AS n FROM messages').first())?.n, 0)
    assert.equal((await db.prepare('SELECT version FROM gmail_sync').first())?.version, 0)
    let called = false
    await assert.rejects(syncGmailPage(db, 'alice', 'mail', { read: async () => { called = true; return page() } }), /sync_credential_unavailable/)
    assert.equal(called, false)
    if (change === 'replace') {
      await syncWithCredential(db, 'alice', 'mail', provider(page([mail('fresh')])), { ...credential, revision: 2 })
      assert.equal((await db.prepare('SELECT id FROM messages').first())?.id, 'fresh')
    }
  } finally { await f.close() }
})
