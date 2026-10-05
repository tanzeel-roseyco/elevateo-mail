import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ConnectionOAuth } from '../connectionOAuth'
import { CredentialVault, SecretBox, base64url } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, now, token } from './fixture'

const config = { provider: 'gmail', issuer: 'https://identity.example', authorizationUrl: 'https://identity.example/authorize',
  redirectUri: 'https://backend.test/oauth/gmail/callback', clientId: 'test-client', scopes: ['mail.read'] }
const credential = { accessToken: 'secret-access', refreshToken: 'secret-refresh', expiresAt: now + 3600_000, scopes: ['mail.read'] }

for (const operation of ['create', 'reconnect'] as const) {
  test(`session revoked during credential encryption blocks OAuth ${operation}`, async () => {
    const f = await setup()
    try {
      const id = operation === 'reconnect' ? await f.vault.create('alice', 'gmail', 'subject', credential) : undefined
      const oauth = new ConnectionOAuth(f.env.DB, f.vault, config, {
        exchange: async () => ({ subject: 'subject', credential: { ...credential, accessToken: 'replacement' } }),
      })
      const started = await oauth.begin('alice', f.session, now, id)
      const seal = f.vault.box.seal.bind(f.vault.box)
      f.vault.box.seal = async (context, value) => {
        const sealed = await seal(context, value)
        await f.env.DB.prepare('DELETE FROM sessions WHERE owner=? AND token_hash=?').bind('alice', f.session).run()
        return sealed
      }
      await assert.rejects(oauth.complete('alice', f.session, callback(started.authorizationUrl), now), /connection_(exists|changed)/u)
      if (id) {
        const saved = await f.vault.read('alice', id)
        assert.equal(saved.revision, 1)
        assert.equal(saved.credential.accessToken, credential.accessToken)
      } else assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM provider_credentials').first())?.n, 0)
    } finally { await f.close() }
  })
}

