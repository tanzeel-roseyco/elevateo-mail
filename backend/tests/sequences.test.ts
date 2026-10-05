import assert from 'node:assert/strict'
import test from 'node:test'
import { createSequence } from '../sequences'
import { SendLedger } from '../ledger'
import { DurableFakeProvider } from '../providers/durableFake'
import { fixture, now, request } from './fixture'

const input = { idempotencyKey: 'welcome-sequence', mailboxId: 'mail', recipient: 'client@example.com',
  steps: [1, 2, 3].map(index => ({ subject: `Step ${index}`, body: 'Opted-in follow-up',
    scheduledAt: new Date(now + index * 60_000).toISOString() })) }
async function setup(env: Env) {
  await env.DB.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')").run()
  await request(env, '/v1/contacts/import', 'POST', [{ email: input.recipient, consentSource: 'Signup', optedIn: true }])
}
test('sequence creation is atomic under concurrent retries, private and canonical', async () => {
  const f = await fixture()
  try {
    await setup(f.env)
    const create = (raw: unknown = input, at = now) => createSequence(f.env.DB, 'alice', 'campaign', raw, at)
    const [first, retry] = await Promise.all([create(), create({ ...input, recipient: 'CLIENT@example.com' })])
    assert.equal(first.id, retry.id)
    assert.equal(first.steps.length, 3)
    assert.ok(first.steps.every(step => step.status === 'draft'))
    assert.equal((await create(input, now + 86_400_000)).id, first.id)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM send_intents').first())?.n, 3)
    await assert.rejects(create({ ...input, steps: [input.steps[0]] }), /idempotency_conflict/)
    await assert.rejects(createSequence(f.env.DB, 'bob', 'campaign', input, now), /campaign_not_found/)
    const list = await request(f.env, '/v1/campaigns/campaign/sequences?limit=1')
    assert.equal(list.status, 200)
    assert.equal((await list.json() as { liveActivationAvailable: boolean }).liveActivationAvailable, false)
    const cancelled = await request(f.env, `/v1/campaigns/campaign/sequences/${first.id}/cancel`, 'POST', {})
    assert.ok((await cancelled.json() as { sequence: typeof first }).sequence.steps.every(step => step.status === 'cancelled'))
  } finally { await f.close() }
})
test('sequence dates, max steps, ownership and consent fail before any partial insertion', async () => {
  const f = await fixture()
  try {
    await setup(f.env)
    for (const steps of [[], [...input.steps, input.steps[0]], [input.steps[1], input.steps[0]],
      [{ ...input.steps[0], scheduledAt: new Date(now).toISOString() }],
      [{ ...input.steps[0], scheduledAt: new Date(now + 31 * 86_400_000).toISOString() }]]) {
      await assert.rejects(createSequence(f.env.DB, 'alice', 'campaign', { ...input, steps }, now))
    }
    await assert.rejects(createSequence(f.env.DB, 'alice', 'campaign', { ...input, mailboxId: 'foreign' }, now), /mailbox_not_found/)
    await f.env.DB.prepare("INSERT INTO campaign_stops VALUES('alice','campaign',?)").bind(input.recipient).run()
    await assert.rejects(createSequence(f.env.DB, 'alice', 'campaign', input, now), /recipient_not_eligible/)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM campaign_sequences').first())?.n, 0)
    assert.equal((await request(f.env, '/v1/campaigns/campaign/sequences?limit=26')).status, 400)
    assert.equal((await request(f.env, '/v1/campaigns/campaign/sequences?limit=1&limit=2')).status, 400)
  } finally { await f.close() }
})
test('each step requires approval and accepted predecessor; unknown never advances or resends', async () => {
  const f = await fixture()
  try {
    await setup(f.env)
    const sequence = await createSequence(f.env.DB, 'alice', 'campaign', input, now)
    const ledger = new SendLedger(f.env.DB), provider = new DurableFakeProvider(f.env.DB)
    const [first, second, third] = sequence.steps
    for (const step of sequence.steps) await ledger.approve('alice', step.id, step.revision, now, 3600_000)
    await assert.rejects(ledger.dispatch('alice', second!.id, provider, now + 200_000), /sequence_predecessor_pending/)
    await ledger.dispatch('alice', first!.id, new DurableFakeProvider(f.env.DB, 'ambiguous'), now + 200_000)
    await assert.rejects(ledger.dispatch('alice', second!.id, provider, now + 200_000), /sequence_predecessor_pending/)
    await ledger.reconcile('alice', first!.id, provider, now + 200_000)
    await ledger.dispatch('alice', second!.id, provider, now + 200_000)
    await f.env.DB.prepare("INSERT INTO campaign_stops VALUES('alice','campaign',?)").bind(input.recipient).run()
    await assert.rejects(ledger.dispatch('alice', third!.id, provider, now + 200_000), /consent_or_reply_stop/)
    assert.equal((await f.env.DB.prepare('SELECT attempts FROM send_intents WHERE id=?').bind(first!.id).first())?.attempts, 1)
  } finally { await f.close() }
})
test('sequence quota reserves each step and suppression still gates the first dispatch', async () => {
  const f = await fixture()
  try {
    await setup(f.env)
    const sequence = await createSequence(f.env.DB, 'alice', 'campaign', input, now)
    const ledger = new SendLedger(f.env.DB)
    const manual = await ledger.create('alice', { mailboxId: 'mail', to: Array.from({ length: 29 }, (_, i) => `p${i}@example.com`),
      subject: 'Quota', body: 'Test', kind: 'manual', revision: 1, idempotencyKey: 'reserve29' }, now)
    await ledger.approve('alice', manual.id, manual.revision, now, 3600_000)
    await ledger.approve('alice', sequence.steps[0]!.id, sequence.steps[0]!.revision, now, 3600_000)
    await assert.rejects(ledger.approve('alice', sequence.steps[1]!.id, sequence.steps[1]!.revision, now, 3600_000), /quota_exceeded/)
    await f.env.DB.prepare("INSERT INTO suppressions(owner,email,reason,at) VALUES('alice',?,'unsubscribe',0)").bind(input.recipient).run()
    await assert.rejects(ledger.dispatch('alice', sequence.steps[0]!.id, new DurableFakeProvider(f.env.DB), now + 200_000), /suppressed/)
  } finally { await f.close() }
})


test('real-provider sequences cannot reserve quota or dispatch before reply routing exists', async () => {
  const f = await fixture()
  try {
    await setup(f.env)
    await f.env.DB.batch([
      f.env.DB.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','key','synthetic')"),
      f.env.DB.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
      f.env.DB.prepare("INSERT INTO resend_senders VALUES('alice','mail','key',1,'domain','example.com')"),
    ])
    const sequence = await createSequence(f.env.DB, 'alice', 'campaign', input, now, 'https://mail.test')
    const first = sequence.steps[0]!
    await assert.rejects(new SendLedger(f.env.DB).approve('alice', first.id, first.revision, now, 60_000), /sequence_live_disabled/)
    const response = await request(f.env, `/v1/send-intents/${first.id}/approve`, 'POST', { revision: first.revision })
    assert.equal(response.status, 409)
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'sequence_live_disabled')
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(first.id).first())?.status, 'draft')
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM send_intents WHERE status='pending'").first())?.n, 0)
  } finally { await f.close() }
})
