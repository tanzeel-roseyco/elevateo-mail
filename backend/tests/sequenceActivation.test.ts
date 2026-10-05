import assert from 'node:assert/strict'
import test from 'node:test'
import { relay } from '../worker'
import { SendLedger } from '../ledger'
import { createSequence } from '../sequences'
import { fixture, now, request } from './fixture'

const endpoint = { owner: 'alice', credentialId: 'key', domain: 'replies.example.com',
  secret: `whsec_${Buffer.alloc(32, 7).toString('base64')}` }
const env = { RESEND_SEQUENCES_ENABLED: 'true', RESEND_REPLY_ENDPOINTS: JSON.stringify({ 'sequence-endpoint-123456789': endpoint }) }
const input = { idempotencyKey: 'pilot-sequence', mailboxId: 'mail', recipient: 'client@example.com',
  steps: [1, 2].map(i => ({ subject: `Follow-up ${i}`, body: 'Consented follow-up', scheduledAt: new Date(now + i * 60_000).toISOString() })) }
const binding = { provider: 'resend' as const, credentialId: 'key', credentialRevision: 1 }
async function setup() {
  const f = await fixture()
  await f.env.DB.batch([
    f.env.DB.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"),
    f.env.DB.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','key','synthetic')"),
    f.env.DB.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
    f.env.DB.prepare("INSERT INTO resend_senders VALUES('alice','mail','key',1,'domain','example.com')"),
  ])
  await request(f.env, '/v1/contacts/import', 'POST', [{ email: input.recipient, consentSource: 'Signup', optedIn: true }])
  return f
}
test('pilot approval consumes proof, dispatch needs fresh proof and an accepted predecessor', async () => {
  const f = await setup()
  try {
    const sequence = await createSequence(f.env.DB, 'alice', 'campaign', input, now, 'https://mail.test', env)
    const ledger = new SendLedger(f.env.DB, undefined, undefined, env)
    for (const step of sequence.steps) await ledger.approve('alice', step.id, step.revision, now, 3600_000)
    const first = sequence.steps[0]!, second = sequence.steps[1]!
    assert.equal((await f.env.DB.prepare('SELECT sequence_proof FROM send_intents WHERE id=?').bind(first.id).first())?.sequence_proof, null)
    await assert.rejects(f.env.DB.prepare("UPDATE send_intents SET status='dispatching' WHERE id=?").bind(first.id).run(), /sequence_live_disabled/)
    const jobs: unknown[] = []
    const relayEnv = { ...f.env, ...env, SEND_QUEUE: { ...f.env.SEND_QUEUE, send: async (body: unknown) => { jobs.push(body); return { metadata: { metrics: { backlogCount: jobs.length, backlogBytes: 0 } } } } } }
    await relay(Object.assign({}, relayEnv, { RESEND_SEQUENCES_ENABLED: 'false' }), now + 200_000)
    assert.deepEqual(jobs, [])
    await relay(relayEnv, now + 200_000)
    assert.deepEqual(jobs, [{ owner: 'alice', id: first.id }])
    let calls = 0
    const provider = { send: async () => { calls++; return { status: 'accepted' as const, providerId: `receipt-${calls}` } },
      reconcile: async () => ({ status: 'unknown' as const }) }
    await assert.rejects(ledger.dispatch('alice', second.id, provider, now + 200_000, binding), /sequence_predecessor_pending/)
    await ledger.dispatch('alice', first.id, provider, now + 200_000, binding)
    await ledger.dispatch('alice', second.id, provider, now + 200_000, binding)
    assert.equal(calls, 2)
    assert.equal((await f.env.DB.prepare('SELECT sequence_proof FROM send_intents WHERE id=?').bind(second.id).first())?.sequence_proof, null)
  } finally { await f.close() }
})
test('disabled, removed or rotated receiving configuration blocks approved dispatch without calls', async () => {
  const f = await setup()
  try {
    const first = (await createSequence(f.env.DB, 'alice', 'campaign', input, now, 'https://mail.test', env)).steps[0]!
    await new SendLedger(f.env.DB, undefined, undefined, env).approve('alice', first.id, first.revision, now, 3600_000)
    let calls = 0
    const provider = { send: async () => { calls++; return { status: 'unknown' as const } }, reconcile: async () => ({ status: 'unknown' as const }) }
    const rotated = { ...env, RESEND_REPLY_ENDPOINTS: JSON.stringify({ 'sequence-endpoint-123456789': { ...endpoint, secret: `whsec_${Buffer.alloc(32, 8).toString('base64')}` } }) }
    const domainRotated = { ...env, RESEND_REPLY_ENDPOINTS: JSON.stringify({ 'sequence-endpoint-123456789': { ...endpoint, domain: 'newreplies.example.com' } }) }
    const endpointRotated = { ...env, RESEND_REPLY_ENDPOINTS: JSON.stringify({ 'replacement-endpoint-123456789': endpoint }) }
    for (const changed of [{}, { ...env, RESEND_SEQUENCES_ENABLED: 'false' }, { ...env, RESEND_REPLY_ENDPOINTS: '{}' }, rotated, domainRotated, endpointRotated]) {
      await assert.rejects(new SendLedger(f.env.DB, undefined, undefined, changed).dispatch('alice', first.id, provider, now + 200_000, binding), /sequence_live_disabled/)
    }
    await f.env.DB.prepare("UPDATE send_intents SET status='pending',error_code='dispatch_deferred',updated_at=? WHERE id=?").bind(now + 300_000, first.id).run()
    assert.equal(calls, 0)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(first.id).first())?.status, 'pending')
  } finally { await f.close() }
})
test('legacy unbound drafts and default-off deployment cannot reserve sequence quota', async () => {
  const f = await setup()
  try {
    const old = (await createSequence(f.env.DB, 'alice', 'campaign', input, now, 'https://mail.test')).steps[0]!
    await assert.rejects(new SendLedger(f.env.DB, undefined, undefined, env).approve('alice', old.id, old.revision, now, 3600_000), /sequence_live_disabled/)
    const current = (await createSequence(f.env.DB, 'alice', 'campaign', { ...input, idempotencyKey: 'new-bound' }, now, 'https://mail.test', env)).steps[0]!
    await assert.rejects(new SendLedger(f.env.DB).approve('alice', current.id, current.revision, now, 3600_000), /sequence_live_disabled/)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM send_intents WHERE status='pending'").first())?.n, 0)
  } finally { await f.close() }
})
