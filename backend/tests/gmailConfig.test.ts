import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createGmailRuntime } from '../gmailConfig'
import { base64url } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, token } from './fixture'

// AIDEV-NOTE: Composition tests use fixture secrets and a transport with no external network access.
const config = () => ({ GMAIL_ENABLED: 'true', GMAIL_CLIENT_ID: 'fixture', GMAIL_CLIENT_SECRET: 'fixture-secret',
  GMAIL_REDIRECT_URI: 'https://app.example/connections/gmail/callback', GMAIL_ENCRYPTION_KEY: base64url(new Uint8Array(32)) })

test('Gmail composition defaults off and rejects malformed enabled configuration', async () => {
  const f = await fixture()
  try {
    const noNetwork = async (): Promise<Response> => { throw new Error('unexpected network') }
    assert.equal(await createGmailRuntime(f.env.DB, {}, noNetwork), undefined)
    assert.equal(await createGmailRuntime(f.env.DB, { GMAIL_ENABLED: 'false' }, noNetwork), undefined)
    for (const patch of [{ GMAIL_ENABLED: 'yes' }, { GMAIL_CLIENT_ID: '' }, { GMAIL_CLIENT_SECRET: 'bad\nsecret' },
      { GMAIL_REDIRECT_URI: 'http://app.example/connections/gmail/callback' },
      { GMAIL_REDIRECT_URI: 'https://app.example/login/callback' },
      { GMAIL_REDIRECT_URI: 'https://app.example/connections/gmail/callback?next=evil' },
      { GMAIL_ENCRYPTION_KEY: 'secret' }, { GMAIL_ENCRYPTION_KEY: 'A'.repeat(42) + 'B' }]) {
      await assert.rejects(createGmailRuntime(f.env.DB, { ...config(), ...patch }, noNetwork), { code: 'gmail_configuration_invalid' })
    }
  } finally { await f.close() }
})

test('Gmail composition binds offline read-only authorization and seals trusted provider credentials', async () => {
  const f = await fixture(); const hosts: string[] = []
  try {
    const runtime = (await createGmailRuntime(f.env.DB, config(), async url => {
      hosts.push(new URL(url).host)
      return Response.json(url.includes('/token') ? { access_token: 'fixture-access', refresh_token: 'fixture-refresh',
        token_type: 'Bearer', expires_in: 3600, scope: 'openid https://www.googleapis.com/auth/gmail.readonly' } : { sub: 'google-subject' })
    }))!
    const session = await sha256(token)
    const now = Date.now()
    await f.env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind(now + 86_400_000, session).run()
    const start = await runtime.oauth.begin('alice', session, now)
    const url = new URL(start.authorizationUrl)
    assert.equal(url.origin + url.pathname, 'https://accounts.google.com/o/oauth2/v2/auth')
    assert.equal(url.searchParams.get('scope'), 'openid https://www.googleapis.com/auth/gmail.readonly')
    assert.equal(url.searchParams.get('access_type'), 'offline')
    const result = await runtime.oauth.complete('alice', session,
      `${runtime.redirectUri}?code=fixture-code&state=${url.searchParams.get('state')}`, now)
    const saved = await runtime.vault.read('alice', result.connectionId)
    assert.equal(saved.subject, 'google-subject')
    assert.equal(saved.credential.refreshToken, 'fixture-refresh')
    assert.deepEqual(hosts, ['oauth2.googleapis.com', 'openidconnect.googleapis.com'])
    await assert.rejects(runtime.vault.read('bob', result.connectionId))
    assert.ok(runtime.readProvider(saved.credential.accessToken, saved.subject))
  } finally { await f.close() }
})
