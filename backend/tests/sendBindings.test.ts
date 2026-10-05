import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SendLedger, type DispatchBinding } from '../ledger'
import type { SendProvider } from '../providers/ports'
import { draft, fixture, now } from './fixture'

const binding: DispatchBinding = { provider: 'resend', credentialId: 'credential', credentialRevision: 1 }
async function connect(db: D1Database) {
  await db.batch([
    db.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','credential','synthetic-sealed-key')"),
    db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
    db.prepare(`INSERT INTO resend_senders(owner,mailbox_id,credential_id,credential_revision,domain_id,domain_name)
      VALUES('alice','mail','credential',1,'domain','example.com')`),
    db.prepare("INSERT INTO campaigns(owner,id,status) VALUES('alice','campaign','running')"),
    db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','explicit test opt-in',1)"),
  ])
}
function provider(outcome: 'accepted' | 'unknown' = 'accepted') {
  let sends = 0; let reconciles = 0
  const adapter: SendProvider = {
    send: async () => { sends++; return outcome === 'accepted' ? { status: 'accepted', providerId: 'receipt' } : { status: 'unknown' } },
    reconcile: async () => { reconciles++; return { status: 'accepted', providerId: 'receipt' } },
  }
  return { adapter, sends: () => sends, reconciles: () => reconciles }
}

// AIDEV-NOTE: Synthetic adapters isolate credential identity/atomic SQL checks without enabling a live provider.
test('Resend snapshot requires the exact resolver binding; duplicates claim once', async () => {
  const f = await fixture(); const ledger = new SendLedger(f.env.DB, 'https://mail.test'); const p = provider()
  try {
    await connect(f.env.DB)
    const intent = await ledger.create('alice', draft('bound', 1, 'campaign'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await ledger.dispatch('alice', intent.id, p.adapter, now)
    await ledger.dispatch('alice', intent.id, p.adapter, now, { ...binding, credentialRevision: 2 })
    await ledger.dispatch('bob', intent.id, p.adapter, now, binding)
    assert.equal(p.sends(), 0)
    await Promise.all([ledger.dispatch('alice', intent.id, p.adapter, now, binding),
      ledger.dispatch('alice', intent.id, p.adapter, now, binding)])
    assert.equal(p.sends(), 1)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(intent.id).first())?.status, 'accepted')
    await assert.rejects(f.env.DB.prepare("UPDATE send_bindings SET credential_revision=2 WHERE intent_id=?")
      .bind(intent.id).run(), /immutable_send_binding/u)
  } finally { await f.close() }
})

test('a simulated draft cannot become a real send after mailbox configuration changes', async () => {
  const f = await fixture(); const ledger = new SendLedger(f.env.DB, 'https://mail.test'); const p = provider()
  try {
    const intent = await ledger.create('alice', draft('original'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await connect(f.env.DB)
    await ledger.dispatch('alice', intent.id, p.adapter, now, binding)
    assert.equal(p.sends(), 0)
    await assert.rejects(ledger.dispatch('alice', intent.id, p.adapter, now), /send_binding_changed|mailbox_permission/u)
    assert.equal(p.sends(), 0)
  } finally { await f.close() }
})

test('rotation between envelope validation and claim cannot dispatch an old credential snapshot', async () => {
  const f = await fixture(); const ledger = new SendLedger(f.env.DB, 'https://mail.test'); const p = provider()
  try {
    await connect(f.env.DB)
    const intent = await ledger.create('alice', draft('rotation', 1, 'campaign'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    const read = ledger.envelope.bind(ledger)
    ledger.envelope = async row => {
      const envelope = await read(row)
      await f.env.DB.batch([
        f.env.DB.prepare("UPDATE resend_credentials SET revision=2 WHERE owner='alice'"),
        f.env.DB.prepare("UPDATE resend_senders SET credential_revision=2 WHERE owner='alice'"),
        f.env.DB.prepare("UPDATE mailboxes SET connected=1,verified=1,send_enabled=1 WHERE owner='alice'"),
      ])
      return envelope
    }
    await assert.rejects(ledger.dispatch('alice', intent.id, p.adapter, now, binding), /send_binding_changed/u)
    assert.equal(p.sends(), 0)
    assert.deepEqual(await f.env.DB.prepare('SELECT status,attempts FROM send_intents WHERE id=?').bind(intent.id).first(),
      { status: 'pending', attempts: 0 })
  } finally { await f.close() }
})

test('unknown sends retain reservations across revocation and cannot reconcile using a replacement identity', async () => {
  const f = await fixture(); const ledger = new SendLedger(f.env.DB, 'https://mail.test'); const p = provider('unknown')
  try {
    await connect(f.env.DB)
    const intent = await ledger.create('alice', draft('unknown', 1, 'campaign'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await ledger.dispatch('alice', intent.id, p.adapter, now, binding)
    await f.env.DB.prepare("UPDATE resend_credentials SET sealed=NULL,revision=2 WHERE owner='alice'").run()
    await ledger.dispatch('alice', intent.id, p.adapter, now, binding)
    await ledger.reconcile('alice', intent.id, p.adapter, now)
    await ledger.reconcile('alice', intent.id, p.adapter, now, { ...binding, credentialRevision: 2 })
    assert.equal(p.sends(), 1); assert.equal(p.reconciles(), 0)
    assert.deepEqual(await f.env.DB.prepare('SELECT status,attempts,recipient_count FROM send_intents WHERE id=?').bind(intent.id).first(),
      { status: 'unknown', attempts: 1, recipient_count: 1 })
    await ledger.reconcile('alice', intent.id, p.adapter, now, binding)
    assert.equal(p.reconciles(), 1)
    assert.equal((await f.env.DB.prepare('SELECT status FROM send_intents WHERE id=?').bind(intent.id).first())?.status, 'accepted')
  } finally { await f.close() }
})

test('missing legacy snapshots and a changed verified domain cannot gain approval', async () => {
  const f = await fixture(); const ledger = new SendLedger(f.env.DB, 'https://mail.test')
  try {
    const legacy = await ledger.create('alice', draft('legacy'), now)
    await f.env.DB.prepare('DELETE FROM send_bindings WHERE intent_id=?').bind(legacy.id).run()
    await assert.rejects(ledger.approve('alice', legacy.id, legacy.revision, now, 60_000), /send_binding_changed/u)
    await connect(f.env.DB)
    const intent = await ledger.create('alice', draft('domain', 1, 'campaign'), now)
    await f.env.DB.prepare("UPDATE resend_senders SET domain_id='replacement' WHERE owner='alice'").run()
    await assert.rejects(ledger.approve('alice', intent.id, intent.revision, now, 60_000), /send_binding_changed/u)
  } finally { await f.close() }
})
