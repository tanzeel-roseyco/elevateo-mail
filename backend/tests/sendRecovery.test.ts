import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrap } from '../local/bootstrap'
import { IntegrationError, MailHttpClient } from '../integration/client'
import worker, { handleRequest } from '../worker'

// AIDEV-NOTE: Recovery tests cross real HTTP sockets into persisted D1; no browser storage supplies saved content.
async function setup() {
  const directory = await mkdtemp(join(tmpdir(), 'elevateo-recovery-'))
  const local = await bootstrap(directory, true, false)
  const sessions = JSON.parse(await readFile(join(directory, 'fixture-sessions.json'), 'utf8')) as { alice: string; bob: string }
  const alice = new MailHttpClient(local.url, sessions.alice), bob = new MailHttpClient(local.url, sessions.bob)
  const mailboxId = (await alice.mailboxes()).items[0]!.id
  return { ...local, directory, sessions, alice, bob, mailboxId,
    closeAll: async () => { await local.close(); await rm(directory, { recursive: true, force: true }) } }
}
function draft(mailboxId: string, idempotencyKey: string, body = 'Saved private plaintext') {
  return { mailboxId, idempotencyKey, to: ['recipient@example.com'], subject: 'Saved private subject',
    body, kind: 'manual', revision: 1 }
}
const code = (expected: string) => (error: unknown) => error instanceof IntegrationError && error.code === expected

test('owner list is small, tie-cursor stable, bounded and has exact terminal pagination', async () => {
  const f = await setup()
  try {
    assert.deepEqual((await f.alice.requests()).items, [])
    // AIDEV-NOTE: A fixed operational clock guarantees ties rather than hoping concurrent sockets share a millisecond.
    const creationTime = Date.now()
    const created = await Promise.all(Array.from({ length: 4 }, async (_, i) => {
      const response = await handleRequest(new Request(`${f.url}v1/send-intents`, { method: 'POST', headers: {
        authorization: `Bearer ${f.sessions.alice}`, 'content-type': 'application/json' },
        body: JSON.stringify(draft(f.mailboxId, `page-${i}`)) }), f.env, creationTime)
      assert.equal(response.status, 201)
      return await response.json() as { id: string; revision: string }
    }))
    const page1 = await f.alice.requests(undefined, 2)
    assert.equal(page1.items.length, 2); assert.ok(page1.next)
    assert.ok(page1.items.every(item => item.created_at === creationTime))
    const page2 = await f.alice.requests(page1.next, 2)
    assert.equal(page2.items.length, 2); assert.equal(page2.next, null)
    assert.equal(new Set([...page1.items, ...page2.items].map(item => item.id)).size, 4)
    assert.equal(JSON.stringify(page1).includes('Saved private'), false)
    assert.deepEqual((await f.bob.requests()).items, [])
    await assert.rejects(f.bob.content(created[0]!.id), code('intent_not_found'))
    await assert.rejects(f.bob.replace(created[0]!.id, { revision: created[0]!.revision,
      draft: draft(f.mailboxId, 'foreign') }), code('intent_not_found'))
    for (const query of ['limit=0','limit=51','before=1','beforeId=id','owner=bob','limit=2&limit=3','before=-1&beforeId=id']) {
      const response = await fetch(`${f.url}v1/send-intents?${query}`, { headers: { authorization: `Bearer ${f.sessions.alice}` } })
      assert.equal(response.status, 400, query)
    }
    const plan = await f.env.DB.prepare(`EXPLAIN QUERY PLAN SELECT id FROM send_intents WHERE owner=?
      AND (created_at,id)<(?,?) ORDER BY created_at DESC,id DESC LIMIT 26`).bind('alice', Number.MAX_SAFE_INTEGER, '~').all()
    assert.match(JSON.stringify(plan.results), /send_owner_creation/u)
  } finally { await f.closeAll() }
})

test('concurrent identical replacements return one unapproved successor; conflicts and key reuse fail safely', async () => {
  const f = await setup()
  try {
    const original = await f.alice.create(draft(f.mailboxId, 'source'))
    await f.alice.approve(original.id, original.revision)
    const input = { revision: original.revision, draft: draft(f.mailboxId, 'successor', 'Changed exact content') }
    const replacements = await Promise.all(Array.from({ length: 8 }, () => f.alice.replace(original.id, input)))
    assert.equal(new Set(replacements.map(value => value.id)).size, 1)
    const successor = replacements[0]!
    assert.equal(successor.status, 'draft')
    assert.equal((await f.alice.inspect(original.id)).intent.status, 'cancelled')
    assert.equal((await f.alice.content(original.id)).intent.successor_id, successor.id)
    assert.equal((await f.alice.content(successor.id)).content.body, 'Changed exact content')
    assert.equal((await f.alice.quota(f.mailboxId)).mailbox.heldReservations, 0)
    await assert.rejects(f.alice.replace(original.id, { ...input, draft: { ...input.draft, body: 'Competing content' } }), code('replacement_conflict'))
    await assert.rejects(f.alice.replace(original.id, { ...input, revision: '0'.repeat(64) }), code('approval_conflict'))
    const unrelated = await f.alice.create(draft(f.mailboxId, 'unrelated'))
    await assert.rejects(f.alice.replace(unrelated.id, { revision: unrelated.revision,
      draft: draft(f.mailboxId, 'successor') }), code('idempotency_conflict'))
    assert.equal((await f.alice.inspect(unrelated.id)).intent.status, 'draft')
    await assert.rejects(f.alice.approve(successor.id, original.revision), code('approval_conflict'))
    await f.alice.approve(successor.id, successor.revision)
    assert.equal((await f.alice.replace(original.id, input)).status, 'pending')
  } finally { await f.closeAll() }
})

