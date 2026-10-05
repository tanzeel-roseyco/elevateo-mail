import { applyMigration } from '../local/migrations'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draft, fixture, now, request } from './fixture'
import worker, { relay } from '../worker'

// AIDEV-NOTE: Operational admission tests measure D1 calls and exercise reconnect/replacement without quota reset.
test('approval reports deferred queue failures and respects database pause', async () => {
  const f = await fixture(); let calls = 0
  try {
    const env: Env & { APPROVAL_TTL_SECONDS: string } = { ...f.env, APPROVAL_TTL_SECONDS: '60', SEND_QUEUE: { ...f.env.SEND_QUEUE,
      send: async () => { calls++; throw new Error('Synthetic queue outage') } } }
    const intent = await request(env, '/v1/send-intents', 'POST', draft('enqueue-failed')).then(r => r.json()) as { id: string; revision: string }
    const approval = await request(env, `/v1/send-intents/${intent.id}/approve`, 'POST', { revision: intent.revision })
    assert.equal(approval.status, 200)
    assert.deepEqual(await approval.json(), { saved: true, simulated: true, enqueue: 'deferred' })
    assert.equal(calls, 1)
    assert.equal((await env.DB.prepare('SELECT error_code FROM send_intents WHERE id=?').bind(intent.id).first())?.error_code, 'enqueue_deferred')
    await relay(env, now + 60_000)
    assert.equal((await env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(intent.id).first())?.status, 'cancelled')
    await env.DB.prepare('UPDATE runtime_controls SET dispatch_paused=1 WHERE id=1').run()
    const paused = await request(env, '/v1/send-intents', 'POST', draft('paused-enqueue')).then(r => r.json()) as { id: string; revision: string }
    assert.equal((await request(env, `/v1/send-intents/${paused.id}/approve`, 'POST', { revision: paused.revision })).status, 200)
    assert.equal(calls, 1)
  } finally { await f.close() }
})
test('structurally valid changed persisted content never reaches provider', async () => {
  const f = await fixture(); const clock = Date.now
  try {
    Date.now = () => now
    const intent = await request(f.env, '/v1/send-intents', 'POST', draft('corruption')).then(r => r.json()) as { id: string; revision: string }
    await request(f.env, `/v1/send-intents/${intent.id}/approve`, 'POST', { revision: intent.revision })
    await f.env.DB.prepare('DROP TRIGGER immutable_send').run()
    await f.env.DB.prepare("UPDATE send_intents SET envelope=json_set(envelope,'$.body','Changed after approval') WHERE id=?").bind(intent.id).run()
    await worker.queue({ queue: 'test', messages: [{ id: 'job', body: { owner: 'alice', id: intent.id }, timestamp: new Date(),
      attempts: 1, ack() {}, retry() { throw new Error('Invalid content must reject') } }],
      metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } }, ackAll() {}, retryAll() {} }, f.env)
    assert.equal((await f.env.DB.prepare('SELECT error_code FROM send_intents WHERE id=?').bind(intent.id).first())?.error_code, 'invalid_envelope')
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{ n: number }>())?.n, 0)
  } finally { Date.now = clock; await f.close() }
})
test('historical connections free active slots but replacement cannot bypass 300 owner quota', async () => {
  const f = await fixture()
  try {
    for (let index = 0; index < 10; index++) {
      const mailboxId = index ? `mail-${index}` : 'mail'
      if (index) assert.equal((await request(f.env, '/v1/mailboxes', 'POST', {
        subject: `subject-${index}`, address: `alice+${index}@example.com`, sendEnabled: true })).status, 201)
      const saved = await f.env.DB.prepare('SELECT id FROM mailboxes WHERE owner=? AND subject=?')
        .bind('alice', index ? `subject-${index}` : 'subject').first<{ id: string }>()
      const intent = await request(f.env, '/v1/send-intents', 'POST', { ...draft(`owner-${index}`, 30), mailboxId: saved?.id ?? mailboxId })
        .then(r => r.json()) as { id: string; revision: string }
      assert.equal((await request(f.env, `/v1/send-intents/${intent.id}/approve`, 'POST', { revision: intent.revision })).status, 200)
    }
    await f.env.DB.prepare('UPDATE mailboxes SET connected=0 WHERE owner=? AND id=?').bind('alice','mail').run()
    const replacement = await request(f.env, '/v1/mailboxes', 'POST', { subject: 'replacement', address: 'replacement@example.com', sendEnabled: true })
    assert.equal(replacement.status, 201)
    const replacementId = (await replacement.json() as { id: string }).id
    const intent = await request(f.env, '/v1/send-intents', 'POST', { ...draft('owner-overflow'), mailboxId: replacementId })
      .then(r => r.json()) as { id: string; revision: string }
    const response = await request(f.env, `/v1/send-intents/${intent.id}/approve`, 'POST', { revision: intent.revision })
    assert.equal(response.status, 409)
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'owner_quota_exceeded')
    assert.equal((await request(f.env, '/v1/mailboxes', 'POST', { subject: 'subject', address: 'alice@example.com', sendEnabled: true })).status, 409)
    await f.env.DB.prepare('UPDATE mailboxes SET connected=0 WHERE owner=? AND id=?').bind('alice',replacementId).run()
    const reconnected = await request(f.env, '/v1/mailboxes', 'POST', { subject: 'subject', address: 'alice@example.com', sendEnabled: true })
    assert.equal((await reconnected.json() as { id: string }).id, 'mail')
    assert.equal((await request(f.env, '/v1/mailboxes/mail/quota').then(r => r.json()) as { user: { heldReservations: number } }).user.heldReservations, 300)
  } finally { await f.close() }
})
test('representative authenticated operations have bounded measured D1 statement counts', async () => {
  const f = await fixture(); let operations = 0
  try {
    const observed = new Proxy(f.env.DB, { get(target, property) {
      if (property === 'prepare') return (sql: string) => { operations++; return target.prepare(sql) }
      const value: unknown = Reflect.get(target, property)
      return typeof value === 'function' ? value.bind(target) : value
    } })
    const env = { ...f.env, DB: observed }
    const counts: Record<string, number> = {}
    for (const [label, path] of [['capabilities','/v1/capabilities'],['mailboxes','/v1/mailboxes'],
      ['quota','/v1/mailboxes/mail/quota'],['messages','/v1/messages?mailboxId=mail']]) {
      operations = 0; assert.equal((await request(env, path!)).status, 200); counts[label!] = operations
    }
    assert.deepEqual(counts, { capabilities: 2, mailboxes: 2, quota: 3, messages: 2 })
    console.log('D1 statement counts (includes authentication): ' + JSON.stringify(counts))
    const plan = await env.DB.prepare(`EXPLAIN QUERY PLAN SELECT recipient_count FROM send_intents
      WHERE owner=? AND status='accepted' AND dispatch_at>?`).bind('alice',now - 86_400_000).all<{ detail: string }>()
    assert.ok(plan.results.some(row => row.detail.includes('owner_quota')))
  } finally { await f.close() }
})


