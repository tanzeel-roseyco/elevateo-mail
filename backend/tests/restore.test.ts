import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SendLedger } from '../ledger'
import { prepareRestoredDatabase } from '../recovery'
import { draft, fixture, now } from './fixture'

// AIDEV-NOTE: Complement recovery.test: prove restored ownership and suppression behaviour, not only row counts.
test('cold D1 restore preserves tenant boundaries, immutable keys and suppression enforcement', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elevateo-restore-isolation-'))
  let restored: Awaited<ReturnType<typeof fixture>> | undefined
  try {
    const source = await fixture(join(root, 'source'))
    let aliceId = ''
    let bobId = ''
    try {
      await source.env.DB.prepare(`INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled)
        VALUES('bob','mail','fake','bob-subject','bob@example.com',1)`).run()
      const ledger = new SendLedger(source.env.DB)
      aliceId = (await ledger.create('alice', draft('same_key'), now)).id
      bobId = (await ledger.create('bob', draft('same_key'), now)).id
      await source.env.DB.prepare("INSERT INTO suppressions VALUES('alice','recipient0@example.com','complaint',?)")
        .bind(now).run()
      await source.env.DB.prepare("INSERT INTO app_login VALUES('old-state','old-nonce','old-sealed',?)").bind(now + 60000).run()
      await source.env.DB.prepare("INSERT INTO connection_oauth VALUES('connection-state','alice','old-session','gmail','sealed',?)").bind(now + 60000).run()
      await source.env.DB.prepare("INSERT INTO job_health(name,started_at,run_id) VALUES('dispatch',?,'old-run')").bind(now).run()
      await source.env.DB.prepare(`INSERT INTO native_draft_tickets(ticket_hash,owner,session_hash,request_id,mailbox_id,message_ids,instruction,expires_at)
        VALUES('old-ticket','alice','old-session','request','mail','[]','private',?)`).bind(now + 60000).run()
    } finally { await source.close() }
    // Closed-writer physical snapshot; copying a running database would not prove a consistent backup.
    await cp(join(root, 'source'), join(root, 'backup'), { recursive: true })
    await cp(join(root, 'backup'), join(root, 'restored'), { recursive: true })
    restored = await fixture(join(root, 'restored'), false)
    await prepareRestoredDatabase(restored.env.DB, now + 1)
    const db = restored.env.DB
    for (const table of ['sessions', 'app_login', 'connection_oauth', 'native_draft_tickets', 'job_health']) {
      assert.equal((await db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first())?.count, 0)
    }
    const ledger = new SendLedger(db)
    const alice = await ledger.create('alice', draft('same_key'), now + 2)
    const bob = await ledger.create('bob', draft('same_key'), now + 2)
    assert.equal(alice.id, aliceId)
    assert.equal(bob.id, bobId)
    assert.notEqual(alice.id, bob.id)
    await assert.rejects(ledger.create('alice', { ...draft('same_key'), body: 'Changed' }, now + 2), /idempotency_conflict/)
    await assert.rejects(ledger.cancel('bob', alice.id, now + 2), /intent_not_found/)
    await assert.rejects(ledger.approve('alice', alice.id, alice.revision, now + 2, 3600000), /suppressed/)
    // The same recipient is permitted for Bob: Alice's suppression must neither vanish nor cross tenants.
    await ledger.approve('bob', bob.id, bob.revision, now + 2, 3600000)
    const rows = await db.prepare('SELECT owner,status FROM send_intents ORDER BY owner').all()
    assert.deepEqual(rows.results, [{ owner: 'alice', status: 'draft' }, { owner: 'bob', status: 'pending' }])
    assert.equal((await db.prepare('SELECT dispatch_paused FROM runtime_controls WHERE id=1').first())?.dispatch_paused, 1)
    assert.deepEqual((await db.prepare('SELECT owner,address FROM mailboxes ORDER BY owner').all()).results,
      [{ owner: 'alice', address: 'alice@example.com' }, { owner: 'bob', address: 'bob@example.com' }])
  } finally {
    try { await restored?.close() } finally { await rm(root, { recursive: true, force: true }) }
  }
})
