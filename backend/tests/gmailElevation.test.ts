import test from 'node:test'
import assert from 'node:assert/strict'
import { connectionRoute } from '../connectionRoute'
import { ConnectionOAuth } from '../connectionOAuth'
import { CredentialVault, SecretBox } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, now, token } from './fixture'

// AIDEV-NOTE: The HTTP callback contains no purpose; only sealed server state chooses the elevated OAuth profile.
test('HTTP send elevation selects its bound profile but never enables sending and rejects replay', async () => {
  const f = await fixture()
  try {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const vault = new CredentialVault(f.env.DB, new SecretBox('test', new Map([['test', key]])))
    const credential = { accessToken: 'read-token', refreshToken: 'refresh', expiresAt: now + 3_600_000, scopes: ['read'] }
    const id = await vault.create('alice', 'gmail', 'subject', credential)
    await f.env.DB.prepare("UPDATE mailboxes SET provider='gmail',send_enabled=0 WHERE owner='alice' AND id='mail'").run()
    const config = { provider: 'gmail', issuer: 'https://identity.test', authorizationUrl: 'https://identity.test/authorize',
      redirectUri: 'https://backend.test/oauth/return', clientId: 'test', scopes: ['read'] }
    let readCalls = 0; let sendCalls = 0
    const read = new ConnectionOAuth(f.env.DB, vault, config, { exchange: async () => {
      readCalls++; return { subject: 'subject', credential }
    } })
    const send = new ConnectionOAuth(f.env.DB, vault, { ...config, scopes: ['read', 'send'] }, { exchange: async () => {
      sendCalls++; return { subject: 'subject', credential: { ...credential, accessToken: 'send-token', scopes: ['read', 'send'] } }
    } })
    const session = { owner: 'alice', token_hash: await sha256(token), expires_at: now + 86_400_000 }
    const call = (path: string, body: unknown) => connectionRoute(new Request(`https://backend.test${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    }), path, session, f.env.DB, read, now, send)
    await assert.rejects(call('/v1/connections/oauth/begin', { purpose: 'send' }), /connection_required/u)
    const started = await (await call('/v1/connections/oauth/begin', { purpose: 'send', reconnectId: id }))!.json() as { authorizationUrl: string }
    const callbackUrl = config.redirectUri + '?' + new URLSearchParams({
      state: new URL(started.authorizationUrl).searchParams.get('state')!, iss: config.issuer, code: 'code',
    })
    const body = { callbackUrl }
    assert.deepEqual(await (await call('/v1/connections/oauth/complete', body))!.json(), { connectionId: id })
    assert.equal(readCalls, 0); assert.equal(sendCalls, 1)
    const saved = await vault.read('alice', id)
    assert.deepEqual(saved.credential.scopes, ['read', 'send'])
    assert.equal(saved.grantEpoch, 2)
    assert.equal((await f.env.DB.prepare("SELECT send_enabled FROM mailboxes WHERE owner='alice' AND id='mail'").first())?.send_enabled, 0)
    await assert.rejects(call('/v1/connections/oauth/complete', body), /oauth_state_invalid/u)
    assert.equal(sendCalls, 1)
  } finally { await f.close() }
})
