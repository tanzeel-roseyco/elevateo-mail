import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker, { relay } from '../worker'
import { SendLedger } from '../ledger'
import { DurableFakeProvider } from '../providers/durableFake'
import { draft, fixture, now } from './fixture'

test('unknown Resend records cannot starve durable fake reconciliation', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    for (let index = 0; index < 21; index++) {
      const intent = await ledger.create('alice', draft(`mixed-${index}`), now)
      await ledger.approve('alice', intent.id, intent.revision, now, 3600000)
      await ledger.dispatch('alice', intent.id, new DurableFakeProvider(f.env.DB, 'ambiguous'), now)
      if (index < 20) {
        // AIDEV-NOTE: Replace only fixture bindings to model older unresolved external receipts without network calls.
        await f.env.DB.batch([
          f.env.DB.prepare('DELETE FROM send_bindings WHERE owner=? AND intent_id=?').bind('alice', intent.id),
          f.env.DB.prepare("INSERT INTO send_bindings(owner,intent_id,provider,address) VALUES('alice',?,'resend','alice@example.com')").bind(intent.id),
          f.env.DB.prepare('UPDATE send_intents SET reconcile_at=? WHERE id=?').bind(now - 1, intent.id),
        ])
      }
    }
    await relay(f.env, now + 300001)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM send_intents WHERE status='accepted'").first())?.n, 1)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM send_intents WHERE status='unknown' AND reconcile_attempts=0").first())?.n, 20)
  } finally { await f.close() }
})

// AIDEV-NOTE: Exercise actual Cron/Queue entry points; every receipt stays in the durable fake provider.
function batch(bodies: unknown[], acknowledged: string[], retried: string[]): MessageBatch<unknown> {
  return { queue: 'scheduler-test', messages: bodies.map((body, index) => ({
    body, id: String(index), timestamp: new Date(now), attempts: 1,
    ack() { acknowledged.push(String(index)) }, retry() { retried.push(String(index)) },
  })), metadata: { metrics: { backlogCount: bodies.length, backlogBytes: 0 } }, ackAll() {}, retryAll() {} }
}

test('future approved intent waits until due and duplicate queue delivery sends once', async () => {
  const f = await fixture(); const clock = Date.now; const jobs: unknown[] = []
  try {
    const due = now + 86_400_000
    const ledger = new SendLedger(f.env.DB)
    const scheduled = await ledger.create('alice', { ...draft('scheduled-boundary'), scheduledAt: new Date(due).toISOString() }, now)
    await ledger.approve('alice', scheduled.id, scheduled.revision, now, 3600000)
    await ledger.create('alice', { ...draft('unapproved-boundary'), scheduledAt: new Date(due).toISOString() }, now)
    const env: Env = { ...f.env, SEND_QUEUE: { ...f.env.SEND_QUEUE, send: async body => {
      jobs.push(body); return { metadata: { metrics: { backlogCount: jobs.length, backlogBytes: 0 } } }
    } } }
    await relay(env, due - 1)
    assert.deepEqual(jobs, [])
    Date.now = () => due - 1
    await worker.queue(batch([{ owner: 'alice', id: scheduled.id }], [], []), env)
    assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 0)
    Date.now = () => due
    await worker.scheduled({} as ScheduledController, env)
    assert.deepEqual(jobs, [{ owner: 'alice', id: scheduled.id }])
    const acknowledged: string[] = []; const retried: string[] = []
    await worker.queue(batch([...jobs, ...jobs], acknowledged, retried), env)
    assert.equal(acknowledged.length, 2); assert.deepEqual(retried, [])
    assert.deepEqual(await env.DB.prepare('SELECT status,attempts FROM send_intents WHERE owner=? AND id=?')
      .bind('alice', scheduled.id).first(), { status: 'accepted', attempts: 1 })
    assert.equal((await env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 1)
  } finally { Date.now = clock; await f.close() }
})

test('queue bounds work to ten and retries overflow without consuming its reservation', async () => {
  const f = await fixture(); const clock = Date.now
  try {
    Date.now = () => now
    const ledger = new SendLedger(f.env.DB); const jobs: { owner: string; id: string }[] = []
    for (let index = 0; index < 11; index++) {
      const intent = await ledger.create('alice', draft(`batch-${index}`), now)
      await ledger.approve('alice', intent.id, intent.revision, now, 3600000)
      jobs.push({ owner: 'alice', id: intent.id })
    }
    const acknowledged: string[] = []; const retried: string[] = []
    await worker.queue(batch(jobs, acknowledged, retried), f.env)
    assert.equal(acknowledged.length, 10); assert.deepEqual(retried, ['10'])
    assert.deepEqual(await f.env.DB.prepare('SELECT status,attempts FROM send_intents WHERE owner=? AND id=?')
      .bind('alice', jobs[10]!.id).first(), { status: 'pending', attempts: 0 })
    await worker.queue(batch([jobs[10]], [], []), f.env)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 11)
  } finally { Date.now = clock; await f.close() }
})

test('foreign-owner and malformed queue jobs cannot dispatch an approved intent', async () => {
  const f = await fixture(); const clock = Date.now
  try {
    Date.now = () => now
    const ledger = new SendLedger(f.env.DB)
    const intent = await ledger.create('alice', draft('owner-boundary'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 3600000)
    const acknowledged: string[] = []; const retried: string[] = []
    await worker.queue(batch([{ owner: 'bob', id: intent.id }, null, { owner: 'alice', id: intent.id, extra: true }],
      acknowledged, retried), f.env)
    assert.equal(acknowledged.length, 3); assert.deepEqual(retried, [])
    assert.deepEqual(await f.env.DB.prepare('SELECT status,attempts FROM send_intents WHERE owner=? AND id=?')
      .bind('alice', intent.id).first(), { status: 'pending', attempts: 0 })
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 0)
  } finally { Date.now = clock; await f.close() }
})
