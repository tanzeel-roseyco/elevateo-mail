import test from 'node:test'
import assert from 'node:assert/strict'
import { fixture, now, request } from './fixture'
import { handleRequest } from '../worker'

const input = { mailboxId: 'mail', messageIds: ['message'], instruction: 'Draft a short reply', requestId: 'request1' }
async function setup() {
  const f = await fixture()
  await f.env.DB.prepare("UPDATE mailboxes SET ai_read=1,ai_draft=1 WHERE owner='alice'").run()
  await f.env.DB.prepare(`INSERT INTO messages(owner,id,mailbox_id,thread_id,subject,sender,body,at)
    VALUES('alice','message','mail','thread','Hello','sender@example.com','Untrusted content',?)`).bind(now).run()
  return f
}
function native(env: Env, path: string, body: unknown, time = now, headers = {}) {
  return handleRequest(new Request(`https://backend.test/v1/ai/native/${path}`, { method: 'POST',
    headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }), env, time)
}
async function issue(env: Env) {
  const response = await request(env, '/v1/ai/native/tickets', 'POST', input)
  assert.equal(response.status, 201)
  return response.json() as Promise<{ ticket: string; requestId: string; expiresAt: number }>
}
test('native ticket is one-use, returns bounded selected context and checks session revocation', async () => {
  const f = await setup()
  try {
    const ticket = await issue(f.env)
    const body = { ticket: ticket.ticket, requestId: ticket.requestId }
    const responses = await Promise.all([native(f.env, 'redeem', body), native(f.env, 'redeem', body)])
    assert.deepEqual(responses.map(r => r.status).sort(), [200, 401])
    const success = responses.find(r => r.status === 200)!
    assert.equal(success.headers.get('cache-control'), 'no-store')
    const result = await success.json() as { lease: string; requestId: string; context: string; accountId: string }
    assert.match(result.context, /untrusted-email/u)
    assert.match(result.accountId, /^[a-f0-9]{32}$/u)
    const check = { lease: result.lease, requestId: result.requestId }
    assert.equal((await native(f.env, 'check', check)).status, 200)
    await f.env.DB.prepare('DELETE FROM sessions').run()
    assert.equal((await native(f.env, 'check', check)).status, 401)
  } finally { await f.close() }
})
test('native handoff denies browser callers, wrong request, expiry and revoked grants', async () => {
  const f = await setup()
  try {
    const ticket = await issue(f.env)
    const body = { ticket: ticket.ticket, requestId: ticket.requestId }
    assert.equal((await native(f.env, 'redeem', body, now, { origin: 'https://backend.test' })).status, 403)
    assert.equal((await native(f.env, 'redeem', { ...body, requestId: 'other' })).status, 401)
    assert.equal((await native(f.env, 'redeem', body, now + 60_000)).status, 401)
    await f.env.DB.prepare("UPDATE mailboxes SET ai_draft=0 WHERE owner='alice'").run()
    assert.equal((await native(f.env, 'redeem', body)).status, 401)
    assert.equal((await request(f.env, '/v1/ai/native/tickets', 'POST', input)).status, 401)
  } finally { await f.close() }
})
test('native handoff bounds outstanding requests and requires every selected message', async () => {
  const f = await setup()
  try {
    const ticket = await issue(f.env)
    await f.env.DB.prepare('DELETE FROM messages').run()
    assert.equal((await native(f.env, 'redeem', { ticket: ticket.ticket, requestId: ticket.requestId })).status, 409)
    for (let i = 0; i < 9; i++) await issue(f.env)
    assert.equal((await request(f.env, '/v1/ai/native/tickets', 'POST', input)).status, 429)
    assert.equal((await request(f.env, '/v1/ai/native/tickets', 'POST', { ...input, messageIds: ['message', 'message'] })).status, 400)
  } finally { await f.close() }
})
test('a delayed native body cannot extend ticket lifetime', async () => {
  const f = await setup()
  try {
    const ticket = await issue(f.env)
    await f.env.DB.prepare('UPDATE native_draft_tickets SET expires_at=?').bind(now + 10).run()
    const body = new ReadableStream({ async start(controller) {
      await new Promise(resolve => setTimeout(resolve, 40))
      controller.enqueue(new TextEncoder().encode(JSON.stringify({ ticket: ticket.ticket, requestId: ticket.requestId })))
      controller.close()
    } })
    const response = await handleRequest(new Request('https://backend.test/v1/ai/native/redeem', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half',
    } as RequestInit), f.env, now)
    assert.equal(response.status, 401)
  } finally { await f.close() }
})
test('session revoked during context loading cannot release context', async () => {
  const f = await setup()
  try {
    const ticket = await issue(f.env), db = f.env.DB
    const fenced = new Proxy(db, { get(target, key) {
      if (key !== 'prepare') return Reflect.get(target, key)
      return (sql: string) => {
        const statement = target.prepare(sql)
        if (!sql.startsWith('SELECT id,subject,body FROM messages')) return statement
        return { bind: (...values: unknown[]) => ({ all: async () => {
          const result = await statement.bind(...values).all()
          await db.prepare('DELETE FROM sessions').run()
          return result
        } }) }
      }
    } })
    const response = await native({ ...f.env, DB: fenced }, 'redeem', { ticket: ticket.ticket, requestId: ticket.requestId })
    assert.equal(response.status, 401)
    assert.equal(JSON.stringify(await response.json()).includes('Untrusted content'), false)
  } finally { await f.close() }
})
