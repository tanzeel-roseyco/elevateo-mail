import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now } from './fixture'
import { ApiError } from '../core'
import { CredentialVault, SecretBox, type ProviderCredential } from '../credentialVault'
import { runGmailSyncPage, type GmailRuntimeServices } from '../gmailRuntime'

const credential = (accessToken: string, expiresAt = now + 3_600_000): ProviderCredential => ({
  accessToken, expiresAt, refreshToken: 'refresh', scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
})
async function setup(expired = false) {
  const f = await fixture(); const db = f.env.DB
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new CredentialVault(db, new SecretBox('key', new Map([['key', key]])))
  await db.prepare("UPDATE mailboxes SET provider='gmail' WHERE owner='alice' AND id='mail'").run()
  const id = await vault.create('alice', 'gmail', 'subject', credential('old', expired ? now : undefined))
  const readTokens: string[] = []; let refreshCalls = 0
  const services: GmailRuntimeServices = { vault,
    provider: { refresh: async () => { refreshCalls++; return credential('fresh') } },
    readProvider: accessToken => ({ read: async () => {
      readTokens.push(accessToken); return { messages: [], deleted: [], cursor: '10', next: null }
    } }),
  }
  return { ...f, db, vault, id, services, readTokens, refreshCalls: () => refreshCalls,
    run: () => runGmailSyncPage(db, 'alice', 'mail', services, () => now) }
}

// AIDEV-NOTE: Real D1/vault exercises refresh revision races and disconnection, with no external provider calls.
test('valid grants skip refresh; expired grants refresh before one bounded page', async () => {
  for (const expired of [false, true]) {
    const f = await setup(expired)
    try {
      await f.run()
      assert.equal(f.refreshCalls(), Number(expired))
      assert.deepEqual(f.readTokens, [expired ? 'fresh' : 'old'])
      assert.equal((await f.vault.read('alice', f.id)).revision, expired ? 2 : 1)
    } finally { await f.close() }
  }
})

test('refresh CAS loser uses the newer credential without overwriting it', async () => {
  const f = await setup(true)
  try {
    f.services.provider.refresh = async () => {
      await f.vault.replace('alice', f.id, 1, credential('winner'))
      return credential('loser')
    }
    await f.run()
    assert.deepEqual(f.readTokens, ['winner'])
    assert.equal((await f.vault.read('alice', f.id)).credential.accessToken, 'winner')
  } finally { await f.close() }
})

test('revocation during refresh remains revoked and imports nothing', async () => {
  const f = await setup(true)
  try {
    f.services.provider.refresh = async () => { await f.vault.revoke('alice', f.id); return credential('late') }
    await assert.rejects(f.run(), /connection_not_found/)
    assert.deepEqual(f.readTokens, [])
    await assert.rejects(f.vault.read('alice', f.id), /connection_not_found/)
  } finally { await f.close() }
})

test('invalid grant revokes only the failed revision and disconnects its mailbox', async () => {
  for (const racing of [false, true]) {
    const f = await setup(true)
    try {
      f.services.provider.refresh = async () => {
        if (racing) await f.vault.replace('alice', f.id, 1, credential('winner'))
        throw new ApiError('oauth_invalid_grant', 401)
      }
      if (racing) { await f.run(); assert.deepEqual(f.readTokens, ['winner']) }
      else { await assert.rejects(f.run(), /oauth_invalid_grant/); assert.deepEqual(f.readTokens, []) }
      assert.equal((await f.db.prepare("SELECT connected FROM mailboxes WHERE owner='alice' AND id='mail'").first())?.connected, Number(racing))
    } finally { await f.close() }
  }
})

test('transient refresh failure preserves connection and encrypted grant', async () => {
  const f = await setup(true)
  try {
    f.services.provider.refresh = async () => { throw new ApiError('oauth_provider_unavailable', 502) }
    await assert.rejects(f.run(), /oauth_provider_unavailable/)
    assert.equal((await f.vault.read('alice', f.id)).revision, 1)
    assert.equal((await f.db.prepare("SELECT connected FROM mailboxes WHERE owner='alice' AND id='mail'").first())?.connected, 1)
    assert.deepEqual(f.readTokens, [])
    await assert.rejects(runGmailSyncPage(f.db, 'bob', 'mail', f.services, () => now), /sync_credential_unavailable/)
  } finally { await f.close() }
})
