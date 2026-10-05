import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now } from './fixture'
import { cleanupExpired, jobHealth, trackedJob } from '../maintenance'

test('cleanup is bounded and preserves current sessions and durable mailbox data', async () => {
  const f = await fixture()
  try {
    await f.env.DB.batch(Array.from({ length: 105 }, (_, i) => f.env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)')
      .bind(`expired${i}`, 'alice', now)))
    await cleanupExpired(f.env.DB, now)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM sessions').first<{ n: number }>())?.n, 6)
    await cleanupExpired(f.env.DB, now)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM sessions').first<{ n: number }>())?.n, 1)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM mailboxes').first<{ n: number }>())?.n, 1)
  } finally { await f.close() }
})

test('heartbeat exposes never-run, late and failed jobs without swallowing errors', async () => {
  const f = await fixture()
  try {
    assert.ok((await jobHealth(f.env.DB, now)).every(row => row.status === 'not_started'))
    await trackedJob(f.env.DB, 'dispatch', async () => {}, () => now)
    assert.equal((await jobHealth(f.env.DB, now))[0]?.status, 'healthy')
    assert.equal((await jobHealth(f.env.DB, now + 180_001))[0]?.status, 'late')
    await assert.rejects(trackedJob(f.env.DB, 'dispatch', async () => { throw new Error('offline') }, () => now + 1), /offline/u)
    assert.deepEqual((await jobHealth(f.env.DB, now + 2))[0], { name: 'dispatch', status: 'failed', lastSuccessAt: now })
  } finally { await f.close() }
})

test('an older completion cannot erase a newer failure', async () => {
  const f = await fixture()
  try {
    let release: () => void = () => { throw new Error('not started') }
    let started: () => void = () => {}
    const ready = new Promise<void>(resolve => { started = resolve })
    const old = trackedJob(f.env.DB, 'inbox', () => new Promise<void>(resolve => { release = resolve; started() }), () => now)
    await ready
    await assert.rejects(trackedJob(f.env.DB, 'inbox', async () => { throw new Error('newer failed') }, () => now), /newer failed/u)
    release(); await old
    assert.equal((await jobHealth(f.env.DB, now))[1]?.status, 'failed')
  } finally { await f.close() }
})
