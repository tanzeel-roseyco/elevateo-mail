import test from 'node:test'
import assert from 'node:assert/strict'
import { importRoute } from '../importRoute'
import { sha256 } from '../core'
import { fixture, now, token } from './fixture'

const path = '/v1/mailboxes/mail/import'
const message = { id: 'source-1', threadId: 'thread-1', sender: 'sender@example.com', subject: 'History', body: 'Plain text', at: now }
const post = (body: unknown) => new Request(`https://app.test${path}`, { method: 'POST',
  headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
async function setup() {
  const f = await fixture()
  return { ...f, session: { owner: 'alice', token_hash: await sha256(token), expires_at: now + 86_400_000 } }
}

// AIDEV-NOTE: Real D1 verifies whole-request retry semantics and ownership; no provider or credentials are required.
test('historical import is immutable, retry-safe and independent of Gmail cache provenance', async () => {
  const f = await setup()
  try {
    const run = async (messages: typeof message[]) => (await importRoute(post({ messages }), path, f.session, f.env.DB, now))!.json()
    assert.deepEqual(await run([message]), { processed: 1, imported: 1, unchanged: 0 })
    assert.deepEqual(await run([message]), { processed: 1, imported: 0, unchanged: 1 })
    const saved = await f.env.DB.prepare("SELECT id,thread_id,body,gmail_epoch FROM messages WHERE owner='alice'").first()
    assert.deepEqual(saved, { id: `import_${await sha256(message.id)}`, thread_id: `import_${await sha256(message.threadId)}`,
      body: message.body, gmail_epoch: null })
    await assert.rejects(run([{ ...message, body: 'Changed' }, { ...message, id: 'new' }]), /import_id_conflict/)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM messages').first())?.n, 1)
    // Sync reset/prune intentionally targets non-null epochs, leaving manually imported snapshots intact.
    await f.env.DB.prepare("DELETE FROM messages WHERE owner='alice' AND gmail_epoch IS NOT NULL").run()
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM messages').first())?.n, 1)
  } finally { await f.close() }
})

test('import rejects foreign mailboxes, invalid input, duplicate IDs and oversized bodies', async () => {
  const f = await setup()
  try {
    await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('bob','foreign','fake','bob','bob@example.com')").run()
    await assert.rejects(importRoute(post({ messages: [message] }), '/v1/mailboxes/foreign/import', f.session, f.env.DB, now), /mailbox_not_found/)
    for (const messages of [[], [{ ...message, sender: 'invalid' }], [{ ...message, at: 8_640_000_000_000_001 }],
      Array.from({ length: 26 }, (_, i) => ({ ...message, id: `id-${i}` }))]) {
      await assert.rejects(importRoute(post({ messages }), path, f.session, f.env.DB, now))
    }
    await assert.rejects(importRoute(post({ messages: [message, message] }), path, f.session, f.env.DB, now), /duplicate_import_id/)
    await assert.rejects(importRoute(post({ messages: [{ ...message, body: 'x'.repeat(140_000) }] }), path, f.session, f.env.DB, now), /body_too_large/)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM messages').first())?.n, 0)
  } finally { await f.close() }
})

test('session expiring while import body is read cannot commit messages', async () => {
  const f = await setup()
  try {
    const request = new Request(`https://app.test${path}`, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: new ReadableStream({ async start(controller) {
        await f.env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind(now, f.session.token_hash).run()
        controller.enqueue(new TextEncoder().encode(JSON.stringify({ messages: [message] }))); controller.close()
      } }), duplex: 'half' } as RequestInit)
    await assert.rejects(importRoute(request, path, f.session, f.env.DB, now), /unauthorized/)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM messages').first())?.n, 0)
  } finally { await f.close() }
})
