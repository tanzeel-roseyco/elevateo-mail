import { test } from 'node:test'
import assert from 'node:assert/strict'
import { jsonBody } from '../core'
import { fixture, request, token, now } from './fixture'

// AIDEV-NOTE: Contract tests exercise authenticated requests against real D1 ownership boundaries.
test('API auth, stable errors, JSON media type and streamed body limits', async () => {
  const f = await fixture()
  try {
    assert.equal((await request(f.env, '/v1/mailboxes', 'GET', undefined, 'invalid')).status, 401)
    assert.equal((await request(f.env, '/v1/send-intents', 'POST', null)).status, 400)
    await assert.rejects(jsonBody(new Request('https://fake.test', { method: 'POST', headers: { 'content-type': 'application/jsonp' }, body: '{}' })), /json_required/)
    assert.deepEqual(await jsonBody(new Request('https://fake.test', { method: 'POST', headers: { 'content-type': 'Application/JSON; charset=utf-8' }, body: '{}' })), {})
    await assert.rejects(jsonBody(new Request('https://fake.test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: 'x'.repeat(131073) })), /body_too_large/)
    await f.env.DB.prepare('UPDATE sessions SET expires_at=?').bind(now).run()
    assert.equal((await request(f.env, '/v1/mailboxes')).status, 401)
  } finally { await f.close() }
})
test('mailboxes cap at ten, reconnect stable and concurrent creation has deterministic conflict', async () => {
  const f = await fixture()
  try {
    const body = { subject: 'same', address: 'same@example.com', sendEnabled: true }
    const responses = await Promise.all([request(f.env, '/v1/mailboxes', 'POST', body), request(f.env, '/v1/mailboxes', 'POST', body)])
    const rows = await Promise.all(responses.map(async response => { assert.ok([200, 201].includes(response.status)); return await response.json() as { id: string } }))
    assert.equal(rows[0]!.id, rows[1]!.id)
    assert.equal((await request(f.env, '/v1/mailboxes', 'POST', { ...body, subject: 'different' })).status, 409)
    for (let index = 2; index < 10; index++) assert.equal((await request(f.env, '/v1/mailboxes', 'POST', { subject: `subject${index}`, address: `mail${index}@example.com` })).status, 201)
    assert.equal((await request(f.env, '/v1/mailboxes', 'POST', { subject: 'eleventh', address: 'extra@example.com' })).status, 409)
    assert.equal((await request(f.env, '/v1/mailboxes', 'POST', body)).status, 200)
    assert.equal((await request(f.env, '/v1/mailboxes/bob/permissions', 'PATCH', { connected: true, sendEnabled: true, aiRead: true, aiSend: true })).status, 404)
  } finally { await f.close() }
})
test('campaign retry returns persisted status and contact withdrawal remains suppressed', async () => {
  const f = await fixture()
  try {
    await request(f.env, '/v1/campaigns', 'POST', { id: 'campaign' })
    await request(f.env, '/v1/campaigns/campaign', 'PATCH', { status: 'running' })
    assert.equal((await (await request(f.env, '/v1/campaigns', 'POST', { id: 'campaign' })).json() as { status: string }).status, 'running')
    const contact = { email: 'person@example.com', consentSource: 'signed form', optedIn: false }
    assert.equal((await request(f.env, '/v1/contacts/import', 'POST', [contact])).status, 200)
    await request(f.env, '/v1/contacts/import', 'POST', [{ ...contact, optedIn: true }])
    assert.ok(await f.env.DB.prepare('SELECT 1 FROM suppressions WHERE owner=? AND email=?').bind('alice', contact.email).first())
    assert.equal((await request(f.env, '/v1/contacts/import', 'POST', [contact, contact])).status, 400)
    assert.equal((await request(f.env, '/v1/contacts/import', 'POST', [])).status, 400)
  } finally { await f.close() }
})
test('message pagination preserves tied timestamps, lazy bodies and owner isolation', async () => {
  const f = await fixture()
  try {
    for (const id of ['first', 'second', 'third']) await f.env.DB.prepare("INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at) VALUES('alice','mail',?,'thread','sender@example.com','Subject','<script>untrusted</script>',?)").bind(id, now).run()
    const first = await (await request(f.env, '/v1/messages?mailboxId=mail&limit=2')).json() as { items: { id: string; body?: string }[]; next: { before: number; beforeId: string } }
    assert.equal(first.items.length, 2); assert.equal(first.items[0]?.body, undefined)
    const second = await (await request(f.env, `/v1/messages?mailboxId=mail&limit=2&before=${first.next.before}&beforeId=${first.next.beforeId}`)).json() as { items: { id: string }[] }
    assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 3)
    assert.equal((await request(f.env, '/v1/messages/bob/first')).status, 404)
    const detail = await (await request(f.env, '/v1/messages/mail/first')).json() as { contentType: string; trust: string }
    assert.equal(detail.contentType, 'text/plain'); assert.equal(detail.trust, 'untrusted-email')
    assert.equal((await request(f.env, '/v1/messages?mailboxId=mail&limit=101', 'GET', undefined, token)).status, 400)
  } finally { await f.close() }
})
