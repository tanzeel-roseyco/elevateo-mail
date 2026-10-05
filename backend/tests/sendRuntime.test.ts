import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveSendRuntime } from '../sendRuntime'
import { SendLedger } from '../ledger'
import { SecretBox } from '../credentialVault'
import { ResendCredentials } from '../resendCredentials'
import { sha256 } from '../core'
import { draft, fixture, now, token } from './fixture'

const enabled = { RESEND_SENDING_ENABLED: 'true', UNSUBSCRIBE_ORIGIN: 'https://mail.test' }
// AIDEV-NOTE: Synthetic encrypted keys exercise production decryption; injected fetch is the only transport.
async function setup() {
  const f = await fixture()
  const db = f.env.DB
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new ResendCredentials(db, new SecretBox('key', new Map([['key', key]])))
  const session = { tokenHash: await sha256(token), now: () => now }
  const credentialId = await vault.create('alice', { apiKey: 'synthetic_key' }, session)
  await db.batch([
    db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
    db.prepare("INSERT INTO resend_senders VALUES('alice','mail',?,1,'domain','example.com')").bind(credentialId),
    db.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"),
    db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','opt-in',1)"),
  ])
  const ledger = new SendLedger(db, enabled.UNSUBSCRIBE_ORIGIN)
  const intent = await ledger.create('alice', draft('runtime', 1, 'campaign'), now)
  return { ...f, db, vault, session, credentialId, ledger, intent }
}

test('only explicit fake bindings resolve without live configuration', async () => {
  const f = await fixture()
  try {
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    const vault = new ResendCredentials(f.env.DB, new SecretBox('key', new Map([['key', key]])))
    const intent = await new SendLedger(f.env.DB).create('alice', draft('fake'), now)
    const runtime = await resolveSendRuntime(f.env.DB, 'alice', intent.id, {}, vault)
    assert.deepEqual(runtime.binding, { provider: 'fake' })
    // AIDEV-NOTE: A new resolver instance must recover acceptance after a worker dies before ledger persistence.
    const row = await f.env.DB.prepare('SELECT * FROM send_intents WHERE id=?').bind(intent.id).first<import('../ledger').IntentRow>()
    const envelope = await new SendLedger(f.env.DB).envelope(row!)
    const accepted = await runtime.provider.send(envelope)
    const restarted = await resolveSendRuntime(f.env.DB, 'alice', intent.id, {}, vault)
    assert.deepEqual(await restarted.provider.reconcile(envelope), accepted)
    await f.env.DB.prepare('DELETE FROM send_bindings WHERE owner=? AND intent_id=?').bind('alice', intent.id).run()
    await assert.rejects(resolveSendRuntime(f.env.DB, 'alice', intent.id, {}, vault), /send_binding_missing/u)
  } finally { await f.close() }
})

test('resolver dispatches a token-backed campaign through the exact encrypted credential using injected transport', async () => {
  const f = await setup()
  try {
    let calls = 0
    const runtime = await resolveSendRuntime(f.db, 'alice', f.intent.id, enabled, f.vault, async (_url, init) => {
      calls++
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic_key')
      assert.match(String(init?.body), /https:\/\/mail.test\/unsubscribe\//u)
      return Response.json({ id: 'provider-receipt' })
    })
    await f.ledger.approve('alice', f.intent.id, f.intent.revision, now, 60_000)
    await f.ledger.dispatch('alice', f.intent.id, runtime.provider, now, runtime.binding)
    assert.equal(calls, 1)
    assert.equal((await f.db.prepare('SELECT status FROM send_intents WHERE id=?').bind(f.intent.id).first())?.status, 'accepted')
  } finally { await f.close() }
})

test('credential rotation after resolution is blocked atomically before any provider call', async () => {
  const f = await setup()
  try {
    let calls = 0
    const runtime = await resolveSendRuntime(f.db, 'alice', f.intent.id, enabled, f.vault, async () => {
      calls++
      return Response.json({ id: 'must-not-send' })
    })
    await f.ledger.approve('alice', f.intent.id, f.intent.revision, now, 60_000)
    await f.vault.replace('alice', f.credentialId, 1, { apiKey: 'rotated' }, f.session)
    // AIDEV-NOTE: Re-enabling flags cannot restore an approval bound to an older credential revision.
    await f.db.prepare("UPDATE mailboxes SET connected=1,verified=1,send_enabled=1 WHERE owner='alice' AND id='mail'").run()
    await assert.rejects(f.ledger.dispatch('alice', f.intent.id, runtime.provider, now, runtime.binding), /send_binding_changed/u)
    assert.equal(calls, 0)
    assert.equal((await f.db.prepare('SELECT status FROM send_intents WHERE id=?').bind(f.intent.id).first())?.status, 'pending')
  } finally { await f.close() }
})

test('resolver rejects disabled, foreign, changed-origin and rotated credential intents without network', async () => {
  const f = await setup()
  try {
    const fetcher = async () => { assert.fail('No provider call permitted') }
    await assert.rejects(resolveSendRuntime(f.db, 'alice', f.intent.id, {}, f.vault, fetcher), /live_disabled/u)
    await assert.rejects(resolveSendRuntime(f.db, 'bob', f.intent.id, enabled, f.vault, fetcher), /intent_not_found/u)
    await assert.rejects(resolveSendRuntime(f.db, 'alice', f.intent.id, { ...enabled, UNSUBSCRIBE_ORIGIN: 'https://other.test' }, f.vault, fetcher), /unsubscribe_required/u)
    await f.vault.replace('alice', f.credentialId, 1, { apiKey: 'rotated' }, f.session)
    await assert.rejects(resolveSendRuntime(f.db, 'alice', f.intent.id, enabled, f.vault, fetcher), /send_binding_changed/u)
  } finally { await f.close() }
})

test('missing durable unsubscribe proof and absent HTTPS configuration fail closed', async () => {
  const f = await setup()
  try {
    for (const origin of ['', 'http://mail.test']) {
      await assert.rejects(resolveSendRuntime(f.db, 'alice', f.intent.id, { ...enabled, UNSUBSCRIBE_ORIGIN: origin }, f.vault), /send_configuration_invalid/u)
    }
    await f.db.prepare('DELETE FROM unsubscribe_tokens').run()
    await assert.rejects(resolveSendRuntime(f.db, 'alice', f.intent.id, enabled, f.vault), /unsubscribe_required/u)
    const prepared = await f.ledger.prepare('alice', draft('legacy', 1, 'campaign'), now)
    const legacy = JSON.parse(String(prepared.values[5])) as { body: string }
    legacy.body = 'Legacy campaign without footer'
    prepared.values[5] = JSON.stringify(legacy)
    prepared.values[12] = await sha256(String(prepared.values[5]))
    await f.db.prepare(`INSERT INTO send_intents
      (owner,id,mailbox_id,idempotency_key,revision,envelope,recipients,recipient_count,kind,campaign_id,scheduled_at,updated_at,envelope_hash,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...prepared.values).run()
    await assert.rejects(resolveSendRuntime(f.db, 'alice', prepared.id, enabled, f.vault), /unsubscribe_required/u)
  } finally { await f.close() }
})
