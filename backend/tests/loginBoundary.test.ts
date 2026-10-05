import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, request } from './fixture'

// AIDEV-NOTE: Unconfigured public login routes never need a fixture session and cannot issue credentials.
test('public login status is disabled without credentials and begin fails closed', async () => {
  const f = await fixture()
  try {
    const status = await request(f.env, '/v1/login/status', 'GET', undefined, 'invalid')
    assert.equal(status.status, 200)
    assert.deepEqual(await status.json(), { enabled: false })
    assert.equal(status.headers.get('cache-control'), 'no-store')
    assert.equal((await request(f.env, '/v1/login/status?unexpected=1', 'GET', undefined, 'invalid')).status, 400)
    assert.equal((await request(f.env, '/v1/login/begin', 'POST', {}, 'invalid')).status, 503)
    assert.equal((await request(f.env, '/v1/mailboxes', 'GET', undefined, 'invalid')).status, 401)
  } finally { await f.close() }
})
