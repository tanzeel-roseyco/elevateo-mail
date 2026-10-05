import { test } from 'node:test'
import assert from 'node:assert/strict'
import worker, { relay } from '../worker'
import { draft, fixture, now, request } from './fixture'

// AIDEV-NOTE: Faults happen at operational boundaries, including a receipt committed before a failed outcome write.
async function approved(env: Env, key: string) {
  const created = await request(env, '/v1/send-intents', 'POST', draft(key))
  const intent = await created.json() as { id: string; revision: string }
  assert.equal((await request(env, `/v1/send-intents/${intent.id}/approve`, 'POST', { revision: intent.revision })).status, 200)
  return intent
}
async function queue(env: Env, id: string) {
  let retries = 0
  await worker.queue({ queue: 'test', messages: [{ id: 'job', body: { owner: 'alice', id }, timestamp: new Date(),
    attempts: 1, ack() {}, retry() { retries++ } }],
    metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } }, ackAll() {}, retryAll() {} }, env)
  return retries
}
test('scheduler reconciles interrupted receipt without another provider call, even paused', async () => {
  const f = await fixture(); const clock = Date.now
  try {
    Date.now = () => now
    const intent = await approved(f.env, 'receipt-crash')
    await f.env.DB.prepare(`CREATE TRIGGER simulate_crash BEFORE UPDATE OF status ON send_intents
      WHEN NEW.status='accepted' BEGIN SELECT RAISE(ABORT,'simulated_crash'); END;`).run()
    assert.equal(await queue(f.env, intent.id), 1)
    await f.env.DB.prepare('DROP TRIGGER simulate_crash').run()
    await f.env.DB.prepare('UPDATE send_intents SET updated_at=? WHERE id=?').bind(now - 60_001, intent.id).run()
    await worker.scheduled({} as ScheduledController, { ...f.env, DISPATCH_PAUSED: 'true' })
    assert.deepEqual(await f.env.DB.prepare('SELECT status,attempts FROM send_intents WHERE id=?').bind(intent.id).first(),
      { status: 'accepted', attempts: 1 })
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{ n: number }>())?.n, 1)
    assert.equal(await queue(f.env, intent.id), 0)
  } finally { Date.now = clock; await f.close() }
})
test('minimum TTL approved immediately after a tick enqueues immediately', async () => {
  const f = await fixture(); const jobs: unknown[] = []
  try {
    const env: Env & { APPROVAL_TTL_SECONDS: string } = { ...f.env, APPROVAL_TTL_SECONDS: '60', SEND_QUEUE: { ...f.env.SEND_QUEUE,
      send: async body => { jobs.push(body); return { metadata: { metrics: { backlogCount: 0, backlogBytes: 0 } } } } } }
    await relay(env, now - 1)
    const intent = await approved(env, 'after-tick')
    assert.deepEqual(jobs, [{ owner: 'alice', id: intent.id }])
    const clock = Date.now
    try { Date.now = () => now + 59_000; assert.equal(await queue(env, intent.id), 0) }
    finally { Date.now = clock }
    assert.equal((await request(env, `/v1/send-intents/${intent.id}`).then(r => r.json()) as { intent: { status: string } }).intent.status, 'accepted')
  } finally { await f.close() }
})
test('invalid pending envelopes reject before provider; invalid uncertain envelopes retain reservations', async () => {
  const f = await fixture(); const clock = Date.now
  try {
    Date.now = () => now
    const intent = await approved(f.env, 'invalid-pending')
    await f.env.DB.prepare('DROP TRIGGER immutable_send').run()
    await f.env.DB.prepare("UPDATE send_intents SET envelope='{}' WHERE id=?").bind(intent.id).run()
    await queue(f.env, intent.id)
    const result = await f.env.DB.prepare('SELECT status,error_code,correlation_id FROM send_intents WHERE id=?').bind(intent.id).first()
    assert.equal(result?.status, 'rejected'); assert.equal(result?.error_code, 'invalid_envelope'); assert.ok(result?.correlation_id)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{ n: number }>())?.n, 0)
    await f.env.DB.prepare("UPDATE send_intents SET status='unknown' WHERE id=?").bind(intent.id).run()
    await relay(f.env, now)
    const quota = await request(f.env, '/v1/mailboxes/mail/quota').then(r => r.json()) as { mailbox: { heldReservations: number; reservationReleaseUnknown: boolean } }
    assert.equal(quota.mailbox.heldReservations, 1); assert.equal(quota.mailbox.reservationReleaseUnknown, true)
    assert.equal((await f.env.DB.prepare('SELECT status,error_code FROM send_intents WHERE id=?').bind(intent.id).first())?.error_code, 'invalid_envelope')
  } finally { Date.now = clock; await f.close() }
})
test('missing receipts remain unknown with bounded backoff and no blind resend', async () => {
  const f = await fixture(); const clock = Date.now
  try {
    Date.now = () => now
    const intent = await approved(f.env, 'no-receipt')
    await f.env.DB.prepare("UPDATE send_intents SET status='dispatching',dispatch_at=?,updated_at=?,attempts=1 WHERE id=?")
      .bind(now, now - 60_001, intent.id).run()
    for (let tick = 0; tick < 12; tick++) await relay(f.env, now + tick * 300_000)
    await queue(f.env, intent.id)
    assert.deepEqual(await f.env.DB.prepare('SELECT status,attempts,reconcile_attempts FROM send_intents WHERE id=?').bind(intent.id).first(),
      { status: 'unknown', attempts: 1, reconcile_attempts: 10 })
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{ n: number }>())?.n, 0)
  } finally { Date.now = clock; await f.close() }
})


test('queue rechecks suppression, pause and cancellation after approval', async () => {
  const f = await fixture(); const clock = Date.now
  try {
    Date.now = () => now
    const suppressed = await approved(f.env, 'suppressed-after-approval')
    await f.env.DB.prepare("INSERT INTO suppressions VALUES('alice','recipient0@example.com','complaint',?)").bind(now).run()
    assert.equal(await queue(f.env, suppressed.id), 0)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(suppressed.id).first())?.status, 'cancelled')
    await f.env.DB.prepare('DELETE FROM suppressions').run()
    const paused = await approved(f.env, 'pause-after-approval')
    await f.env.DB.prepare('UPDATE runtime_controls SET dispatch_paused=1').run()
    assert.equal(await queue(f.env, paused.id), 1)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(paused.id).first())?.status, 'pending')
    assert.equal((await request(f.env, `/v1/send-intents/${paused.id}/cancel`, 'POST')).status, 200)
    await f.env.DB.prepare('UPDATE runtime_controls SET dispatch_paused=0').run()
    assert.equal(await queue(f.env, paused.id), 0)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{n:number}>())?.n, 0)
    assert.equal((await request(f.env, '/v1/mailboxes/mail/quota').then(r => r.json()) as {mailbox:{heldReservations:number}}).mailbox.heldReservations, 0)
  } finally { Date.now = clock; await f.close() }
})