test('offline migration failure rolls back schema and completion marker', async () => {
  const f = await fixture()
  try {
    await f.env.DB.prepare('CREATE TABLE local_migrations(name TEXT PRIMARY KEY)').run()
    await assert.rejects(applyMigration(f.env.DB, 'regression', 'CREATE TABLE partial_schema(id TEXT);\nINSERT INTO missing_table VALUES(1);'))
    assert.equal(await f.env.DB.prepare("SELECT name FROM sqlite_master WHERE name='partial_schema'").first(), null)
    assert.equal(await f.env.DB.prepare('SELECT name FROM local_migrations').first(), null)
    await applyMigration(f.env.DB, 'regression', 'CREATE TABLE partial_schema(id TEXT);')
    assert.ok(await f.env.DB.prepare('SELECT name FROM local_migrations').first())
  } finally { await f.close() }
})


test('losing a concurrent mailbox insert still applies requested send permission', async () => {
  const f = await fixture()
  try {
    let competing = false
    const observed = new Proxy(f.env.DB, { get(target, property) {
      if (property !== 'prepare') { const value: unknown = Reflect.get(target, property); return typeof value === 'function' ? value.bind(target) : value }
      return (sql: string) => {
        const statement = target.prepare(sql)
        if (!sql.startsWith('INSERT INTO mailboxes')) return statement
        return new Proxy(statement, { get(inner, method) {
          if (method === 'bind') return (...values: unknown[]) => {
            const bound = inner.bind(...values)
            return new Proxy(bound, { get(prepared, operation) {
              if (operation === 'run') return async () => {
                if (!competing) {
                  competing = true
                  assert.equal((await request(f.env, '/v1/mailboxes', 'POST', { subject: 'race', address: 'race@example.com', sendEnabled: true })).status, 201)
                }
                return prepared.run()
              }
              const value: unknown = Reflect.get(prepared, operation); return typeof value === 'function' ? value.bind(prepared) : value
            } })
          }
          const value: unknown = Reflect.get(inner, method); return typeof value === 'function' ? value.bind(inner) : value
        } })
      }
    } })
    const response = await request({ ...f.env, DB: observed }, '/v1/mailboxes', 'POST', { subject: 'race', address: 'race@example.com', sendEnabled: false })
    assert.equal(response.status, 200)
    assert.equal((await f.env.DB.prepare("SELECT send_enabled FROM mailboxes WHERE subject='race'").first<{send_enabled:number}>())?.send_enabled, 0)
  } finally { await f.close() }
})
