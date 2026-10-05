import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureEvent } from '../events'
import { sha256 } from '../core'
import { fixture, request, now } from './fixture'

// AIDEV-NOTE: Fake event signatures are not reused as assertions of Gmail JWT or Svix compatibility.
const keyText = 'f'.repeat(64)
async function signed(payload: unknown, timestamp = now): Promise<Request> {
  const raw = JSON.stringify(payload)
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(keyText), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`))), byte => byte.toString(16).padStart(2, '0')).join('')
  return new Request('https://fake.test/v1/events/connection', { method: 'POST', headers: { 'x-event-timestamp': String(timestamp), 'x-event-signature': signature }, body: raw })
}
test('signed events reject stale/forged input and conflicting replay atomically', async () => {
  const f = await fixture()
  try {
    await f.env.DB.prepare("INSERT INTO event_connections VALUES('connection','alice','mail',?)").bind(keyText).run()
    const event = { id: 'bounce', type: 'bounce', email: 'recipient@example.com' }
    await assert.rejects(captureEvent(await signed(event, now - 300001), 'connection', f.env, now), /event_unauthorized/)
    const forged = await signed(event); forged.headers.set('x-event-signature', '0'.repeat(64))
    await assert.rejects(captureEvent(forged, 'connection', f.env, now), /event_unauthorized/)
    const races = await Promise.allSettled([
      captureEvent(await signed(event), 'connection', f.env, now),
      captureEvent(await signed({ ...event, email: 'other@example.com' }), 'connection', f.env, now),
    ])
    assert.equal(races.filter(row => row.status === 'fulfilled').length, 1)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM suppressions').first())?.n, 1)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM event_receipts').first())?.n, 1)
  } finally { await f.close() }
})
test('signed inbound dates reject overflow without receipts and accept the exact Date boundary', async () => {
  const f = await fixture()
  try {
    await f.env.DB.prepare("INSERT INTO event_connections VALUES('connection','alice','mail',?)").bind(keyText).run()
    const event = { id: 'inbound', type: 'inbound', email: 'person@example.com',
      message: { id: 'message', threadId: 'thread', subject: '', body: '', at: 8_640_000_000_000_001 } }
    await assert.rejects(captureEvent(await signed(event), 'connection', f.env, now))
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM messages').first())?.n, 0)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM event_receipts').first())?.n, 0)
    event.message.at = 8_640_000_000_000_000
    await captureEvent(await signed(event), 'connection', f.env, now)
    assert.equal((await f.env.DB.prepare('SELECT at FROM messages').first())?.at, event.message.at)
  } finally { await f.close() }
})

test('inbound replay deduplicates plaintext and unsubscribe GET never mutates', async () => {
  const f = await fixture()
  try {
    await f.env.DB.prepare("INSERT INTO event_connections VALUES('connection','alice','mail',?)").bind(keyText).run()
    const event = { id: 'inbound', type: 'inbound', email: 'person@example.com', message: { id: 'message', threadId: 'thread', subject: 'Subject', body: '<img src="tracker">', at: now } }
    await captureEvent(await signed(event), 'connection', f.env, now)
    await captureEvent(await signed(event), 'connection', f.env, now)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM messages').first())?.n, 1)
    const token = 'u'.repeat(48)
    await f.env.DB.prepare("INSERT INTO contacts VALUES('alice','person@example.com','form',1)").run()
    await f.env.DB.prepare("INSERT INTO unsubscribe_tokens VALUES(?,'alice','person@example.com')").bind(await sha256(token)).run()
    assert.equal((await request(f.env, `/unsubscribe/${token}`)).status, 200)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM suppressions').first())?.n, 0)
    assert.equal((await request(f.env, `/unsubscribe/${token}`, 'POST')).status, 200)
    assert.equal((await request(f.env, `/unsubscribe/${token}`, 'POST')).status, 200)
    assert.equal((await f.env.DB.prepare('SELECT opted_in FROM contacts').first())?.opted_in, 0)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM suppressions').first())?.n, 1)
  } finally { await f.close() }
})
