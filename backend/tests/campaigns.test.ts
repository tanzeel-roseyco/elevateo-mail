import assert from 'node:assert/strict'
import test from 'node:test'
import { fixture, request, now } from './fixture'
import { campaignsRoute } from '../campaignsRoute'

const input = { mailboxId: 'mail', recipient: 'client@example.com', subject: 'Hello', body: 'Welcome' }
test('campaign preparation is durable, private, idempotent and never approves', async () => {
  const f = await fixture()
  try {
    await request(f.env, '/v1/campaigns', 'POST', { id: 'welcome' })
    await f.env.DB.prepare("INSERT INTO campaigns VALUES('bob','private','draft')").run()
    await request(f.env, '/v1/contacts/import', 'POST', [{ email: input.recipient, consentSource: 'Signup form', optedIn: true }])
    const first = await request(f.env, '/v1/campaigns/welcome/drafts', 'POST', input)
    assert.equal(first.status, 201)
    const saved = await first.json() as { id: string; status: string }
    assert.equal(saved.status, 'draft')
    const retried = await (await request(f.env, '/v1/campaigns/welcome/drafts', 'POST', { ...input, recipient: 'CLIENT@example.com' })).json() as { id: string }
    assert.equal(retried.id, saved.id)
    const row = await f.env.DB.prepare('SELECT status,approved_revision FROM send_intents WHERE id=?').bind(saved.id).first()
    assert.deepEqual(row, { status: 'draft', approved_revision: null })
    assert.deepEqual(await (await request(f.env, '/v1/campaigns')).json(), { items: [{ id: 'welcome', status: 'draft' }], next: null, simulated: true })
    assert.equal((await request(f.env, '/v1/campaigns/private/drafts', 'POST', input)).status, 404)
  } finally { await f.close() }
})
test('campaign drafts reject absent consent, sticky suppression and malformed inputs', async () => {
  const f = await fixture()
  try {
    await request(f.env, '/v1/campaigns', 'POST', { id: 'welcome' })
    const prepare = (body = input) => request(f.env, '/v1/campaigns/welcome/drafts', 'POST', body)
    assert.equal((await prepare()).status, 409)
    await request(f.env, '/v1/contacts/import', 'POST', [{ email: input.recipient, consentSource: 'Withdrawal', optedIn: false }])
    await request(f.env, '/v1/contacts/import', 'POST', [{ email: input.recipient, consentSource: 'Later import', optedIn: true }])
    assert.equal((await prepare()).status, 409)
    assert.equal((await prepare({ ...input, subject: 'bad\nheader' })).status, 400)
    assert.equal((await request(f.env, '/v1/campaigns?limit=101')).status, 400)
    assert.equal((await request(f.env, '/v1/campaigns?limit=1&limit=2')).status, 400)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS count FROM send_intents').first<{ count: number }>())?.count, 0)
  } finally { await f.close() }
})

test('campaign pagination and draft mailbox ownership remain bounded', async () => {
  const f = await fixture()
  try {
    for (const id of ['a', 'b']) await request(f.env, '/v1/campaigns', 'POST', { id })
    const first = await (await request(f.env, '/v1/campaigns?limit=1')).json() as { next: string; items: { id: string }[] }
    assert.equal(first.items[0]?.id, 'a')
    assert.equal(first.next, 'a')
    const second = await (await request(f.env, '/v1/campaigns?limit=1&after=a')).json() as { next: null; items: { id: string }[] }
    assert.equal(second.items[0]?.id, 'b')
    assert.equal(second.next, null)
    await request(f.env, '/v1/contacts/import', 'POST', [{ email: input.recipient, consentSource: 'Signup', optedIn: true }])
    await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('bob','foreign','fake','foreign','bob@example.com')").run()
    assert.equal((await request(f.env, '/v1/campaigns/a/drafts', 'POST', { ...input, mailboxId: 'foreign' })).status, 404)
    await f.env.DB.prepare("INSERT INTO campaign_stops VALUES('alice','a',?)").bind(input.recipient).run()
    assert.equal((await request(f.env, '/v1/campaigns/a/drafts', 'POST', input)).status, 409)
  } finally { await f.close() }
})

test('scheduled campaign drafts normalize identity, remain unapproved and reject invalid windows', async () => {
  const f = await fixture()
  try {
    await request(f.env, '/v1/campaigns', 'POST', { id: 'welcome' })
    await request(f.env, '/v1/contacts/import', 'POST', [{ email: input.recipient, consentSource: 'Signup', optedIn: true }])
    const scheduledAt = new Date(now + 86_400_000).toISOString()
    const create = (value: string) => request(f.env, '/v1/campaigns/welcome/drafts', 'POST', { ...input, scheduledAt: value })
    const first = await create(scheduledAt)
    assert.equal(first.status, 201)
    const saved = await first.json() as { id: string }
    assert.equal((await (await create(scheduledAt.replace('Z', '+00:00'))).json() as { id: string }).id, saved.id)
    const next = await (await create(new Date(now + 2 * 86_400_000).toISOString())).json() as { id: string }
    assert.notEqual(next.id, saved.id)
    const retry = await campaignsRoute(new Request('https://backend.test/v1/campaigns/welcome/drafts', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, scheduledAt }) }),
      '/v1/campaigns/welcome/drafts', 'alice', f.env.DB, now + 2 * 86_400_000)
    assert.equal((await retry!.json() as { id: string }).id, saved.id)
    assert.deepEqual(await f.env.DB.prepare('SELECT status,approved_revision,scheduled_at FROM send_intents WHERE id=?').bind(saved.id).first(),
      { status: 'draft', approved_revision: null, scheduled_at: now + 86_400_000 })
    for (const value of ['invalid', new Date(now).toISOString(), new Date(now + 31 * 86_400_000).toISOString()]) {
      assert.equal((await create(value)).status, 400)
    }
  } finally { await f.close() }
})
