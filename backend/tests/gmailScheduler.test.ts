import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now } from './fixture'
import { CredentialVault, SecretBox } from '../credentialVault'
import { runGmailSchedule } from '../gmailScheduler'
import type { GmailRuntimeServices } from '../gmailRuntime'

async function setup() {
  const f = await fixture(); const db = f.env.DB
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new CredentialVault(db, new SecretBox('key', new Map([['key', key]])))
  await db.prepare("UPDATE mailboxes SET provider='gmail' WHERE owner='alice' AND id='mail'").run()
  const id = await vault.create('alice', 'gmail', 'subject', {
    accessToken: 'fixture', refreshToken: 'refresh', expiresAt: now + 3_600_000,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  })
  let reads = 0
  const services: GmailRuntimeServices = { vault,
    provider: { refresh: async () => { throw new Error('unexpected refresh') } },
    readProvider: () => ({ read: async () => { reads++; return { messages: [], deleted: [], cursor: '10', next: null } } }),
  }
  return { ...f, db, id, vault, services, reads: () => reads }
}

// AIDEV-NOTE: Real D1 cursor/vault fixtures exercise durable scheduling without network or provider credentials.
test('scheduler persists due times, skips early ticks and excludes revoked grants', async () => {
  const f = await setup()
  try {
    assert.deepEqual(await runGmailSchedule(f.db, f.services, () => now), { claimed: 1, completed: 1, failed: 0 })
    assert.equal((await runGmailSchedule(f.db, f.services, () => now)).claimed, 0)
    await f.vault.revoke('alice', f.id)
    assert.equal((await runGmailSchedule(f.db, f.services, () => now + 600_000)).claimed, 0)
    assert.equal(f.reads(), 1)
  } finally { await f.close() }
})

test('provider failures back off with sanitized diagnostics and recover on a later tick', async () => {
  const f = await setup(); const healthy = f.services.readProvider
  try {
    f.services.readProvider = () => ({ read: async () => { throw new Error('secret-provider-token') } })
    assert.equal((await runGmailSchedule(f.db, f.services, () => now)).failed, 1)
    assert.deepEqual(await f.db.prepare('SELECT failures,last_error,due_at FROM gmail_schedule').first(),
      { failures: 1, last_error: 'sync_failed', due_at: now + 120_000 })
    f.services.readProvider = healthy
    assert.equal((await runGmailSchedule(f.db, f.services, () => now + 120_000)).completed, 1)
    assert.equal((await f.db.prepare('SELECT failures FROM gmail_schedule').first<{ failures: number }>())?.failures, 0)
  } finally { await f.close() }
})

test('overlapping ticks respect leases and an old completion cannot release a replacement lease', async () => {
  const f = await setup()
  let release!: () => void; let started!: () => void
  const entered = new Promise<void>(resolve => { started = resolve })
  const wait = new Promise<void>(resolve => { release = resolve })
  f.services.readProvider = () => ({ read: async () => {
    started(); await wait; return { messages: [], deleted: [], cursor: '10', next: null }
  } })
  try {
    const first = runGmailSchedule(f.db, f.services, () => now)
    await entered
    assert.equal((await runGmailSchedule(f.db, f.services, () => now)).claimed, 0)
    await f.db.prepare("UPDATE gmail_schedule SET lease_token='successor',lease_until=?,due_at=?")
      .bind(now + 900_000, now + 900_000).run()
    release(); await first
    assert.equal((await f.db.prepare('SELECT lease_token FROM gmail_schedule').first<{ lease_token: string }>())?.lease_token, 'successor')
  } finally { release(); await f.close() }
})

test('two-page cap and due ordering let other mailboxes progress despite a slow first mailbox', async () => {
  const f = await setup()
  let release!: () => void; let secondStarted!: () => void
  const wait = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { secondStarted = resolve })
  const subjects: string[] = []
  try {
    for (const id of ['mail2', 'mail3']) {
      await f.db.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('alice',?,'gmail',?,?)")
        .bind(id, id, `${id}@example.com`).run()
      await f.vault.create('alice', 'gmail', id, { accessToken: 'fixture', refreshToken: 'refresh',
        expiresAt: now + 3_600_000, scopes: ['https://www.googleapis.com/auth/gmail.readonly'] })
    }
    f.services.readProvider = (_token, subject) => ({ read: async () => {
      subjects.push(subject)
      if (subject === 'subject') await wait
      else secondStarted()
      return { messages: [], deleted: [], cursor: '10', next: null }
    } })
    const first = runGmailSchedule(f.db, f.services, () => now)
    await entered
    assert.deepEqual(subjects.sort(), ['mail2', 'subject'])
    release()
    assert.equal((await first).claimed, 2)
    assert.equal((await runGmailSchedule(f.db, f.services, () => now)).completed, 1)
    assert.ok(subjects.includes('mail3'))
  } finally { release(); await f.close() }
})