test('vault evaluates session expiry after encryption using the supplied clock', async () => {
  const f = await setup()
  try {
    let clock = now
    await f.env.DB.prepare('UPDATE sessions SET expires_at=? WHERE owner=? AND token_hash=?').bind(now + 10, 'alice', f.session).run()
    const seal = f.vault.box.seal.bind(f.vault.box)
    f.vault.box.seal = async (context, value) => { const sealed = await seal(context, value); clock += 11; return sealed }
    await assert.rejects(f.vault.create('alice', 'gmail', 'subject', credential,
      { tokenHash: f.session, now: () => clock }), /connection_exists/u)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM provider_credentials').first())?.n, 0)
  } finally { await f.close() }
})
async function setup() {
  const f = await fixture()
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new CredentialVault(f.env.DB, new SecretBox('key1', new Map([['key1', key]])))
  return { ...f, vault, session: await sha256(token) }
}
function callback(authorizationUrl: string, extra: Record<string, string> = {}) {
  const state = new URL(authorizationUrl).searchParams.get('state')!
  return config.redirectUri + '?' + new URLSearchParams({ state, iss: config.issuer, code: 'code', ...extra })
}
test('sealed OAuth state selects only its fixed send profile and rejects a foreign session', async () => {
  const f = await setup()
  try {
    const exchange = { exchange: async () => ({ subject: 'subject', credential }) }
    const read = new ConnectionOAuth(f.env.DB, f.vault, config, exchange)
    const send = new ConnectionOAuth(f.env.DB, f.vault, { ...config, scopes: ['mail.read', 'mail.send'] }, exchange)
    const id = await f.vault.create('alice', 'gmail', 'subject', credential)
    const started = await send.begin('alice', f.session, now, id)
    assert.equal(await send.matches('alice', f.session, callback(started.authorizationUrl), now), true)
    assert.equal(await read.matches('alice', f.session, callback(started.authorizationUrl), now), false)
    await assert.rejects(send.matches('bob', f.session, callback(started.authorizationUrl), now), /unauthorized/u)
  } finally { await f.close() }
})
// AIDEV-NOTE: Fake exchange exercises protocol/security boundaries against real D1 without provider credentials.
test('OAuth binds S256 exchange to session and stores only encrypted credentials; callback cannot replay', async () => {
  const f = await setup()
  try {
    let challenge = ''; let calls = 0
    const oauth = new ConnectionOAuth(f.env.DB, f.vault, config, { async exchange(input) {
      calls++
      assert.equal(base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input.verifier)))), challenge)
      assert.equal(input.redirectUri, config.redirectUri)
      return { subject: 'stable-google-id', credential }
    } })
    const started = await oauth.begin('alice', f.session, now)
    challenge = new URL(started.authorizationUrl).searchParams.get('code_challenge')!
    const result = await oauth.complete('alice', f.session, callback(started.authorizationUrl), now)
    assert.deepEqual((await f.vault.read('alice', result.connectionId)).credential, credential)
    const row = await f.env.DB.prepare('SELECT sealed FROM provider_credentials').first<{ sealed: string }>()
    assert.ok(row && !row.sealed.includes('secret-access') && !row.sealed.includes('secret-refresh'))
    await assert.rejects(oauth.complete('alice', f.session, callback(started.authorizationUrl), now), /oauth_state_invalid/u)
    assert.equal(calls, 1)
    await assert.rejects(f.vault.read('bob', result.connectionId), /connection_not_found/u)
  } finally { await f.close() }
})
test('OAuth rejects foreign session, expired state, duplicate query, issuer and redirect substitution before exchange', async () => {
  const f = await setup()
  try {
    let calls = 0
    const oauth = new ConnectionOAuth(f.env.DB, f.vault, config, { async exchange() { calls++; return { subject: 's', credential } } })
    const started = await oauth.begin('alice', f.session, now)
    await assert.rejects(oauth.complete('bob', f.session, callback(started.authorizationUrl), now), /unauthorized/u)
    await assert.rejects(oauth.complete('alice', f.session, callback(started.authorizationUrl) + '&code=other', now), /oauth_callback_invalid/u)
    await assert.rejects(oauth.complete('alice', f.session, callback(started.authorizationUrl, { iss: 'https://evil.example' }), now))
    await assert.rejects(oauth.complete('alice', f.session, callback(started.authorizationUrl).replace('backend.test', 'evil.test'), now), /oauth_callback_invalid/u)
    await assert.rejects(oauth.complete('alice', f.session, callback(started.authorizationUrl), now + 600_000), /oauth_state_invalid/u)
    assert.equal(calls, 0)
  } finally { await f.close() }
})
test('lost exchange consumes state and a new begin invalidates older attempts', async () => {
  const f = await setup()
  try {
    const oauth = new ConnectionOAuth(f.env.DB, f.vault, config, { async exchange() { throw new Error('private provider detail') } })
    const old = await oauth.begin('alice', f.session, now)
    const current = await oauth.begin('alice', f.session, now)
    await assert.rejects(oauth.complete('alice', f.session, callback(old.authorizationUrl), now), /oauth_state_invalid/u)
    await assert.rejects(oauth.complete('alice', f.session, callback(current.authorizationUrl), now), /oauth_exchange_failed/u)
    await assert.rejects(oauth.complete('alice', f.session, callback(current.authorizationUrl), now), /oauth_state_invalid/u)
  } finally { await f.close() }
})
test('vault CAS, revocation and AEAD prevent stale refresh, resurrection and ciphertext substitution', async () => {
  const f = await setup()
  try {
    const first = await f.vault.create('alice', 'gmail', 'subject1', credential)
    const second = await f.vault.create('alice', 'gmail', 'subject2', credential)
    await f.vault.replace('alice', first, 1, { ...credential, accessToken: 'rotated' })
    await assert.rejects(f.vault.replace('alice', first, 1, credential), /connection_changed/u)
    const row = await f.env.DB.prepare('SELECT sealed FROM provider_credentials WHERE id=?').bind(first).first<{ sealed: string }>()
    await f.env.DB.prepare('UPDATE provider_credentials SET sealed=? WHERE id=?').bind(row!.sealed, second).run()
    await assert.rejects(f.vault.read('alice', second), /credential_unavailable/u)
    await f.vault.revoke('alice', first)
    await assert.rejects(f.vault.read('alice', first), /connection_not_found/u)
    await assert.rejects(f.vault.replace('alice', first, 2, credential), /connection_not_found/u)
    await assert.rejects(f.vault.reconnect('alice', first, 2, credential), /connection_changed/u)
    await assert.rejects(f.vault.revoke('bob', first), /connection_not_found/u)
  } finally { await f.close() }
})
test('reconnect requires matching provider identity and unchanged credential revision', async () => {
  const f = await setup()
  try {
    const id = await f.vault.create('alice', 'gmail', 'subject1', credential)
    await f.vault.revoke('alice', id)
    let subject = 'wrong'
    const oauth = new ConnectionOAuth(f.env.DB, f.vault, config, { async exchange() { return { subject, credential } } })
    const mismatch = await oauth.begin('alice', f.session, now, id)
    await assert.rejects(oauth.complete('alice', f.session, callback(mismatch.authorizationUrl), now), /oauth_account_mismatch/u)
    subject = 'subject1'
    const good = await oauth.begin('alice', f.session, now, id)
    assert.equal((await oauth.complete('alice', f.session, callback(good.authorizationUrl), now)).connectionId, id)
    assert.equal((await f.vault.read('alice', id)).revision, 3)
    const stale = await oauth.begin('alice', f.session, now, id)
    await f.vault.revoke('alice', id)
    await assert.rejects(oauth.complete('alice', f.session, callback(stale.authorizationUrl), now), /connection_changed/u)
  } finally { await f.close() }
})

