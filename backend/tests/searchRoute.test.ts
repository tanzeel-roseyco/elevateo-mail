import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, request } from './fixture'
import { messageSearchPage } from '../contracts/v1'

// AIDEV-NOTE: Real D1 tests cover literal wildcard search and continuation through a bounded empty window.
async function seed(env: Env, count: number, subject: (index: number) => string) {
  for (let start = 0; start < count; start += 100) {
    await env.DB.batch(Array.from({ length: Math.min(100, count - start) }, (_, offset) => {
      const index = start + offset
      return env.DB.prepare('INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at) VALUES(?,?,?,?,?,?,?,?)')
        .bind('alice', 'mail', `m${index.toString().padStart(4, '0')}`, 'thread', 'sender@example.com', subject(index), 'hidden body phrase', count - index)
    }))
  }
}
async function page(env: Env, q: string, cursor?: { before: number; beforeId: string }, limit = 25) {
  const params = new URLSearchParams({ mailboxId: 'mail', q, limit: String(limit),
    ...(cursor ? { before: String(cursor.before), beforeId: cursor.beforeId } : {}) })
  const response = await request(env, `/v1/messages/search?${params}`)
  assert.equal(response.status, 200)
  return messageSearchPage.parse(await response.json())
}
test('search escapes wildcards, matches sender case-insensitively and excludes bodies', async () => {
  const { env, close } = await fixture()
  try {
    await seed(env, 3, index => ['Save 50%_\\ now', 'Save 50xx now', 'ordinary'][index]!)
    assert.equal((await page(env, '50%_\\')).items.length, 1)
    assert.equal((await page(env, 'SENDER@')).items.length, 3)
    assert.equal((await page(env, 'hidden body')).items.length, 0)
    assert.equal((await page(env, 'absent')).next, null)
  } finally { await close() }
})
test('search continuation never skips matches and can cross an empty 1000-row window', async () => {
  const { env, close } = await fixture()
  try {
    await seed(env, 1003, index => index < 1000 ? 'ordinary' : 'needle')
    const first = await page(env, 'needle')
    assert.equal(first.items.length, 0); assert.equal(first.search.scanned, 1000); assert.ok(first.next)
    const second = await page(env, 'needle', first.next, 2)
    assert.deepEqual(second.items.map(item => item.id), ['m1000', 'm1001']); assert.ok(second.next)
    const third = await page(env, 'needle', second.next, 2)
    assert.deepEqual(third.items.map(item => item.id), ['m1002']); assert.equal(third.next, null)
  } finally { await close() }
})
test('search validates bounds and rejects foreign mailbox and unauthenticated access', async () => {
  const { env, close } = await fixture()
  try {
    for (const query of ['q=ab', `q=${'a'.repeat(101)}`, 'q=abc&limit=26', 'q=abc&before=1', 'q=abc&q=def', 'q=abc&extra=1']) {
      assert.equal((await request(env, `/v1/messages/search?mailboxId=mail&${query}`)).status, 400)
    }
    await env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address) VALUES('bob','private','fake','private','bob@example.com')").run()
    assert.equal((await request(env, '/v1/messages/search?mailboxId=private&q=abc')).status, 404)
    assert.equal((await request(env, '/v1/messages/search?mailboxId=mail&q=abc', 'GET', undefined, 'invalid')).status, 401)
  } finally { await close() }
})
