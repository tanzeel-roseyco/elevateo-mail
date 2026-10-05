import assert from 'node:assert/strict'
import test from 'node:test'
import { createHunterRuntime } from '../hunterConfig'
import { hunterRoute } from '../hunterRoute'
import { hunterMetadata } from '../hunterCredentials'
import { sha256 } from '../core'
import { fixture, now, token } from './fixture'

const env = { HUNTER_ENABLED: 'true', HUNTER_ENCRYPTION_KEY: 'A'.repeat(43) }
async function setup() {
  const f = await fixture(), db = f.env.DB
  const session = { owner: 'alice', token_hash: await sha256(token), expires_at: now + 86_400_000 }
  let calls = 0
  let effect = async () => {}
  const runtime = await createHunterRuntime(db, env, async (url, init) => {
    calls++; assert.equal(url, 'https://api.hunter.io/v2/people/find?email=client%40example.com')
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer synthetic-key')
    await effect()
    return Response.json({ data: { name: { fullName: 'Client' }, employment: { title: 'Engineer', name: 'Company' }, secretExtra: 'ignored' } })
  })
  const call = (path: string, method = 'GET', body?: unknown, source = async () => runtime, selected = session) => hunterRoute(
    new Request(`https://mail.test/v1/hunter/${path}`, { method, ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) }),
    `/v1/hunter/${path}`, selected, db, source, now)
  return { ...f, db, session, runtime: runtime!, call, calls: () => calls, effect: (fn: () => Promise<void>) => { effect = fn } }
}
test('Hunter stays disabled without configuration; metadata/removal survive broken config and CAS prevents stale overwrite', async () => {
  const f = await setup()
  try {
    assert.equal(await createHunterRuntime(f.db, {}), undefined)
    await assert.rejects(createHunterRuntime(f.db, { HUNTER_ENABLED: 'true' }), /hunter_configuration_invalid/u)
    await f.call('connection', 'POST', { apiKey: 'synthetic-key', revision: null })
    assert.deepEqual(await hunterMetadata(f.db, 'alice'), { revision: 1, revoked: 0 })
    const row = await f.db.prepare("SELECT sealed FROM hunter_credentials WHERE owner='alice'").first<{ sealed: string }>()
    assert.ok(!row!.sealed.includes('synthetic-key'))
    await assert.rejects(f.call('connection', 'POST', { apiKey: 'other', revision: null }), /connection_changed/u)
    const broken = async () => { throw new Error('must not resolve') }
    assert.equal((await f.call('connection', 'GET', undefined, broken))?.status, 200)
    await f.call('connection/revoke', 'POST', { revision: 1 }, broken)
    await assert.rejects(f.runtime.vault.read('alice'), /connection_not_found/u)
    await f.call('connection', 'POST', { apiKey: 'synthetic-key', revision: 2 })
    assert.equal((await hunterMetadata(f.db, 'alice'))?.revision, 3)
    assert.equal(await hunterMetadata(f.db, 'bob'), null)
    assert.equal(f.calls(), 0)
  } finally { await f.close() }
})
test('explicit owned-contact enrichment returns only bounded profile and never changes consent', async () => {
  const f = await setup()
  try {
    await f.call('connection', 'POST', { apiKey: 'synthetic-key', revision: null })
    await f.db.prepare("INSERT INTO contacts VALUES('alice','client@example.com','unknown',0)").run()
    await assert.rejects(f.call('enrich', 'POST', { email: 'client@example.com', acknowledgeCreditUse: false }))
    await assert.rejects(f.call('enrich', 'POST', { email: 'foreign@example.com', acknowledgeCreditUse: true }), /contact_not_found/u)
    assert.equal(f.calls(), 0)
    const response = await f.call('enrich', 'POST', { email: 'client@example.com', acknowledgeCreditUse: true })
    assert.deepEqual(await response!.json(), { source: 'hunter', profile: {
      fullName: 'Client', title: 'Engineer', company: 'Company', companyDomain: null, location: null } })
    assert.equal((await f.db.prepare("SELECT opted_in FROM contacts WHERE owner='alice'").first())?.opted_in, 0)
    assert.equal(f.calls(), 1)
  } finally { await f.close() }
})
test('key revocation and session expiry during lookup discard late enrichment results', async () => {
  const f = await setup()
  try {
    await f.call('connection', 'POST', { apiKey: 'synthetic-key', revision: null })
    await f.db.prepare("INSERT INTO contacts VALUES('alice','client@example.com','unknown',0)").run()
    f.effect(async () => { await f.call('connection/revoke', 'POST', { revision: 1 }) })
    await assert.rejects(f.call('enrich', 'POST', { email: 'client@example.com', acknowledgeCreditUse: true }), /connection_changed/u)
    await f.call('connection', 'POST', { apiKey: 'synthetic-key', revision: 2 })
    f.effect(async () => { await f.db.prepare('DELETE FROM sessions').run() })
    await assert.rejects(f.call('enrich', 'POST', { email: 'client@example.com', acknowledgeCreditUse: true }), /unauthorized/u)
    await assert.rejects(f.call('connection', 'POST', { apiKey: 'other', revision: 3 }), /unauthorized/u)
  } finally { await f.close() }
})
