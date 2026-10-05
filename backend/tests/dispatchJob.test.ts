import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dispatchJob } from '../dispatchJob'
import { SendLedger } from '../ledger'
import { createResendRuntime } from '../resendConfig'
import { base64url } from '../credentialVault'
import { sha256 } from '../core'
import { draft, fixture, now, token } from './fixture'

// AIDEV-NOTE: Queue tests use real D1 and a transport that fails if disabled work attempts any network call.
const noNetwork = async () => { assert.fail('Unexpected network call') }
test('enabled queue composes the encrypted credential and dispatches exactly once through injected transport', async () => {
  const f = await fixture()
  try {
    const db = f.env.DB
    const env = { DISPATCH_PAUSED: 'false', PROVIDER_MODE: 'resend', LIVE_SENDING: 'enabled',
      RESEND_SENDING_ENABLED: 'true', RESEND_CONNECTIONS_ENABLED: 'true', UNSUBSCRIBE_ORIGIN: 'https://mail.test',
      RESEND_ENCRYPTION_KEY: base64url(new Uint8Array(32)) }
    const runtime = await createResendRuntime(db, env, noNetwork)
    const credential = await runtime!.vault.create('alice', { apiKey: 'synthetic_key' },
      { tokenHash: await sha256(token), now: () => now })
    await db.batch([
      db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
      db.prepare("INSERT INTO resend_senders VALUES('alice','mail',?,1,'domain','example.com')").bind(credential),
      db.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"),
      db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','opt-in',1)"),
    ])
    const ledger = new SendLedger(db, env.UNSUBSCRIBE_ORIGIN)
    const intent = await ledger.create('alice', draft('enabled-job', 1, 'campaign'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    let calls = 0
    const transport = async (_url: string | URL | Request, init?: RequestInit) => {
      calls++
      assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic_key')
      return Response.json({ id: 'real-shaped-test-receipt' })
    }
    const job = { owner: 'alice', id: intent.id }
    assert.equal(await dispatchJob(db, job, env, now, transport), 'processed')
    assert.equal(await dispatchJob(db, job, env, now, transport), 'noop')
    assert.equal(calls, 1)
    assert.equal((await db.prepare('SELECT status FROM send_intents WHERE id=?').bind(intent.id).first())?.status, 'accepted')
  } finally { await f.close() }
})

test('live deployments refuse simulated bindings and retain pending work without producing receipts', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const intent = await ledger.create('alice', draft('simulation-in-live'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    const env = { DISPATCH_PAUSED: 'false', PROVIDER_MODE: 'resend', LIVE_SENDING: 'enabled',
      RESEND_SENDING_ENABLED: 'true', RESEND_CONNECTIONS_ENABLED: 'true', UNSUBSCRIBE_ORIGIN: 'https://mail.test' }
    assert.equal(await dispatchJob(f.env.DB, { owner: 'alice', id: intent.id }, env, now, noNetwork), 'deferred')
    assert.deepEqual(await f.env.DB.prepare('SELECT status,error_code FROM send_intents WHERE id=?').bind(intent.id).first(),
      { status: 'pending', error_code: 'simulation_binding_disabled' })
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 0)
  } finally { await f.close() }
})

test('queue helper uses durable fake receipts, ignores foreign/stale jobs and cancels expired approvals', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const intent = await ledger.create('alice', draft('job'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    assert.equal(await dispatchJob(f.env.DB, { owner: 'bob', id: intent.id }, { DISPATCH_PAUSED: 'false' }, now, noNetwork), 'noop')
    assert.equal(await dispatchJob(f.env.DB, { owner: 'alice', id: intent.id }, { DISPATCH_PAUSED: 'false' }, now, noNetwork), 'processed')
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 1)
    assert.equal(await dispatchJob(f.env.DB, { owner: 'alice', id: intent.id }, { DISPATCH_PAUSED: 'false' }, now, noNetwork), 'noop')
    const expired = await ledger.create('alice', draft('expired'), now)
    await ledger.approve('alice', expired.id, expired.revision, now, 1)
    assert.equal(await dispatchJob(f.env.DB, { owner: 'alice', id: expired.id }, { DISPATCH_PAUSED: 'false' }, now + 2, noNetwork), 'cancelled')
    assert.equal((await f.env.DB.prepare('SELECT error_code FROM send_intents WHERE id=?').bind(expired.id).first())?.error_code, 'approval_expired')
  } finally { await f.close() }
})

test('disabled Resend work remains pending until approval expires; configuration failure is sanitized', async () => {
  const f = await fixture()
  try {
    const db = f.env.DB
    await db.batch([
      db.prepare("INSERT INTO resend_credentials(owner,id,sealed) VALUES('alice','credential','synthetic')"),
      db.prepare("UPDATE mailboxes SET provider='resend',verified=1 WHERE owner='alice' AND id='mail'"),
      db.prepare("INSERT INTO resend_senders VALUES('alice','mail','credential',1,'domain','example.com')"),
      db.prepare("INSERT INTO campaigns VALUES('alice','campaign','running')"),
      db.prepare("INSERT INTO contacts VALUES('alice','recipient0@example.com','opt-in',1)"),
    ])
    const ledger = new SendLedger(db, 'https://mail.test')
    const intent = await ledger.create('alice', draft('disabled', 1, 'campaign'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    const job = { owner: 'alice', id: intent.id }
    assert.equal(await dispatchJob(db, job, { DISPATCH_PAUSED: 'false' }, now, noNetwork), 'deferred')
    assert.deepEqual(await db.prepare('SELECT status,error_code FROM send_intents WHERE id=?').bind(intent.id).first(),
      { status: 'pending', error_code: 'live_disabled' })
    assert.equal(await dispatchJob(db, job, { DISPATCH_PAUSED: 'false', PROVIDER_MODE: 'resend', LIVE_SENDING: 'enabled', RESEND_SENDING_ENABLED: 'true', RESEND_CONNECTIONS_ENABLED: 'true', UNSUBSCRIBE_ORIGIN: 'https://mail.test' }, now, noNetwork), 'deferred')
    assert.equal((await db.prepare('SELECT error_code FROM send_intents WHERE id=?').bind(intent.id).first())?.error_code, 'resend_configuration_invalid')
    assert.equal(await dispatchJob(db, job, { DISPATCH_PAUSED: 'false' }, now + 60_001, noNetwork), 'cancelled')
  } finally { await f.close() }
})

test('revoked fake mailbox eligibility cancels pending work without retrying indefinitely', async () => {
  const f = await fixture()
  try {
    const ledger = new SendLedger(f.env.DB)
    const intent = await ledger.create('alice', draft('revoked'), now)
    await ledger.approve('alice', intent.id, intent.revision, now, 60_000)
    await f.env.DB.prepare("UPDATE mailboxes SET send_enabled=0 WHERE id='mail'").run()
    assert.equal(await dispatchJob(f.env.DB, { owner: 'alice', id: intent.id }, { DISPATCH_PAUSED: 'false' }, now, noNetwork), 'cancelled')
    assert.equal((await f.env.DB.prepare('SELECT count(*) AS n FROM fake_provider_receipts').first())?.n, 0)
  } finally { await f.close() }
})
