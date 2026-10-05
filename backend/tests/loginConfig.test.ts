import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createAppLogin } from '../loginConfig'
import { fixture } from './fixture'
import { base64url } from '../credentialVault'

// AIDEV-NOTE: Fixture-only secrets and transport exercise composition without an external account.
const config = () => ({ APP_LOGIN_ENABLED: 'true', APP_LOGIN_ISSUER: 'https://accounts.google.com',
  APP_LOGIN_AUTHORIZATION_URL: 'https://accounts.google.com/o/oauth2/v2/auth', APP_LOGIN_CLIENT_ID: 'fixture',
  APP_LOGIN_CLIENT_SECRET: 'fixture-secret', APP_LOGIN_REDIRECT_URI: 'https://app.example/login/callback',
  APP_LOGIN_APPROVED_SUBJECTS: '["approved"]', APP_LOGIN_ENCRYPTION_KEY: base64url(new Uint8Array(32)) })

test('login composition stays disabled by default and rejects malformed enabled configuration safely', async () => {
  const f = await fixture()
  try {
    assert.equal(await createAppLogin(f.env.DB, {}), undefined)
    assert.equal(await createAppLogin(f.env.DB, { APP_LOGIN_ENABLED: 'false' }), undefined)
    for (const patch of [{ APP_LOGIN_ISSUER: 'https://evil.example' }, { APP_LOGIN_AUTHORIZATION_URL: 'https://evil.example' },
      { APP_LOGIN_REDIRECT_URI: 'http://app.example/login/callback' }, { APP_LOGIN_REDIRECT_URI: 'https://app.example/wrong' },
      { APP_LOGIN_ENCRYPTION_KEY: 'secret' }, { APP_LOGIN_APPROVED_SUBJECTS: 'invalid' },
      { APP_LOGIN_APPROVED_SUBJECTS: '[]' }, { APP_LOGIN_APPROVED_SUBJECTS: '["a","a"]' },
      { APP_LOGIN_APPROVED_SUBJECTS: JSON.stringify(Array.from({ length: 11 }, (_, i) => String(i))) }]) {
      await assert.rejects(createAppLogin(f.env.DB, { ...config(), ...patch }), { code: 'login_configuration_invalid' })
    }
  } finally { await f.close() }
})

test('configured Google sign-in uses trusted subject and refuses unapproved identity', async () => {
  const f = await fixture(); let subject = 'approved'; const hosts: string[] = []
  try {
    const login = (await createAppLogin(f.env.DB, config(), async url => {
      hosts.push(new URL(url).host)
      return Response.json(url.includes('/token') ? { access_token: 'fixture-token', token_type: 'Bearer', expires_in: 3600, scope: 'openid' }
        : { sub: subject, email: 'ignored@example.com' })
    }))!
    const complete = async () => {
      const start = await login.begin(); const state = new URL(start.authorizationUrl).searchParams.get('state')!
      const nonce = start.nonceCookie.split(';')[0]!.split('=')[1]!
      return login.complete(`https://app.example/login/callback?state=${state}&code=fixture-code`, nonce)
    }
    assert.ok((await complete()).accountId)
    assert.deepEqual(hosts, ['oauth2.googleapis.com', 'openidconnect.googleapis.com'])
    subject = 'other'
    await assert.rejects(complete(), { code: 'login_not_approved' })
  } finally { await f.close() }
})
