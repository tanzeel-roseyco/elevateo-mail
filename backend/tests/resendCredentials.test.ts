import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ResendCredentials } from '../resendCredentials'
import { SecretBox } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, now, token } from './fixture'

const secret = { apiKey: 're_synthetic_not_a_real_key' }
async function setup() {
  const f = await fixture()
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const box = new SecretBox('key', new Map([['key', key]]))
  return { ...f, box, vault: new ResendCredentials(f.env.DB, box), session: { tokenHash: await sha256(token), now: () => now } }
}
test('Resend keys are encrypted, owner isolated and revision guarded without secret metadata', async () => {
  const f = await setup()
  try {
    const id = await f.vault.create('alice', secret, f.session)
    assert.deepEqual(await f.vault.metadata('alice', id), { id, revision: 1, revoked: 0 })
    assert.deepEqual(await f.vault.readForServer('alice', id), { ...secret, revision: 1 })
    const row = await f.env.DB.prepare('SELECT sealed FROM resend_credentials WHERE id=?').bind(id).first<{ sealed: string }>()
    assert.equal(row!.sealed.includes(secret.apiKey), false)
    await assert.rejects(f.vault.readForServer('bob', id), /connection_not_found/u)
    await assert.rejects(f.vault.metadata('bob', id), /connection_not_found/u)
    await assert.rejects(f.vault.replace('bob', id, 1, secret, f.session), /connection_changed/u)
    const results = await Promise.allSettled([
      f.vault.replace('alice', id, 1, { apiKey: 'replacement-one' }, f.session),
      f.vault.replace('alice', id, 1, { apiKey: 'replacement-two' }, f.session),
    ])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    assert.equal((await f.vault.readForServer('alice', id)).revision, 2)
    await f.vault.revoke('alice', id, 2, f.session)
    await assert.rejects(f.vault.replace('alice', id, 3, secret, f.session), /connection_changed/u)
    await assert.rejects(f.vault.readForServer('alice', id), /connection_not_found/u)
    assert.deepEqual(await f.vault.metadata('alice', id), { id, revision: 3, revoked: 1 })
  } finally { await f.close() }
})
test('Resend ciphertext substitution fails closed', async () => {
  const f = await setup()
  try {
    const first = await f.vault.create('alice', secret, f.session)
    const second = await f.vault.create('alice', secret, f.session)
    await f.env.DB.prepare('UPDATE resend_credentials SET sealed=(SELECT sealed FROM resend_credentials WHERE id=?) WHERE id=?')
      .bind(first, second).run()
    await assert.rejects(f.vault.readForServer('alice', second), /credential_unavailable/u)
  } finally { await f.close() }
})
for (const operation of ['create', 'replace'] as const) {
  test(`Resend ${operation} rejects session expiry during encryption`, async () => {
    const f = await setup()
    try {
      const id = await f.vault.create('alice', secret, f.session)
      let clock = now
      await f.env.DB.prepare('UPDATE sessions SET expires_at=?').bind(now + 1).run()
      const seal = f.box.seal.bind(f.box)
      f.box.seal = async (context, value) => { const result = await seal(context, value); clock += 2; return result }
      const guard = { tokenHash: f.session.tokenHash, now: () => clock }
      await assert.rejects(operation === 'create' ? f.vault.create('alice', secret, guard)
        : f.vault.replace('alice', id, 1, secret, guard), /connection_(admission_denied|changed)/u)
      assert.equal((await f.vault.metadata('alice', id)).revision, 1)
      assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM resend_credentials').first())?.n, 1)
    } finally { await f.close() }
  })
}
test('Resend admission validates secret bounds and atomically limits records including tombstones', async () => {
  const f = await setup()
  try {
    for (const input of [null, {}, { apiKey: '' }, { apiKey: 'bad\nkey' }, { apiKey: 'x'.repeat(8193) }, { ...secret, extra: true }]) {
      await assert.rejects(f.vault.create('alice', input, f.session))
    }
    const id = await f.vault.create('alice', { apiKey: 'x'.repeat(8192) }, f.session)
    await assert.rejects(f.vault.revoke('bob', id, 1, f.session), /connection_changed/u)
    await f.vault.revoke('alice', id, 1, f.session)
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => f.vault.create('alice', secret, f.session)))
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 9)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM resend_credentials').first())?.n, 10)
  } finally { await f.close() }
})
