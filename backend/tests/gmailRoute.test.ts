import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now, token } from './fixture'
import { sha256 } from '../core'
import { CredentialVault, SecretBox } from '../credentialVault'
import { gmailRoute, type GmailRouteRuntime } from '../gmailRoute'

const post = (path: string, body: unknown = {}) => new Request(`https://app.test${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})
async function setup() {
  const f = await fixture(); const db = f.env.DB
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
  const vault = new CredentialVault(db, new SecretBox('key', new Map([['key', key]])))
  const id = await vault.create('alice', 'gmail', 'google-subject', { accessToken: 'fixture',
    expiresAt: now + 3_600_000, scopes: ['https://www.googleapis.com/auth/gmail.readonly'] })
  const session = { owner: 'alice', token_hash: await sha256(token), expires_at: now + 86_400_000 }
  const runtime: GmailRouteRuntime = { vault, provider: { refresh: async () => { throw new Error('Unexpected refresh') } },
    fetcher: async () => Response.json({ emailAddress: 'new@example.com' }),
    readProvider: () => ({ read: async () => ({ messages: [{ id: 'gmail-message', threadId: 'thread',
      sender: 'sender@example.com', subject: 'Subject', body: 'Body', at: now }], deleted: [], cursor: '10', next: null }) }),
  }
  return { ...f, db, id, session, runtime }
}

// AIDEV-NOTE: Route tests exercise real D1 admission and sync; provider calls are synthetic and credential-free.
test('status disabled, strict route boundaries and enabled admission/sync', async () => {
  const f = await setup()
  try {
    const status = '/v1/gmail/status'
    assert.deepEqual(await (await gmailRoute(new Request(`https://app.test${status}`), status, f.session, f.db, undefined, now))!.json(), { enabled: false })
    const path = `/v1/connections/${f.id}/mailbox`
    await assert.rejects(gmailRoute(post(path), path, f.session, f.db, undefined, now), /gmail_disabled/)
    await assert.rejects(gmailRoute(post(path, { extra: true }), path, f.session, f.db, f.runtime, now))
    await assert.rejects(gmailRoute(post(path + '?x=1'), path, f.session, f.db, f.runtime, now), /validation_failed/)
    const admitted = await (await gmailRoute(post(path), path, f.session, f.db, f.runtime, now))!.json() as { id: string }
    const sync = `/v1/mailboxes/${admitted.id}/sync`
    const result = await (await gmailRoute(post(sync), sync, f.session, f.db, f.runtime, now))!.json()
    assert.deepEqual(result, { status: 'progress', imported: 1, deleted: 0 })
  } finally { await f.close() }
})

for (const change of ['revoke', 'expire'] as const) test(`session ${change} during read prevents page commits`, async () => {
  const f = await setup()
  try {
    const path = `/v1/connections/${f.id}/mailbox`
    const admitted = await (await gmailRoute(post(path), path, f.session, f.db, f.runtime, now))!.json() as { id: string }
    f.runtime.readProvider = () => ({ read: async () => {
      if (change === 'revoke') await f.db.prepare('DELETE FROM sessions WHERE token_hash=?').bind(f.session.token_hash).run()
      else await f.db.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind(now, f.session.token_hash).run()
      return { messages: [{ id: 'blocked', threadId: 'thread', sender: 'a@example.com', subject: '', body: '', at: now }],
        deleted: [], cursor: '10', next: null }
    } })
    const sync = `/v1/mailboxes/${admitted.id}/sync`
    await assert.rejects(gmailRoute(post(sync), sync, f.session, f.db, f.runtime, now), /sync_conflict/)
    assert.equal((await f.db.prepare("SELECT count(*) AS n FROM messages WHERE id='blocked'").first())?.n, 0)
    assert.equal((await f.db.prepare('SELECT cursor FROM gmail_sync WHERE mailbox_id=?').bind(admitted.id).first())?.cursor, null)
    await assert.rejects(gmailRoute(post(sync), sync, f.session, f.db, f.runtime, now), /unauthorized/)
  } finally { await f.close() }
})
