import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SendLedger } from '../ledger'
import { DurableFakeProvider } from '../providers/durableFake'
import { draft, fixture, now } from './fixture'

// AIDEV-NOTE: The assertions cover atomic claims, rolling quota and uncertain acceptance through real D1 SQL.
test('concurrent approvals reserve only 30 recipients; duplicate jobs send once', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const intents = await Promise.all(['one', 'two'].map(key => ledger.create('alice', draft(key, 20), now)))
    const approvals = await Promise.allSettled(intents.map(i => ledger.approve('alice', i.id, i.revision, now, 3600000)))
    assert.equal(approvals.filter(result => result.status === 'fulfilled').length, 1)
    const i = intents[approvals.findIndex(result => result.status === 'fulfilled')]!
    const provider = new DurableFakeProvider(f.env.DB)
    await Promise.all([ledger.dispatch('alice', i.id, provider, now), ledger.dispatch('alice', i.id, provider, now)])
    const row = await f.env.DB.prepare('SELECT status,attempts FROM send_intents WHERE id=?').bind(i.id).first()
    assert.equal(row?.status, 'accepted'); assert.equal(row?.attempts, 1)
    const late = await ledger.create('alice', draft('later', 20), now + 86400000)
    await ledger.approve('alice', late.id, late.revision, now + 86400000, 3600000)
  } finally { await f.close() }
})
test('ambiguous acceptance survives provider restart, never resends and reconciles positively', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const i = await ledger.create('alice', draft('ambiguous', 30), now)
    await ledger.approve('alice', i.id, i.revision, now, 3600000)
    await ledger.dispatch('alice', i.id, new DurableFakeProvider(f.env.DB, 'ambiguous'), now)
    const blocked = await ledger.create('alice', draft('blocked'), now)
    await assert.rejects(ledger.approve('alice', blocked.id, blocked.revision, now + 86400001, 3600000), /quota_exceeded/)
    await ledger.dispatch('alice', i.id, new DurableFakeProvider(f.env.DB), now + 86400001)
    await ledger.reconcile('alice', i.id, new DurableFakeProvider(f.env.DB), now + 86400001)
    const row = await f.env.DB.prepare('SELECT status,attempts FROM send_intents WHERE id=?').bind(i.id).first()
    assert.equal(row?.status, 'accepted'); assert.equal(row?.attempts, 1)
  } finally { await f.close() }
})
test('revisions, ownership, cancellation and idempotency conflicts are enforced', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const i = await ledger.create('alice', draft('stable'), now)
    assert.equal((await ledger.create('alice', draft('stable'), now + 1)).id, i.id)
    await assert.rejects(ledger.create('alice', { ...draft('stable'), body: 'changed' }, now), /idempotency_conflict/)
    await assert.rejects(ledger.create('bob', draft('cross-owner'), now), /mailbox_not_found/)
    await assert.rejects(ledger.approve('alice', i.id, '0'.repeat(64), now, 3600000), /approval_conflict/)
    await ledger.cancel('alice', i.id, now)
    await ledger.dispatch('alice', i.id, new DurableFakeProvider(f.env.DB), now)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(i.id).first())?.status, 'cancelled')
  } finally { await f.close() }
})
test('revocation, AI permission, expired approval and missing restore pause fail closed', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const ai = await ledger.create('alice', draft('ai', 1, 'ai'), now)
    await assert.rejects(ledger.approve('alice', ai.id, ai.revision, now, 3600000), /mailbox_permission/)
    const i = await ledger.create('alice', draft('revoked'), now)
    await ledger.approve('alice', i.id, i.revision, now, 3600000)
    await f.env.DB.prepare('DELETE FROM runtime_controls').run()
    await assert.rejects(ledger.dispatch('alice', i.id, new DurableFakeProvider(f.env.DB), now), /dispatch_paused/)
    await f.env.DB.prepare('INSERT INTO runtime_controls VALUES(1,0)').run()
    await f.env.DB.prepare('UPDATE mailboxes SET send_enabled=0').run()
    await assert.rejects(ledger.dispatch('alice', i.id, new DurableFakeProvider(f.env.DB), now), /mailbox_permission/)
    await f.env.DB.prepare('UPDATE mailboxes SET send_enabled=1').run()
    await assert.rejects(ledger.dispatch('alice', i.id, new DurableFakeProvider(f.env.DB), now + 3600000), /approval_expired/)
    await ledger.recover(now + 3600000)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(i.id).first())?.status, 'cancelled')
  } finally { await f.close() }
})
