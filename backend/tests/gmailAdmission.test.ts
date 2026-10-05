import { test } from 'node:test'
import assert from 'node:assert/strict'
import { admitGmailMailbox } from '../gmailAdmission'
import { CredentialVault, SecretBox } from '../credentialVault'
import { sha256 } from '../core'
import { fixture, now, token } from './fixture'

// AIDEV-NOTE: Admission runs against real D1 constraints and encrypted grants; only the Google network is replaced.
async function setup() {
  const f = await fixture()
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new CredentialVault(f.env.DB, new SecretBox('test', new Map([['test', key]])))
  const credential = { accessToken: 'private', refreshToken: 'refresh', expiresAt: now + 60_000,
    scopes: ['openid', 'https://www.googleapis.com/auth/gmail.readonly'] }
  const id = await vault.create('alice', 'gmail', 'verified-subject', credential)
  const session = { tokenHash: await sha256(token), now: () => now }
  return { ...f, vault, credential, id, session }
}
const profile = async () => Response.json({ emailAddress: 'Verified@Example.com' })

test('Gmail admission uses server profile, preserves identity on retry and never enables sending', async () => {
  const f = await setup()
  try {
    const result = await admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session, async (url, init) => {
      assert.equal(url, 'https://gmail.googleapis.com/gmail/v1/users/me/profile')
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer private')
      return profile()
    })
    assert.equal(result.address, 'verified@example.com')
    assert.deepEqual(await admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session, profile), result)
    assert.deepEqual(await f.env.DB.prepare('SELECT subject,connected,verified,send_enabled,ai_read,ai_draft,ai_send FROM mailboxes WHERE id=?')
      .bind(result.id).first(), { subject: 'verified-subject', connected: 1, verified: 1, send_enabled: 0, ai_read: 0, ai_draft: 0, ai_send: 0 })
    await assert.rejects(admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session,
      async () => Response.json({ emailAddress: 'different@example.com' })), /mailbox_identity_conflict/u)
  } finally { await f.close() }
})

test('Gmail admission rejects foreign grants, invalid profile and concurrent grant/session revocation', async () => {
  const f = await setup()
  try {
    await assert.rejects(admitGmailMailbox(f.env.DB, f.vault, 'bob', f.id, f.session, profile), /connection_not_found/u)
    await assert.rejects(admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session,
      async () => Response.json({ emailAddress: 'invalid' })), /gmail_profile_unavailable/u)
    await assert.rejects(admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session, async () => {
      await f.vault.replace('alice', f.id, 1, f.credential)
      return profile()
    }), /connection_changed/u)
    await assert.rejects(admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session, async () => {
      await f.env.DB.prepare("DELETE FROM sessions WHERE owner='alice'").run()
      return profile()
    }), /connection_changed/u)
    // AIDEV-NOTE: Restore the session so grant revocation is tested independently.
    await f.env.DB.prepare("INSERT INTO sessions(token_hash,owner,expires_at) VALUES(?,'alice',?)")
      .bind(f.session.tokenHash, now + 86_400_000).run()
    await assert.rejects(admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session, async () => {
      await f.vault.revoke('alice', f.id)
      return profile()
    }), /connection_changed/u)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM mailboxes WHERE provider='gmail'").first())?.n, 0)
  } finally { await f.close() }
})

test('Gmail admission refuses credentials expiring while the profile request is pending', async () => {
  const f = await setup()
  try {
    let clock = now
    await assert.rejects(admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id,
      { ...f.session, now: () => clock }, async () => {
        clock += 60_000
        return profile()
      }), /oauth_refresh_required/u)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM mailboxes WHERE provider='gmail'").first())?.n, 0)
  } finally { await f.close() }
})

test('Gmail admission enforces the ten-connected-mailbox cap atomically across concurrent admissions', async () => {
  const f = await setup()
  try {
    for (let i = 0; i < 8; i++) await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('alice',?,'fake',?,?)")
      .bind(`extra-${i}`, `extra-${i}`, `extra${i}@example.com`).run()
    const second = await f.vault.create('alice', 'gmail', 'second-subject', f.credential)
    const results = await Promise.allSettled([
      admitGmailMailbox(f.env.DB, f.vault, 'alice', f.id, f.session, profile),
      admitGmailMailbox(f.env.DB, f.vault, 'alice', second, f.session, async () => Response.json({ emailAddress: 'second@example.com' })),
    ])
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
    const failure = results.find(result => result.status === 'rejected')
    assert.equal(failure?.status, 'rejected')
    if (failure?.status === 'rejected') assert.match(String(failure.reason), /mailbox_limit/u)
    assert.equal((await f.env.DB.prepare("SELECT count(*) AS n FROM mailboxes WHERE owner='alice' AND connected=1").first())?.n, 10)
    const winner = results.findIndex(result => result.status === 'fulfilled')
    await admitGmailMailbox(f.env.DB, f.vault, 'alice', winner === 0 ? f.id : second, f.session,
      winner === 0 ? profile : async () => Response.json({ emailAddress: 'second@example.com' }))
  } finally { await f.close() }
})