test('different tabs have one replacement winner and uncertain outcomes remain held without a successor', async () => {
  const f = await setup()
  try {
    const original = await f.alice.create(draft(f.mailboxId, 'tab-source'))
    const outcomes = await Promise.allSettled(['tab-a','tab-b'].map(key => f.alice.replace(original.id,
      { revision: original.revision, draft: draft(f.mailboxId, key, key) })))
    assert.equal(outcomes.filter(value => value.status === 'fulfilled').length, 1)
    const failure = outcomes.find(value => value.status === 'rejected')
    assert.ok(failure?.status === 'rejected' && code('replacement_conflict')(failure.reason))
    const uncertain = await f.alice.create(draft(f.mailboxId, 'uncertain'))
    await f.alice.approve(uncertain.id, uncertain.revision)
    await f.env.DB.prepare("UPDATE send_intents SET status='unknown' WHERE owner='alice' AND id=?").bind(uncertain.id).run()
    await assert.rejects(f.alice.replace(uncertain.id, { revision: uncertain.revision,
      draft: draft(f.mailboxId, 'never-created') }), code('replacement_unavailable'))
    assert.equal((await f.alice.quota(f.mailboxId)).mailbox.heldReservations, 1)
    assert.equal((await f.alice.content(uncertain.id)).intent.successor_id, null)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{ n: number }>())!.n, 0)
  } finally { await f.closeAll() }
})

test('replacement racing operational queue entry never produces two eligible sends', async () => {
  const f = await setup()
  try {
    const original = await f.alice.create(draft(f.mailboxId, 'claim-race'))
    await f.alice.approve(original.id, original.revision)
    const outcomes = await Promise.allSettled([
      f.alice.replace(original.id, { revision: original.revision, draft: draft(f.mailboxId, 'claim-successor') }),
      worker.queue({ queue: 'integration-send', messages: [{ id: 'race', body: { owner: 'alice', id: original.id },
        timestamp: new Date(), attempts: 1, ack() {}, retry() {} }],
        metadata: { metrics: { backlogCount: 1, backlogBytes: 0 } }, ackAll() {}, retryAll() {} }, f.env),
    ])
    const state = await f.alice.content(original.id)
    const receipts = await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first<{ n: number }>()
    if (state.intent.successor_id) {
      assert.equal(state.intent.status, 'cancelled'); assert.equal(receipts!.n, 0)
      assert.equal((await f.alice.inspect(state.intent.successor_id)).intent.status, 'draft')
    } else {
      assert.equal(state.intent.status, 'accepted'); assert.equal(receipts!.n, 1)
      assert.ok(outcomes[0]?.status === 'rejected' && code('replacement_unavailable')(outcomes[0].reason))
    }
  } finally { await f.closeAll() }
})

test('saved-content corruption is rejected through HTTP without exposing plaintext', async () => {
  const f = await setup()
  try {
    const original = await f.alice.create(draft(f.mailboxId, 'corrupt-detail'))
    await f.env.DB.prepare('DROP TRIGGER immutable_send').run()
    await f.env.DB.prepare("UPDATE send_intents SET envelope=json_set(envelope,'$.body','secret-corruption') WHERE owner='alice' AND id=?")
      .bind(original.id).run()
    const response = await fetch(`${f.url}v1/send-intents/${original.id}/content`, {
      headers: { authorization: `Bearer ${f.sessions.alice}` } })
    assert.equal(response.status, 409)
    const body = await response.text()
    assert.equal(body.includes('secret-corruption'), false)
    assert.equal(body.includes('Saved private'), false)
    assert.equal((JSON.parse(body) as { error: { code: string } }).error.code, 'invalid_saved_content')
  } finally { await f.closeAll() }
})

test('lost create/replacement responses recover from server list and persisted storage after Worker restart', async () => {
  const f = await setup()
  let reopened: Awaited<ReturnType<typeof bootstrap>> | undefined
  try {
    const losing = new MailHttpClient(f.url, f.sessions.alice, async (url, options) => {
      const response = await fetch(url, options)
      if (options?.method === 'POST' && response.ok) throw new Error('lost_response')
      return response
    })
    await assert.rejects(losing.create(draft(f.mailboxId, 'lost-create')), /lost_response/u)
    const saved = (await f.alice.requests()).items.find(item => item.idempotency_key === 'lost-create')!
    assert.equal((await f.alice.content(saved.id)).content.body, 'Saved private plaintext')
    const replacement = { revision: saved.revision, draft: draft(f.mailboxId, 'lost-replacement', 'Recovered successor') }
    await assert.rejects(losing.replace(saved.id, replacement), /lost_response/u)
    const successor = (await f.alice.content(saved.id)).intent.successor_id!
    assert.equal((await f.alice.replace(saved.id, replacement)).id, successor)
    const account = (await f.alice.me()).accountId
    await f.close()
    reopened = await bootstrap(f.directory, false, false)
    const reloaded = new MailHttpClient(reopened.url, f.sessions.alice)
    assert.equal((await reloaded.me()).accountId, account)
    assert.equal((await reloaded.content(saved.id)).intent.successor_id, successor)
    assert.equal((await reloaded.content(successor)).content.body, 'Recovered successor')
    assert.equal((await reloaded.inspect(successor)).intent.status, 'draft')
  } finally { await (reopened ? reopened.close() : f.close()); await rm(f.directory, { recursive: true, force: true }) }
})
