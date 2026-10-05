import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { bootstrap } from '../local/bootstrap'
import { startBrowserFixture } from '../local/browser'
import { sessionCookieName, sha256 } from '../core'
import { currentUserResponse } from '../contracts/v1'

// AIDEV-NOTE: HTTP cookies are replayed as a browser would; synthetic issuance exists only in the Docker proxy.
test('Docker browser provisioning, cookie authentication, identity, expiry, revocation and logout', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'elevateo-cookie-'))
  const local = await bootstrap(directory, true, false)
  let browser: Awaited<ReturnType<typeof startBrowserFixture>> | undefined
  try {
    browser = await startBrowserFixture(local, join(directory, 'fixture-sessions.json'))
    const base = browser.url
    const sessions = JSON.parse(await readFile(join(directory, 'fixture-sessions.json'), 'utf8')) as {
      alice: string; bob: string; expiresAt: number }
    const provisioning = (body: unknown, extra: Record<string, string> = {}) => fetch(base + '/__fixture/session', {
      method: 'POST', headers: { 'content-type': 'application/json', origin: base, 'x-elevateo-csrf': '1', ...extra },
      body: JSON.stringify(body) })
    const call = (cookie: string, path = '/v1/me', method = 'GET', extra: Record<string, string> = {}) => fetch(base + path, {
      method, headers: { cookie, origin: base, 'sec-fetch-site': 'same-origin', 'x-elevateo-csrf': '1', ...extra } })
    assert.equal((await provisioning({ user: 'other' })).status, 400)
    assert.equal((await provisioning({ user: 'alice', token: sessions.alice })).status, 400)
    assert.equal((await provisioning({ user: 'alice' }, { origin: 'https://foreign.example' })).status, 403)
    assert.equal((await provisioning({ user: 'alice' }, { 'x-elevateo-csrf': '' })).status, 403)
    assert.equal((await provisioning({ user: 'alice' }, { 'sec-fetch-site': 'same-site' })).status, 403)
    assert.equal((await provisioning({ user: 'alice' }, { 'sec-fetch-site': 'cross-site' })).status, 403)
    const issued = await provisioning({ user: 'alice' })
    assert.equal(issued.status, 200)
    assert.deepEqual(await issued.json(), { provisioned: true, simulated: true })
    const setCookie = issued.headers.get('set-cookie')!
    assert.match(setCookie, /; Secure; HttpOnly; SameSite=Strict; Max-Age=\d+$/u)
    assert.ok(setCookie.includes('; Path=/;')); assert.ok(!setCookie.includes('Domain='))
    const alice = setCookie.split(';')[0]!
    const bob = (await provisioning({ user: 'bob' })).headers.get('set-cookie')!.split(';')[0]!
    const identity = currentUserResponse.parse(await (await call(alice)).json())
    assert.equal(identity.session.expiresAt, sessions.expiresAt)
    assert.notEqual(identity.accountId, 'alice')
    assert.notEqual(currentUserResponse.parse(await (await call(bob)).json()).accountId, identity.accountId)
    assert.equal(currentUserResponse.parse(await (await call(alice)).json()).accountId, identity.accountId)
    assert.equal((await call(alice, '/v1/me', 'GET', { authorization: 'Bearer ' + sessions.alice })).status, 401)
    assert.equal((await call(alice + '; ' + alice)).status, 401)
    assert.equal((await call(alice, '/v1/me', 'GET', { 'sec-fetch-site': 'cross-site' })).status, 403)
    assert.equal((await fetch(base + '/v1/me', { headers: {
      authorization: 'Bearer ' + sessions.alice, 'sec-fetch-site': 'same-origin' } })).status, 401)
    const foreign = await call(alice, '/v1/session/logout', 'POST', { origin: 'https://foreign.example' })
    assert.equal(foreign.status, 403)
    assert.equal((await foreign.json() as { error: { code: string } }).error.code, 'csrf_failed')
    assert.equal((await call(alice, '/v1/session/logout', 'POST', { 'x-elevateo-csrf': '' })).status, 403)
    const bodyful = await fetch(base + '/v1/session/logout', { method: 'POST', body: '{invalid', headers: {
      cookie: alice, origin: base, 'sec-fetch-site': 'same-origin', 'x-elevateo-csrf': '1' } })
    assert.equal(bodyful.status, 400)
    assert.equal((await call(alice)).status, 200)
    assert.equal((await fetch(base + '/v1/session/logout', { method: 'POST', headers: {
      cookie: alice, 'x-elevateo-csrf': '1' } })).status, 403)
    const logout = await call(alice, '/v1/session/logout', 'POST')
    assert.equal(logout.status, 200)
    assert.deepEqual(await logout.json(), { signedOut: true, simulated: true })
    assert.match(logout.headers.get('set-cookie')!, /Max-Age=0/u)
    assert.equal((await call(alice)).status, 401)
    assert.equal((await call(bob)).status, 200)
    // Reissuing a cached fixture cookie cannot resurrect the database session after revocation.
    const revoked = await provisioning({ user: 'alice' })
    assert.equal(revoked.status, 401)
    assert.equal(revoked.headers.get('set-cookie'), null)
    const rotated = 'r'.repeat(64)
    await local.env.DB.prepare('INSERT INTO sessions VALUES(?,?,?)')
      .bind(await sha256(rotated), 'alice', Date.now() + 60_000).run()
    assert.equal(currentUserResponse.parse(await (await call(sessionCookieName + '=' + rotated)).json()).accountId, identity.accountId)
    await local.env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?')
      .bind(Date.now() - 1, await sha256(sessions.bob)).run()
    assert.equal((await call(bob)).status, 401)
    assert.equal((await fetch(local.url + '/__fixture/session', { method: 'POST', headers: {
      authorization: 'Bearer ' + sessions.bob, 'content-type': 'application/json' }, body: '{"user":"bob"}' })).status, 401)
    const noWorkerMint = await fetch(local.url + '/__fixture/session', { method: 'POST', headers: {
      authorization: 'Bearer ' + rotated, 'content-type': 'application/json' }, body: '{"user":"alice"}' })
    assert.equal(noWorkerMint.status, 404)
    assert.equal((await noWorkerMint.json() as { error: { code: string } }).error.code, 'not_found')
    assert.ok(!JSON.stringify(identity).includes(sessions.alice))
    assert.ok(alice.startsWith(sessionCookieName + '='))
  } finally {
    await browser?.close(); await local.close(); await rm(directory, { recursive: true, force: true })
  }
})
