import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import worker, { relay } from '../worker'
import { SendLedger } from '../ledger'
import { DurableFakeProvider } from '../providers/durableFake'
import { prepareRestoredDatabase } from '../recovery'
import { draft, fixture, now } from './fixture'

// AIDEV-NOTE: This is a local persisted D1 restore rehearsal, not proof of independent production disaster recovery.
test('persisted D1 backup restores idempotency, suppression and pauses all stale claims', async () => {
  const root = await mkdtemp(join(tmpdir(), 'elevateo-restore-'))
  let restored: Awaited<ReturnType<typeof fixture>> | undefined
  try {
    const original = await fixture(join(root, 'original'))
    let id: string
    try {
      const ledger = new SendLedger(original.env.DB)
      const i = await ledger.create('alice', draft('restore'), now); id = i.id
      await ledger.approve('alice', i.id, i.revision, now, 3600000)
      await original.env.DB.prepare("UPDATE send_intents SET status='dispatching',dispatch_at=?,updated_at=? WHERE id=?").bind(now, now, id).run()
      await original.env.DB.prepare("INSERT INTO suppressions VALUES('alice','blocked@example.com','complaint',?)").bind(now).run()
    } finally { await original.close() }
    await cp(join(root, 'original'), join(root, 'backup'), { recursive: true })
    restored = await fixture(join(root, 'backup'), false)
    await prepareRestoredDatabase(restored.env.DB, now + 1)
    assert.equal((await restored.env.DB.prepare('SELECT dispatch_paused FROM runtime_controls').first())?.dispatch_paused, 1)
    assert.equal((await restored.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(id!).first())?.status, 'unknown')
    assert.equal((await new SendLedger(restored.env.DB).create('alice', draft('restore'), now + 1)).id, id!)
    assert.equal((await restored.env.DB.prepare('SELECT count(*) AS n FROM suppressions').first())?.n, 1)
  } finally { await restored?.close(); await rm(root, { recursive: true, force: true }) }
})
test('relay respects database pause and cancelled blocked page cannot starve later work', async () => {
  const f = await fixture()
  const clock = Date.now
  try {
    Date.now = () => now
    const ledger = new SendLedger(f.env.DB)
    for (let mailbox = 0; mailbox < 4; mailbox++) {
      if (mailbox) await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled) VALUES('alice',?,'fake',?,?,1)")
        .bind(`mail${mailbox}`, `subject${mailbox}`, `m${mailbox}@example.com`).run()
      for (let index = 0; index < 26; index++) {
        const i = await ledger.create('alice', { ...draft(`blocked-${mailbox}-${index}`), mailboxId: mailbox ? `mail${mailbox}` : 'mail' }, now)
        await ledger.approve('alice', i.id, i.revision, now, 3600000)
      }
    }
    await f.env.DB.prepare('UPDATE mailboxes SET send_enabled=0').run()
    const jobs = await f.env.DB.prepare("SELECT owner,id FROM send_intents WHERE status='pending' ORDER BY scheduled_at,id LIMIT 100")
      .all<{ owner: string; id: string }>()
    let acknowledgements = 0
    const messages: Message<unknown>[] = jobs.results.map(body => ({ body, id: body.id, timestamp: new Date(now), attempts: 1,
      ack: () => { acknowledgements++ }, retry: () => { throw new Error('revoked approval must not retry') } }))
    await worker.queue({ queue: 'test-send', messages, metadata: { metrics: { backlogCount: 104, backlogBytes: 0 } }, ackAll() {}, retryAll() {} }, f.env)
    assert.equal(acknowledgements, 100)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM send_intents WHERE status='pending'").first())?.n, 4)
    await f.env.DB.prepare('UPDATE runtime_controls SET dispatch_paused=1').run()
    let queued = 0
    const observedEnv: Env = { ...f.env, SEND_QUEUE: { ...f.env.SEND_QUEUE,
      send: async () => { queued++; return { metadata: { metrics: { backlogCount: queued, backlogBytes: 0 } } } } } }
    // AIDEV-NOTE: Observe producer calls; pending rows alone cannot prove the relay respected pause.
    await relay(observedEnv, now)
    assert.equal(queued, 0)
    await f.env.DB.prepare('DELETE FROM runtime_controls').run()
    await relay(observedEnv, now)
    assert.equal(queued, 0)
    await f.env.DB.prepare('UPDATE mailboxes SET send_enabled=1').run()
    await f.env.DB.prepare('INSERT INTO runtime_controls(id,dispatch_paused) VALUES(1,0)').run()
    await relay(observedEnv, now)
    assert.equal(queued, 4)
    const row = await f.env.DB.prepare("SELECT id FROM send_intents WHERE status='pending' LIMIT 1").first<{ id: string }>()
    await ledger.dispatch('alice', row!.id, new DurableFakeProvider(f.env.DB), now)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM send_intents WHERE status='accepted'").first())?.n, 1)
  } finally { Date.now = clock; await f.close() }
})
