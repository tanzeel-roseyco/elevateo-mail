import { test } from 'node:test'
import assert from 'node:assert/strict'
import { connectionRoute } from '../connectionRoute'
import { ConnectionOAuth } from '../connectionOAuth'
import { CredentialVault, SecretBox } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, now, token, request } from './fixture'

// AIDEV-NOTE: Real D1 tests enforce owner separation and atomic local revocation without provider calls.
test('worker mounts connection routes behind authentication and keeps OAuth disabled without configuration', async () => {
  const f = await fixture()
  try {
    assert.equal((await request(f.env, '/v1/connections', 'GET', undefined, 'invalid')).status, 401)
    assert.deepEqual(await (await request(f.env, '/v1/connections')).json(), { items: [], next: null })
    const response = await request(f.env, '/v1/connections/oauth/begin', 'POST', {})
    assert.equal(response.status, 503)
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'connection_oauth_disabled')
  } finally { await f.close() }
})
async function setup() {
  const f = await fixture()
  const session = { owner: 'alice', token_hash: await sha256(token), expires_at: now + 86_400_000 }
  await f.env.DB.prepare(`INSERT INTO provider_credentials(owner,id,provider,subject,sealed)
    VALUES('alice','a','fake','subject','private-token'),('alice','b','gmail','second',NULL),('bob','foreign','gmail','other','secret')`).run()
  const call = (path: string, method = 'GET', body?: unknown, oauth?: ConnectionOAuth) => connectionRoute(
    new Request(`https://backend.test${path}`, { method, headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), path.split('?')[0]!, session, f.env.DB, oauth, now)
  return { ...f, call }
}
test('connection metadata paginates owned active and revoked entries without secrets', async () => {
  const f = await setup()
  try {
    const first = await (await f.call('/v1/connections?limit=1'))!.json() as { items: object[]; next: { after: string } }
    assert.deepEqual(first, { items: [{ id: 'a', provider: 'fake', subject: 'subject', revision: 1, revoked: false }], next: { after: 'a' } })
    const last = await (await f.call('/v1/connections?limit=1&after=a'))!.json()
    assert.deepEqual(last, { items: [{ id: 'b', provider: 'gmail', subject: 'second', revision: 1, revoked: true }], next: null })
    await assert.rejects(f.call('/v1/connections?limit=1&limit=2'))
    await assert.rejects(f.call('/v1/connections?limit=101'))
    await assert.rejects(f.call('/v1/connections?owner=bob'))
  } finally { await f.close() }
})
test('read and draft selection is independent of send and rejects unrelated or revoked credentials', async () => {
  const f = await setup()
  try {
    const path = '/v1/connections/a/mailboxes/mail/permissions'
    await f.call(path, 'PATCH', { aiRead: true, aiDraft: false })
    assert.deepEqual(await f.env.DB.prepare("SELECT ai_read,ai_draft,send_enabled FROM mailboxes WHERE owner='alice' AND id='mail'").first(),
      { ai_read: 1, ai_draft: 0, send_enabled: 1 })
    await assert.rejects(f.call(path, 'PATCH', { aiRead: true, aiDraft: true, aiSend: true }))
    for (const id of ['b', 'foreign', 'missing']) await assert.rejects(
      f.call(`/v1/connections/${id}/mailboxes/mail/permissions`, 'PATCH', { aiRead: true, aiDraft: true }), /connection_mailbox_not_found/u)
    await f.call('/v1/connections/a/revoke', 'POST', {})
    assert.deepEqual(await f.env.DB.prepare("SELECT connected,send_enabled,ai_read,ai_draft,ai_send FROM mailboxes WHERE owner='alice' AND id='mail'").first(),
      { connected: 0, send_enabled: 0, ai_read: 0, ai_draft: 0, ai_send: 0 })
    assert.deepEqual(await f.env.DB.prepare("SELECT sealed,revision FROM provider_credentials WHERE owner='alice' AND id='a'").first(), { sealed: null, revision: 2 })
    await assert.rejects(f.call(path, 'PATCH', { aiRead: true, aiDraft: true }), /connection_mailbox_not_found/u)
    await assert.rejects(f.call('/v1/connections/foreign/revoke', 'POST', {}), /connection_not_found/u)
    assert.equal((await f.env.DB.prepare("SELECT sealed FROM provider_credentials WHERE owner='bob'").first())?.sealed, 'secret')
  } finally { await f.close() }
})
test('OAuth is disabled explicitly and all routes require an active owner session', async () => {
  const f = await setup()
  try {
    await assert.rejects(f.call('/v1/connections/oauth/begin', 'POST', {}), /connection_oauth_disabled/u)
    await f.env.DB.prepare("DELETE FROM sessions WHERE owner='alice'").run()
    await assert.rejects(f.call('/v1/connections'), /unauthorized/u)
    await assert.rejects(f.call('/v1/connections/a/revoke', 'POST', {}), /unauthorized/u)
    assert.equal((await f.env.DB.prepare("SELECT sealed FROM provider_credentials WHERE owner='alice' AND id='a'").first())?.sealed, 'private-token')
  } finally { await f.close() }
})
test('session expiry while reading a body prevents revocation and permission mutations', async t => {
  const f = await setup()
  try {
    await f.env.DB.prepare("UPDATE sessions SET expires_at=? WHERE owner='alice'").bind(now + 500).run()
    const session = { owner: 'alice', token_hash: await sha256(token), expires_at: now + 500 }
    const before = await f.env.DB.prepare("SELECT * FROM mailboxes WHERE owner='alice' AND id='mail'").first()
    let elapsed = 0
    t.mock.method(performance, 'now', () => elapsed)
    for (const [path, method, payload, error] of [
      ['/v1/connections/a/revoke', 'POST', {}, /connection_not_found/u],
      ['/v1/connections/a/mailboxes/mail/permissions', 'PATCH', { aiRead: true, aiDraft: true }, /connection_mailbox_not_found/u],
    ] as const) {
      elapsed = 0
      // AIDEV-NOTE: No prefetch: expiry advances only after the route's initial session check, during its body read.
      const body = new ReadableStream<Uint8Array>({ pull(controller) {
        elapsed = 1_000
        controller.enqueue(new TextEncoder().encode(JSON.stringify(payload)))
        controller.close()
      } }, { highWaterMark: 0 })
      const init: RequestInit & { duplex: 'half' } = { method, body, duplex: 'half',
        headers: { 'content-type': 'application/json' } }
      await assert.rejects(connectionRoute(new Request(`https://backend.test${path}`, init),
        path, session, f.env.DB, undefined, now), error)
      assert.deepEqual(await f.env.DB.prepare("SELECT * FROM mailboxes WHERE owner='alice' AND id='mail'").first(), before)
      assert.deepEqual(await f.env.DB.prepare("SELECT sealed,revision FROM provider_credentials WHERE owner='alice' AND id='a'").first(),
        { sealed: 'private-token', revision: 1 })
    }
  } finally { t.mock.restoreAll(); await f.close() }
})
test('injected OAuth accepts a posted callback and rejects its replay', async () => {
  const f = await setup()
  try {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const vault = new CredentialVault(f.env.DB, new SecretBox('test', new Map([['test', key]])))
    const oauth = new ConnectionOAuth(f.env.DB, vault, { provider: 'gmail', issuer: 'https://identity.test',
      authorizationUrl: 'https://identity.test/authorize', redirectUri: 'https://backend.test/oauth/return',
      clientId: 'test', scopes: ['read'] }, { exchange: async () => ({ subject: 'new', credential: {
        accessToken: 'never-in-response', expiresAt: now + 3600_000, scopes: ['read'],
      } }) })
    const start = await (await f.call('/v1/connections/oauth/begin', 'POST', {}, oauth))!.json() as { authorizationUrl: string }
    const callback = new URL('https://backend.test/oauth/return')
    callback.search = new URLSearchParams({ state: new URL(start.authorizationUrl).searchParams.get('state')!, iss: 'https://identity.test', code: 'code' }).toString()
    const body = { callbackUrl: callback.href }
    const saved = await (await f.call('/v1/connections/oauth/complete', 'POST', body, oauth))!.json() as { connectionId: string }
    assert.deepEqual(Object.keys(saved), ['connectionId'])
    assert.equal((await vault.read('alice', saved.connectionId)).credential.accessToken, 'never-in-response')
    await assert.rejects(f.call('/v1/connections/oauth/complete', 'POST', body, oauth), /oauth_state_invalid/u)
  } finally { await f.close() }
})
