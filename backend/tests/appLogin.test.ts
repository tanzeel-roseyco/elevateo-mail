import { test } from 'node:test'
import assert from 'node:assert/strict'
import { AppLogin } from '../appLogin'
import { SecretBox } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, now } from './fixture'

const config = { issuer: 'https://identity.example', authorizationUrl: 'https://identity.example/authorize',
  redirectUri: 'https://backend.test/login/callback', clientId: 'app', approvedSubjects: ['approved'] }

test('attempt admission is atomic at capacity and removes expired attempts', async () => {
  const f = await setup()
  try {
    await f.env.DB.batch(Array.from({ length: 99 }, (_, i) => f.env.DB.prepare(
      'INSERT INTO app_login VALUES(?,?,?,?)').bind(`state${i}`, `nonce${i}`, 'sealed', now + 600_000)))
    const attempts = await Promise.allSettled([f.login.begin(), f.login.begin()])
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1)
    const failure = attempts.find(result => result.status === 'rejected')
    assert.ok(failure?.status === 'rejected')
    assert.equal((failure.reason as { code: string }).code, 'login_busy')
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM app_login').first())?.n, 100)
    f.clock(now + 600_000)
    await f.login.begin()
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM app_login').first())?.n, 1)
  } finally { await f.close() }
})
// AIDEV-NOTE: Trusted identity injection exercises auth without Google or credentials.
async function setup() {
  const f = await fixture(); let clock = now; let subject = 'approved'; let calls = 0
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const login = new AppLogin(f.env.DB, new SecretBox('key', new Map([['key', key]])), config, {
    async exchange(input) { calls++; assert.equal(input.verifier.length, 43); return { issuer: config.issuer, subject } },
  }, () => clock)
  async function begin() {
    const start = await login.begin()
    const nonce = start.nonceCookie.split(';')[0]!.split('=')[1]!
    const callback = config.redirectUri + '?' + new URLSearchParams({
      state: new URL(start.authorizationUrl).searchParams.get('state')!, code: 'code',
    })
    return { nonce, callback }
  }
  return { ...f, login, begin, calls: () => calls, clock: (value: number) => { clock = value },
    subject: (value: string) => { subject = value } }
}
test('login creates hashed session and callback cannot replay', async () => {
  const f = await setup()
  try {
    const a = await f.begin(); const result = await f.login.complete(a.callback, a.nonce)
    assert.ok(result.sessionCookie.includes('Secure; HttpOnly; SameSite=Strict; Path=/'))
    const token = result.sessionCookie.split(';')[0]!.split('=')[1]!
    assert.ok(await f.env.DB.prepare('SELECT owner FROM sessions WHERE token_hash=?').bind(await sha256(token)).first())
    assert.match(result.accountId, /^[a-f0-9]{32}$/u)
    await assert.rejects(f.login.complete(a.callback, a.nonce), { code: 'login_state_invalid' })
    assert.equal(f.calls(), 1)
  } finally { await f.close() }
})
test('wrong browser cannot consume attempt and expired attempts fail', async () => {
  const f = await setup()
  try {
    const a = await f.begin(); const b = await f.begin()
    await assert.rejects(f.login.complete(a.callback, b.nonce), { code: 'login_state_invalid' })
    await f.login.complete(a.callback, a.nonce)
    f.clock(now + 600_000)
    await assert.rejects(f.login.complete(b.callback, b.nonce), { code: 'login_state_invalid' })
    assert.equal(f.calls(), 1)
  } finally { await f.close() }
})
test('unapproved subject cannot create an account', async () => {
  const f = await setup()
  try {
    f.subject('foreign'); const a = await f.begin()
    const before = await f.env.DB.prepare('SELECT count(*) AS n FROM users').first()
    await assert.rejects(f.login.complete(a.callback, a.nonce), { code: 'login_not_approved' })
    assert.deepEqual(await f.env.DB.prepare('SELECT count(*) AS n FROM users').first(), before)
  } finally { await f.close() }
})
test('concurrent identity logins share account and issue fresh sessions', async () => {
  const f = await setup()
  try {
    const a = await f.begin(); const b = await f.begin()
    const result = await Promise.all([f.login.complete(a.callback, a.nonce), f.login.complete(b.callback, b.nonce)])
    assert.equal(result[0]!.accountId, result[1]!.accountId)
    assert.notEqual(result[0]!.sessionCookie, result[1]!.sessionCookie)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM app_identities').first())?.n, 1)
  } finally { await f.close() }
})
test('pilot cap includes existing fixture users', async () => {
  const f = await setup()
  try {
    const count = (await f.env.DB.prepare('SELECT count(*) AS n FROM users').first<{ n: number }>())!.n
    for (let i = count; i < 10; i++) await f.env.DB.prepare('INSERT INTO users(id) VALUES(?)').bind(`existing${i}`).run()
    const a = await f.begin()
    await assert.rejects(f.login.complete(a.callback, a.nonce), { code: 'login_user_limit' })
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM users').first())?.n, 10)
  } finally { await f.close() }
})
