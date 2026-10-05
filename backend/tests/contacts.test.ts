import assert from 'node:assert/strict'
import test from 'node:test'
import { fixture, request } from './fixture'

test('contact inventory is private, paginated and reports sticky suppression', async () => {
  const f = await fixture()
  try {
    const rows = [
      { email: 'a@example.com', consentSource: 'Signup form', optedIn: true },
      { email: 'b@example.com', consentSource: 'Withdrawal request', optedIn: false },
    ]
    assert.equal((await request(f.env, '/v1/contacts/import', 'POST', rows)).status, 200)
    await f.env.DB.prepare("INSERT INTO contacts VALUES('bob','private@example.com','Private',1)").run()
    await request(f.env, '/v1/contacts/import', 'POST', [{ ...rows[1], optedIn: true }])
    const first = await (await request(f.env, '/v1/contacts?limit=1')).json() as { items: { email: string }[]; next: string }
    assert.equal(first.items.length, 1)
    assert.equal(first.next, 'a@example.com')
    const second = await (await request(f.env, `/v1/contacts?limit=1&after=${first.next}`)).json() as { items: { email: string; suppression: string }[]; next: null }
    assert.equal(second.items[0]?.email, 'b@example.com')
    assert.equal(second.items[0]?.suppression, 'withdrawal')
    assert.equal(second.next, null)
  } finally { await f.close() }
})
test('contact boundary rejects malformed pagination and duplicate or empty imports', async () => {
  const f = await fixture()
  try {
    for (const suffix of ['?limit=101', '?limit=1&limit=2', '?after=invalid', '?unexpected=1']) {
      assert.equal((await request(f.env, `/v1/contacts${suffix}`)).status, 400)
    }
    assert.deepEqual(await (await request(f.env, '/v1/contacts')).json(), { items: [], next: null })
    assert.equal((await request(f.env, '/v1/contacts/import', 'POST', [])).status, 400)
    const row = { email: 'a@example.com', consentSource: 'Signup', optedIn: true }
    assert.equal((await request(f.env, '/v1/contacts/import', 'POST', [row, row])).status, 400)
    assert.equal((await request(f.env, '/v1/contacts/import', 'POST', [{ ...row, consentSource: '' }])).status, 400)
  } finally { await f.close() }
})
