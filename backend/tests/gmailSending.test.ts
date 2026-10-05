import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now, token, draft } from './fixture'
import { sha256 } from '../core'
import { CredentialVault, SecretBox } from '../credentialVault'
import { gmailSendingRoute, gmailSendScope } from '../gmailSendingRoute'
import { resolveGmailSendRuntime } from '../gmailSendRuntime'
import { SendLedger } from '../ledger'
import type { GmailRuntime } from '../gmailConfig'

async function setup(sendScope = true) {
  const f = await fixture(); const db = f.env.DB
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new CredentialVault(db, new SecretBox('key', new Map([['key', key]])))
  await db.prepare("UPDATE mailboxes SET provider='gmail',send_enabled=0,verified=1 WHERE owner='alice' AND id='mail'").run()
  const credential = { accessToken: 'access', refreshToken: 'refresh', expiresAt: now + 3_600_000,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly', ...(sendScope ? [gmailSendScope] : [])] }
  const id = await vault.create('alice', 'gmail', 'subject', credential)
  // AIDEV-NOTE: Only the route's capability marker is fake; real vault, SQL and provider adapter run below.
  const runtime = { vault, sendOauth: {}, provider: { refresh: async () => credential },
    readProvider: () => { throw new Error('unexpected read') } } as unknown as GmailRuntime
  const session = { owner: 'alice', expires_at: now + 86_400_000, token_hash: await sha256(token) }
  const set = (enabled: boolean) => gmailSendingRoute(new Request('https://backend.test/v1/mailboxes/mail/gmail-sending', {
    method: 'POST', body: JSON.stringify({ enabled }), headers: { 'content-type': 'application/json' },
  }), '/v1/mailboxes/mail/gmail-sending', session, db, async () => runtime, now)
  return { ...f, db, vault, id, credential, runtime, set, ledger: new SendLedger(db) }
}

test('send scope and separate enable are required; ordinary refresh preserves approval', async () => {
  const f = await setup()
  try {
    await f.set(true)
    const intent = await f.ledger.create('alice', draft('gmail-send'), now)
    await f.ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await f.vault.replace('alice', f.id, 1, { ...f.credential, accessToken: 'refreshed' })
    let calls = 0
    const resolved = await resolveGmailSendRuntime(f.db, 'alice', intent.id, f.runtime,
      async () => { calls++; return Response.json({ id: 'gmail-message' }) }, () => now)
    await f.ledger.dispatch('alice', intent.id, resolved.provider, now, resolved.binding)
    assert.equal(calls, 1)
    assert.equal((await f.vault.read('alice', f.id)).grantEpoch, 1)
  } finally { await f.close() }
})

test('token rotation after resolution makes the atomic claim perform zero calls', async () => {
  const f = await setup()
  try {
    await f.set(true)
    const intent = await f.ledger.create('alice', draft('gmail-race'), now)
    await f.ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    let calls = 0
    const resolved = await resolveGmailSendRuntime(f.db, 'alice', intent.id, f.runtime,
      async () => { calls++; return Response.json({ id: 'unexpected' }) }, () => now)
    await f.vault.replace('alice', f.id, 1, f.credential)
    await f.ledger.dispatch('alice', intent.id, resolved.provider, now, resolved.binding)
    assert.equal(calls, 0)
  } finally { await f.close() }
})

test('disable/re-enable and reconnect invalidate existing immutable drafts', async () => {
  for (const reconnect of [false, true]) {
    const f = await setup()
    try {
      await f.set(true)
      const intent = await f.ledger.create('alice', draft('gmail-invalidate'), now)
      if (reconnect) await f.vault.reconnect('alice', f.id, 1, f.credential)
      else await f.set(false)
      await f.set(true)
      await assert.rejects(f.ledger.approve('alice', intent.id, intent.revision, now, 60_000), /send_binding_changed/u)
    } finally { await f.close() }
  }
})

test('read-only credentials cannot enable sending', async () => {
  const f = await setup(false)
  try { await assert.rejects(f.set(true), /gmail_sending_unavailable/u) }
  finally { await f.close() }
})

test('unverified mailboxes cannot enable sending even with a send scope', async () => {
  const f = await setup()
  try {
    await f.db.prepare("UPDATE mailboxes SET verified=0 WHERE owner='alice' AND id='mail'").run()
    await assert.rejects(f.set(true), /connection_changed/u)
  } finally { await f.close() }
})

test('revocation blocks resolved dispatch; foreign owners cannot resolve the intent', async () => {
  const f = await setup()
  try {
    await f.set(true)
    const intent = await f.ledger.create('alice', draft('gmail-revoke'), now)
    await f.ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await assert.rejects(resolveGmailSendRuntime(f.db, 'bob', intent.id, f.runtime), /send_binding_changed/u)
    let calls = 0
    const resolved = await resolveGmailSendRuntime(f.db, 'alice', intent.id, f.runtime,
      async () => { calls++; return Response.json({ id: 'unexpected' }) }, () => now)
    await f.vault.revoke('alice', f.id)
    await f.ledger.dispatch('alice', intent.id, resolved.provider, now, resolved.binding)
    assert.equal(calls, 0)
    const mailbox = await f.db.prepare("SELECT send_enabled FROM mailboxes WHERE owner='alice' AND id='mail'").first()
    assert.equal(mailbox?.send_enabled, 0)
  } finally { await f.close() }
})

test('disabling never needs provider configuration and expired sessions cannot enable', async () => {
  const f = await setup()
  try {
    await f.set(true)
    const session = { owner: 'alice', expires_at: now + 86_400_000, token_hash: await sha256(token) }
    const response = await gmailSendingRoute(new Request('https://backend.test/v1/mailboxes/mail/gmail-sending', {
      method: 'POST', body: JSON.stringify({ enabled: false }), headers: { 'content-type': 'application/json' },
    }), '/v1/mailboxes/mail/gmail-sending', session, f.db, async () => { throw new Error('unconfigured') }, now)
    assert.deepEqual(await response?.json(), { enabled: false })
    await f.db.prepare('DELETE FROM sessions').run()
    await assert.rejects(f.set(true), /connection_changed/u)
    const mailbox = await f.db.prepare("SELECT send_enabled FROM mailboxes WHERE owner='alice' AND id='mail'").first()
    assert.equal(mailbox?.send_enabled, 0)
  } finally { await f.close() }
})


test('Gmail campaign creation is rejected before persisting any send intent', async () => {
  const f = await setup()
  try {
    await f.set(true)
    await assert.rejects(f.ledger.create('alice', draft('gmail-campaign-denied', 1, 'campaign'), now), /gmail_manual_only/u)
    const row = await f.db.prepare("SELECT COUNT(*) AS total FROM send_intents WHERE owner='alice'").first<{total: number}>()
    assert.equal(row?.total, 0)
  } finally { await f.close() }
})
