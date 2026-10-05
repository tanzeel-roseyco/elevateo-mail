import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrap } from '../local/bootstrap'
import { IntegrationError, MailHttpClient } from '../integration/client'
import { sha256 } from '../core'

// AIDEV-NOTE: All requests cross a real HTTP socket into the bundled Worker and workerd D1 inside Docker.
async function setup(consume = true) {
  const directory = await mkdtemp(join(tmpdir(), 'elevateo-http-'))
  const local = await bootstrap(directory, true, consume)
  try {
  const sessions = JSON.parse(await readFile(join(directory, 'fixture-sessions.json'), 'utf8')) as { alice: string; bob: string }
  const alice = new MailHttpClient(local.url, sessions.alice), bob = new MailHttpClient(local.url, sessions.bob)
  const mailbox = (await alice.mailboxes()).items[0]!
  return { ...local, alice, bob, mailbox, sessions, directory,
    cleanup: async () => { await local.close(); await rm(directory, { recursive: true, force: true }) } }
  } catch (error) { await local.close(); await rm(directory, { recursive: true, force: true }); throw error }
}
function input(mailboxId: string, key: string, count = 1) {
  return { mailboxId, to: Array.from({ length: count }, (_, i) => `synthetic${i}@example.com`), cc: [], bcc: [],
    subject: 'Synthetic', body: 'Plain synthetic body', kind: 'manual', revision: 1, idempotencyKey: key }
}
function code(expected: string) {
  return (error: unknown) => error instanceof IntegrationError && error.code === expected
}
async function accepted(client: MailHttpClient, id: string) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const result = await client.inspect(id)
    if (result.intent.status === 'accepted') return result
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Simulated acceptance deadline exceeded')
}
test('real HTTP journey, pagination, duplicate/lost responses and persistent reload', async () => {
  const f = await setup()
  let closed = false
  try {
    assert.equal((await f.alice.capabilities()).features.inboxSync, false)
    assert.equal(f.mailbox.address, 'alice+pilot@example.com')
    const page = await f.alice.messages(f.mailbox.id, undefined, 2)
    assert.equal(page.items.length, 2); assert.ok(page.next)
    assert.equal((await f.alice.messages(f.mailbox.id, page.next!, 2)).items.length, 1)
    // AIDEV-NOTE: Internal sync metadata added by migrations stays outside the stable public message contract.
    await f.env.DB.prepare('UPDATE messages SET gmail_epoch=? WHERE owner=? AND mailbox_id=? AND id=?')
      .bind('private-sync-epoch', 'alice', f.mailbox.id, page.items[0]!.id).run()
    const detail = await f.alice.body(f.mailbox.id, page.items[0]!.id)
    assert.equal(detail.contentType, 'text/plain')
    assert.equal(detail.message.body, '<b>Untrusted synthetic body</b>')
    assert.equal('gmail_epoch' in detail.message, false)
    assert.equal(detail.incomplete, false)
    await f.env.DB.prepare('INSERT INTO gmail_sync_issues(owner,mailbox_id,message_id,reason,epoch) VALUES(?,?,?,?,?)')
      .bind('alice', f.mailbox.id, page.items[0]!.id, 'message_content_unsupported', 'private-sync-epoch').run()
    assert.equal((await f.alice.body(f.mailbox.id, page.items[0]!.id)).incomplete, true)
    assert.equal((await f.alice.body(f.mailbox.id, page.items[1]!.id)).incomplete, false)
    await assert.rejects(f.bob.body(f.mailbox.id, page.items[0]!.id), code('message_not_found'))
    const payload = input(f.mailbox.id, 'http-replay')
    const intent = await f.alice.create(payload)
    assert.equal((await f.alice.create(payload)).id, intent.id)
    await assert.rejects(f.alice.create({ ...payload, body: 'Changed' }), code('idempotency_conflict'))
    await assert.rejects(f.alice.approve(intent.id, 'b'.repeat(64)), code('approval_conflict'))
    // A lost successful response is handled by inspect, never by replacing the durable intent.
    const lossy = new MailHttpClient(f.url, f.sessions.alice, async (url, init) => {
      await fetch(url, init); throw new Error('Synthetic lost HTTP response')
    })
    await assert.rejects(lossy.approve(intent.id, intent.revision), /lost HTTP response/)
    await accepted(f.alice, intent.id)
    await assert.rejects(f.alice.approve(intent.id, intent.revision), code('approval_conflict'))
    assert.equal((await f.alice.quota(f.mailbox.id)).mailbox.acceptedUsage, 1)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{ n: number }>())?.n, 1)
    await f.close(); closed = true
    const reloaded = await bootstrap(f.directory, false)
    try {
      const client = new MailHttpClient(reloaded.url, f.sessions.alice)
      assert.equal((await client.inspect(intent.id)).intent.status, 'accepted')
      assert.equal((await client.quota(f.mailbox.id)).mailbox.acceptedUsage, 1)
    } finally { await reloaded.close() }
  } finally {
    if (!closed) await f.close()
    await rm(f.directory, { recursive: true, force: true })
  }
})
test('two-user isolation, session expiry/revocation and no public minting route', async () => {
  const f = await setup()
  try {
    const intent = await f.alice.create(input(f.mailbox.id, 'isolation'))
    await assert.rejects(f.bob.inspect(intent.id), code('intent_not_found'))
    await assert.rejects(f.bob.quota(f.mailbox.id), code('mailbox_not_found'))
    await assert.rejects(f.bob.body(f.mailbox.id, 'fixture-0'), code('message_not_found'))
    await assert.rejects(f.bob.create(input(f.mailbox.id, 'foreign')), code('mailbox_not_found'))
    assert.equal((await f.bob.messages(f.mailbox.id)).items.length, 0)
    const mint = await fetch(new URL('/v1/sessions', f.url), { method: 'POST', headers: { authorization: `Bearer ${f.sessions.alice}` } })
    assert.equal(mint.status, 404)
    await f.env.DB.prepare('UPDATE sessions SET expires_at=0 WHERE owner=?').bind('alice').run()
    await assert.rejects(f.alice.capabilities(), code('unauthorized'))
    await f.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(f.sessions.bob)).run()
    await assert.rejects(f.bob.mailboxes(), code('unauthorized'))
  } finally { await f.cleanup() }
})
test('HTTP concurrent boundary, cancellation, revocation, suppression and pause', async () => {
  const f = await setup(false)
  try {
    const [first, second] = await Promise.all([
      f.alice.create(input(f.mailbox.id, 'race-one', 20)), f.alice.create(input(f.mailbox.id, 'race-two', 20)),
    ])
    const results = await Promise.allSettled([f.alice.approve(first.id, first.revision), f.alice.approve(second.id, second.revision)])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    const winner = results[0]!.status === 'fulfilled' ? first : second
    assert.equal((await f.alice.quota(f.mailbox.id)).mailbox.heldReservations, 20)
    await f.alice.cancel(winner.id)
    assert.equal((await f.alice.quota(f.mailbox.id)).mailbox.remaining, 30)
    await f.alice.permissions(f.mailbox.id, { connected: true, sendEnabled: false, aiRead: false, aiDraft: true, aiSend: false })
    const revoked = await f.alice.create(input(f.mailbox.id, 'revoked'))
    await assert.rejects(f.alice.approve(revoked.id, revoked.revision), code('mailbox_permission'))
    await f.alice.permissions(f.mailbox.id, { connected: true, sendEnabled: true, aiRead: false, aiDraft: false, aiSend: false })
    await f.env.DB.prepare('INSERT INTO suppressions VALUES(?,?,?,?)').bind('alice','synthetic0@example.com','fixture',Date.now()).run()
    await assert.rejects(f.alice.approve(revoked.id, revoked.revision), code('suppressed'))
    await f.env.DB.prepare('DELETE FROM suppressions WHERE owner=?').bind('alice').run()
    await f.env.DB.prepare('UPDATE runtime_controls SET dispatch_paused=1 WHERE id=1').run()
    assert.equal((await f.alice.capabilities()).dispatchPaused, true)
    await f.alice.approve(revoked.id, revoked.revision)
    assert.equal((await f.alice.inspect(revoked.id)).intent.status, 'pending')
    await f.alice.cancel(revoked.id)
    assert.equal((await f.alice.inspect(revoked.id)).intent.status, 'cancelled')
  } finally { await f.cleanup() }
})
