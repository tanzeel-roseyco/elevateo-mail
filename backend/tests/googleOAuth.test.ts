import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GoogleOAuthProvider } from '../providers/googleOAuth'
import type { ProviderFetch } from '../providers/http'

// AIDEV-NOTE: Injected HTTP fixtures never contact Google or require real credentials.
const config = { clientId: 'client', clientSecret: 'secret', redirectUri: 'https://app.example/oauth/google' }
const input = { clientId: 'client', redirectUri: config.redirectUri, code: 'code', verifier: 'x'.repeat(43) }
const token = { access_token: 'access', refresh_token: 'refresh', expires_in: 3600, token_type: 'Bearer', scope: 'openid gmail.read' }
const previous = { accessToken: 'old', refreshToken: 'refresh', expiresAt: 1, scopes: ['openid', 'gmail.read'] }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

test('Google exchanges server-bound PKCE code and verifies subject through fixed userinfo endpoint', async () => {
  const requests: { url: string; init: RequestInit }[] = []
  const provider = new GoogleOAuthProvider(config, async (url, init) => {
    requests.push({ url, init }); return requests.length === 1 ? json(token) : json({ sub: 'google-user' })
  }, () => 1000)
  assert.deepEqual(await provider.exchange(input), { subject: 'google-user', credential: {
    accessToken: 'access', refreshToken: 'refresh', expiresAt: 3601000, scopes: ['openid', 'gmail.read'],
  } })
  assert.equal(requests[0]?.url, 'https://oauth2.googleapis.com/token')
  assert.equal(new URLSearchParams(String(requests[0]?.init.body)).get('code_verifier'), input.verifier)
  assert.equal(new URLSearchParams(String(requests[0]?.init.body)).get('client_secret'), 'secret')
  assert.equal(requests[1]?.url, 'https://openidconnect.googleapis.com/v1/userinfo')
  assert.deepEqual(requests[1]?.init.headers, { Authorization: 'Bearer access' })
  assert.equal(requests[0]?.init.redirect, 'error')
  assert.ok(requests[0]?.init.signal)
})

test('Google rejects client or redirect substitution before HTTP', async () => {
  const provider = new GoogleOAuthProvider(config, async () => { throw new Error('must not call') })
  for (const changed of [{ ...input, clientId: 'other' }, { ...input, redirectUri: 'https://evil.example' }]) {
    await assert.rejects(provider.exchange(changed), { code: 'oauth_configuration_mismatch' })
  }
})

test('Google refresh preserves omitted refresh token/scopes and verifies same subject', async () => {
  const provider = new GoogleOAuthProvider(config, async url => url.endsWith('/token')
    ? json({ access_token: 'fresh', expires_in: 3600, token_type: 'Bearer' }) : json({ sub: 'same' }), () => 1000)
  assert.deepEqual(await provider.refresh(previous, 'same'), { ...previous, accessToken: 'fresh', expiresAt: 3601000 })
  await assert.rejects(provider.refresh(previous, 'different'), { code: 'oauth_account_mismatch' })
})

test('Google invalid grant is explicit and error descriptions are never surfaced', async () => {
  const provider = new GoogleOAuthProvider(config, async () => json({ error: 'invalid_grant', error_description: 'secret' }, 400))
  await assert.rejects(provider.refresh(previous, 'same'), { code: 'oauth_invalid_grant', message: 'oauth_invalid_grant' })
})

test('Google transport redacts network failures and rejects malformed, oversized and missing-identity responses', async () => {
  const cases: ProviderFetch[] = [
    async () => { throw new Error('access secret') },
    async () => json({ ...token, expires_in: -1 }),
    async () => json({ ...token, access_token: 'x'.repeat(70000) }),
    async url => url.endsWith('/token') ? json(token) : json({ email: 'untrusted@example.com' }),
    async () => json({ ...token, scope: undefined }),
  ]
  for (const fetcher of cases) {
    await assert.rejects(new GoogleOAuthProvider(config, fetcher).exchange(input), error =>
      error instanceof Error && !error.message.includes('secret') && error.message.startsWith('oauth_'))
  }
})

test('Google refresh rejects a grant that expires during identity verification', async () => {
  let clock = 0
  const provider = new GoogleOAuthProvider(config, async url => {
    if (url.endsWith('/token')) return json({ ...token, expires_in: 1 })
    clock = 1001
    return json({ sub: 'same' })
  }, () => clock)
  await assert.rejects(provider.refresh(previous, 'same'), { code: 'oauth_response_invalid' })
})