test('Google profile requests offline access and accepts its documented callback while rejecting issuer substitution', async () => {
  const f = await setup()
  try {
    const google = { ...config, issuer: 'https://accounts.google.com',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', callbackPolicy: 'google' }
    const oauth = new ConnectionOAuth(f.env.DB, f.vault, google, { exchange: async () => ({ subject: 'google-user', credential }) })
    const started = await oauth.begin('alice', f.session, now)
    const authorization = new URL(started.authorizationUrl)
    assert.equal(authorization.searchParams.get('access_type'), 'offline')
    const query = new URLSearchParams({ state: authorization.searchParams.get('state')!, code: 'google-code',
      scope: 'mail.read', authuser: '0', hd: 'example.com', prompt: 'consent' })
    await assert.rejects(oauth.complete('alice', f.session, config.redirectUri + '?' + query + '&iss=https://evil.example', now))
    const result = await oauth.complete('alice', f.session, config.redirectUri + '?' + query, now)
    assert.equal((await f.vault.read('alice', result.connectionId)).subject, 'google-user')
    assert.throws(() => new ConnectionOAuth(f.env.DB, f.vault, { ...google, authorizationUrl: config.authorizationUrl },
      { exchange: async () => null }))
  } finally { await f.close() }
})

test('session revoked during exchange cannot persist returned credentials', async () => {
  const f = await setup()
  try {
    let release!: (value: unknown) => void; let entered!: () => void
    const ready = new Promise<void>(resolve => { entered = resolve })
    const oauth = new ConnectionOAuth(f.env.DB, f.vault, config, { exchange: () => {
      entered(); return new Promise(resolve => { release = resolve })
    } })
    const started = await oauth.begin('alice', f.session, now)
    const pending = oauth.complete('alice', f.session, callback(started.authorizationUrl), now)
    await ready
    await f.env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(f.session).run()
    release({ subject: 'revoked-session', credential })
    await assert.rejects(pending, /unauthorized/u)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM provider_credentials').first())?.n, 0)
  } finally { await f.close() }
})

for (const state of ['new', 'active', 'revoked'] as const) {
  test(`Google missing refresh grant ${state === 'active' ? 'preserves active token' : `rejects ${state} connection`}`, async () => {
    const f = await setup()
    try {
      const google = { ...config, issuer: 'https://accounts.google.com',
        authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth', callbackPolicy: 'google' }
      const id = state === 'new' ? undefined : await f.vault.create('alice', 'gmail', 'google-user', credential)
      if (state === 'revoked') await f.vault.revoke('alice', id!)
      const oauth = new ConnectionOAuth(f.env.DB, f.vault, google, { exchange: async () => ({ subject: 'google-user',
        credential: { accessToken: 'new-access', expiresAt: credential.expiresAt, scopes: credential.scopes } }) })
      const started = await oauth.begin('alice', f.session, now, id)
      const query = new URLSearchParams({ state: new URL(started.authorizationUrl).searchParams.get('state')!, code: 'code' })
      const complete = oauth.complete('alice', f.session, config.redirectUri + '?' + query, now)
      if (state === 'active') {
        assert.equal((await complete).connectionId, id)
        const saved = await f.vault.read('alice', id!)
        assert.equal(saved.credential.refreshToken, credential.refreshToken)
        assert.equal(saved.credential.accessToken, 'new-access')
        assert.equal(saved.revision, 2)
      } else {
        await assert.rejects(complete, /oauth_offline_grant_required/u)
        assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM provider_credentials WHERE sealed IS NOT NULL').first())?.n, 0)
      }
    } finally { await f.close() }
  })
}
