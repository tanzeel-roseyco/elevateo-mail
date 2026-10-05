import { test } from 'node:test'
import assert from 'node:assert/strict'
import { admitResendSender, type ResendDomainVerifier } from '../resendAdmission'
import { ResendCredentials } from '../resendCredentials'
import { SecretBox } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, now, token } from './fixture'

const input = { address: 'sender@example.com', domainId: 'domain-one' }
const verified = { id: 'domain-one', name: 'example.com', status: 'verified', sendingEnabled: true }
async function setup() {
  const f = await fixture()
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new ResendCredentials(f.env.DB, new SecretBox('key', new Map([['key', key]])))
  const session = { tokenHash: await sha256(token), now: () => now }
  const id = await vault.create('alice', { apiKey: 'synthetic-key' }, session)
  const admit = (verifier: ResendDomainVerifier = { verify: async () => verified }, value: unknown = input) =>
    admitResendSender(f.env.DB, vault, verifier, 'alice', id, value, session)
  return { ...f, vault, session, id, admit }
}
test('verified Resend admission is owner bound, disabled, repeatable and rotation revokes permission atomically', async () => {
  const f = await setup()
  try {
    const first = await f.admit({ verify: async (key, domain) => {
      assert.equal(key, 'synthetic-key'); assert.equal(domain, input.domainId); return verified
    } }, { ...input, address: ' Sender@Example.com ' })
    assert.deepEqual(await f.admit(), first)
    const binding = await f.env.DB.prepare('SELECT * FROM resend_senders WHERE owner=? AND mailbox_id=?')
      .bind('alice', first.id).first()
    assert.equal(binding?.credential_id, f.id); assert.equal(binding?.credential_revision, 1)
    assert.equal(binding?.domain_name, 'example.com')
    const mailbox = () => f.env.DB.prepare('SELECT connected,verified,send_enabled,ai_send FROM mailboxes WHERE owner=? AND id=?')
      .bind('alice', first.id).first()
    assert.deepEqual(await mailbox(), { connected: 1, verified: 1, send_enabled: 0, ai_send: 0 })
    await f.env.DB.prepare('UPDATE mailboxes SET send_enabled=1 WHERE owner=? AND id=?').bind('alice', first.id).run()
    await f.vault.replace('alice', f.id, 1, { apiKey: 'rotated-key' }, f.session)
    assert.deepEqual(await mailbox(), { connected: 0, verified: 0, send_enabled: 0, ai_send: 0 })
    assert.equal((await f.env.DB.prepare('SELECT credential_revision FROM resend_senders').first())?.credential_revision, 1)
    assert.deepEqual(await f.admit(), first)
    assert.equal((await f.env.DB.prepare('SELECT credential_revision FROM resend_senders').first())?.credential_revision, 2)
    await f.vault.revoke('alice', f.id, 2, f.session)
    assert.deepEqual(await mailbox(), { connected: 0, verified: 0, send_enabled: 0, ai_send: 0 })
    await assert.rejects(f.admit(), /connection_not_found/u)
  } finally { await f.close() }
})
test('Resend admission rejects unverified domains, identity mismatches and foreign owner access', async () => {
  const f = await setup()
  try {
    for (const value of [null, { ...verified, status: 'pending' }, { ...verified, sendingEnabled: false },
      { ...verified, id: 'different' }, { ...verified, name: 'other.example.com' }]) {
      await assert.rejects(f.admit({ verify: async () => value }), /resend_sender_unverified/u)
    }
    await assert.rejects(f.admit({ verify: async () => { throw new Error('secret-provider-response') } }), /resend_verification_unavailable/u)
    await assert.rejects(admitResendSender(f.env.DB, f.vault, { verify: async () => {
      assert.fail('foreign owner must not reach provider')
    } }, 'bob', f.id, input, f.session), /connection_not_found/u)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM resend_senders').first())?.n, 0)
  } finally { await f.close() }
})
for (const change of ['revoke', 'rotate', 'session'] as const) {
  test(`Resend verification cannot commit across ${change}`, async () => {
    const f = await setup()
    try {
      await assert.rejects(f.admit({ verify: async () => {
        if (change === 'revoke') await f.vault.revoke('alice', f.id, 1, f.session)
        if (change === 'rotate') await f.vault.replace('alice', f.id, 1, { apiKey: 'new-key' }, f.session)
        if (change === 'session') await f.env.DB.prepare('UPDATE sessions SET expires_at=?').bind(now).run()
        return verified
      } }), /connection_changed/u)
      assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM mailboxes WHERE provider='resend'").first())?.n, 0)
      assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM resend_senders').first())?.n, 0)
    } finally { await f.close() }
  })
}
test('Resend cannot duplicate a Gmail/fake identity or exceed existing mailbox capacity', async () => {
  const f = await setup()
  try {
    await assert.rejects(f.admit(undefined, { ...input, address: 'alice@example.com' }), /mailbox_identity_conflict/u)
    for (let index = 0; index < 9; index++) {
      await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('alice',?,'fake',?,?)")
        .bind(`extra-${index}`, `subject-${index}`, `extra${index}@example.com`).run()
    }
    await assert.rejects(f.admit(), /mailbox_limit/u)
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM resend_senders').first())?.n, 0)
  } finally { await f.close() }
})
