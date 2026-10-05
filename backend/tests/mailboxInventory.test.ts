import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixture, request } from './fixture'

// AIDEV-NOTE: Years of disconnected history must neither break startup nor disappear from management.
test('connected inventory is bounded while archived mailboxes remain owner-scoped and fully pageable', async () => {
  const f = await fixture()
  try {
    await f.env.DB.batch(Array.from({ length: 305 }, (_, n) => {
      const id = `archive-${String(n).padStart(4, '0')}`
      return f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,connected) VALUES('alice',?,'fake',?,?,0)").bind(id, id, `${id}@example.com`)
    }))
    await f.env.DB.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,connected) VALUES('bob','foreign','fake','foreign','foreign@example.com',0)").run()
    type Page = { items: { id: string; connected: number }[]; next: { after: string } | null }
    const active = await (await request(f.env, '/v1/mailboxes?connected=true&limit=10')).json() as Page
    assert.deepEqual(active.items.map(m => m.id), ['mail'])
    assert.equal(active.next, null)
    const ids: string[] = []
    let after: string | null = null
    do {
      const page = await (await request(f.env, `/v1/mailboxes?connected=false&limit=25${after ? `&after=${after}` : ''}`)).json() as Page
      assert.ok(page.items.length <= 25)
      assert.ok(page.items.every(m => m.connected === 0))
      ids.push(...page.items.map(m => m.id))
      after = page.next?.after ?? null
    } while (after)
    assert.equal(new Set(ids).size, 305)
    assert.equal(ids.length, 305)
    assert.equal((await (await request(f.env, '/v1/mailboxes?id=foreign&limit=1')).json() as Page).items.length, 0)
    assert.equal((await (await request(f.env, '/v1/mailboxes?id=archive-0304&limit=1')).json() as Page).items[0]?.id, 'archive-0304')
    const all = await (await request(f.env, '/v1/mailboxes?limit=100')).json() as Page
    assert.equal(all.items.length, 100)
    for (const query of ['connected=yes', 'connected=true&connected=false', 'limit=101', 'other=1']) {
      assert.equal((await request(f.env, `/v1/mailboxes?${query}`)).status, 400)
    }
  } finally { await f.close() }
})
