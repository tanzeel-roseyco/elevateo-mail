import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now, token } from './fixture'
import { sessionCookieName, sha256 } from '../core'
import { handleRequest } from '../worker'

// AIDEV-NOTE: A shared browser cookie may change while another tab still displays Alice's data.
test('account binding rejects switched-cookie reads and mutations before side effects', async () => {
  const { env, close } = await fixture()
  try {
    const bobToken = 'b'.repeat(48)
    await env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)').bind(await sha256(bobToken), 'bob', now + 86_400_000).run()
    const alice = await env.DB.prepare("SELECT account_id FROM accounts WHERE owner='alice'").first<{ account_id: string }>()
    assert.ok(alice)
    const call = (session: string, path: string, expected?: string, method = 'GET') => handleRequest(new Request(`https://backend.test${path}`, {
      method, headers: { cookie: `${sessionCookieName}=${session}`, origin: 'https://backend.test',
        'sec-fetch-site': 'same-origin', 'x-elevateo-csrf': '1',
        ...(expected === undefined ? {} : { 'x-elevateo-account': expected }) },
    }), env, now)
    assert.equal((await call(token, '/v1/mailboxes', alice.account_id)).status, 200)
    assert.equal((await call(bobToken, '/v1/mailboxes', alice.account_id)).status, 401)
    assert.equal((await call(token, '/v1/mailboxes', 'malformed')).status, 401)
    assert.equal((await call(bobToken, '/v1/session/logout', alice.account_id, 'POST')).status, 401)
    assert.ok(await env.DB.prepare('SELECT owner FROM sessions WHERE token_hash=?').bind(await sha256(bobToken)).first())
    // Refresh remains possible even with an obsolete binding; fixture requests without a binding remain compatible.
    assert.equal((await call(bobToken, '/v1/me', alice.account_id)).status, 200)
    assert.equal((await call(token, '/v1/mailboxes')).status, 200)
  } finally { await close() }
})
