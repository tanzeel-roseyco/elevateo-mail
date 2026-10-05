import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, request } from './fixture'

async function errorCode(response: Response, status: number, code: string) {
  assert.equal(response.status, status)
  const body = await response.json() as { error: { code: string } }
  assert.equal(body.error.code, code)
}

// AIDEV-NOTE: Exercise worker composition so optional Gmail configuration cannot block safe account maintenance.
test('Gmail defaults disabled across status, OAuth and advertised capabilities', async () => {
  const f = await fixture()
  try {
    const status = await request(f.env, '/v1/gmail/status')
    assert.equal(status.status, 200)
    assert.deepEqual(await status.json(), { enabled: false })
    await errorCode(await request(f.env, '/v1/connections/oauth/begin', 'POST', {}), 503, 'connection_oauth_disabled')
    await errorCode(await request(f.env, '/v1/connections/oauth/complete', 'POST',
      { callbackUrl: 'https://app.test/connections/gmail/callback?code=fixture' }), 503, 'connection_oauth_disabled')
    const response = await request(f.env, '/v1/capabilities')
    assert.equal(response.status, 200)
    const capabilities = await response.json() as { liveSending: boolean; dnsWrites: boolean; features: { inboxSync: boolean } }
    assert.equal(capabilities.features.inboxSync, false)
    assert.equal(capabilities.liveSending, false)
    assert.equal(capabilities.dnsWrites, false)
    for (const [path, method] of [['/v1/gmail/status', 'GET'], ['/v1/connections/oauth/begin', 'POST'],
      ['/v1/connections/grant/mailbox', 'POST'], ['/v1/mailboxes/mail/sync', 'POST']]) {
      await errorCode(await request(f.env, path!, method!, method === 'POST' ? {} : undefined, 'invalid'), 401, 'unauthorized')
    }
  } finally { await f.close() }
})

test('invalid Gmail configuration fails relevant routes but preserves owned metadata and revocation', async () => {
  const f = await fixture()
  try {
    const env = { ...f.env, GMAIL_ENABLED: 'true' }
    await f.env.DB.batch([
      f.env.DB.prepare("UPDATE mailboxes SET provider='gmail' WHERE owner='alice' AND id='mail'"),
      f.env.DB.prepare("INSERT INTO provider_credentials(owner,id,provider,subject,sealed) VALUES('alice','grant','gmail','subject','synthetic'),('bob','foreign','gmail','other','synthetic')"),
    ])
    for (const [path, method] of [['/v1/gmail/status', 'GET'], ['/v1/capabilities', 'GET'],
      ['/v1/connections/oauth/begin', 'POST'], ['/v1/connections/grant/mailbox', 'POST'], ['/v1/mailboxes/mail/sync', 'POST']]) {
      await errorCode(await request(env, path!, method!, method === 'POST' ? {} : undefined), 503, 'gmail_configuration_invalid')
    }
    assert.equal((await request(env, '/v1/mailboxes')).status, 200)
    const response = await request(env, '/v1/connections')
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { items: [{ id: 'grant', provider: 'gmail', subject: 'subject', revision: 1, revoked: false }], next: null })
    await errorCode(await request(env, '/v1/connections/foreign/revoke', 'POST', {}), 404, 'connection_not_found')
    assert.equal((await request(env, '/v1/connections/grant/revoke', 'POST', {})).status, 200)
    assert.deepEqual(await f.env.DB.prepare("SELECT sealed,revision FROM provider_credentials WHERE owner='alice' AND id='grant'").first(), { sealed: null, revision: 2 })
    assert.equal((await f.env.DB.prepare("SELECT connected FROM mailboxes WHERE owner='alice' AND id='mail'").first())?.connected, 0)
    assert.equal((await f.env.DB.prepare("SELECT sealed FROM provider_credentials WHERE owner='bob' AND id='foreign'").first())?.sealed, 'synthetic')
  } finally { await f.close() }
})

test('worker generic permissions cannot reconnect real mailboxes', async () => {
  const f = await fixture()
  try {
    await f.env.DB.prepare("UPDATE mailboxes SET provider='gmail',connected=0,send_enabled=0 WHERE owner='alice'").run()
    await errorCode(await request(f.env, '/v1/mailboxes/mail/permissions', 'PATCH',
      { connected: true, sendEnabled: false, aiRead: false, aiDraft: false, aiSend: false }), 409, 'verified_connection_required')
    assert.equal((await f.env.DB.prepare("SELECT connected FROM mailboxes WHERE owner='alice' AND id='mail'").first())?.connected, 0)
  } finally { await f.close() }
})
