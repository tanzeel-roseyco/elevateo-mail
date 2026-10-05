import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, request } from './fixture'

// AIDEV-NOTE: Generic fixture permissions cannot resurrect a real mailbox or silently authorize sending.
test('real mailbox permission changes require verified admission and separate grants', async () => {
  const f = await fixture()
  try {
    await f.env.DB.prepare("UPDATE mailboxes SET provider='gmail',connected=0,send_enabled=0").run()
    const disabled = { connected: false, sendEnabled: false, aiRead: false, aiDraft: false, aiSend: false }
    for (const key of Object.keys(disabled)) {
      const response = await request(f.env, '/v1/mailboxes/mail/permissions', 'PATCH', { ...disabled, [key]: true })
      assert.equal(response.status, 409)
    }
    assert.equal((await request(f.env, '/v1/mailboxes/mail/permissions', 'PATCH', disabled)).status, 200)
    assert.equal((await request(f.env, '/v1/mailboxes/foreign/permissions', 'PATCH', disabled)).status, 404)
    const row = await f.env.DB.prepare("SELECT connected,send_enabled FROM mailboxes WHERE owner='alice' AND id='mail'").first()
    assert.deepEqual(row, { connected: 0, send_enabled: 0 })
  } finally { await f.close() }
})
