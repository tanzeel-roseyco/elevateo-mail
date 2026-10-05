import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GmailReadProvider } from '../providers/gmailRead'
import { GmailCursorExpired, type GmailSyncRequest } from '../gmailSync'

// AIDEV-NOTE: HTTP fixtures exercise Gmail boundaries without live accounts or network calls.
const full: GmailSyncRequest = { subject: 'account', mode: 'full', cursor: null, pageToken: null, limit: 25 }
const history: GmailSyncRequest = { ...full, mode: 'history', cursor: '100' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const message = (id = 'one') => ({ id, threadId: 'thread', internalDate: '1234', payload: {
  mimeType: 'multipart/alternative', headers: [{ name: 'From', value: 'Alice <alice@example.com>' }, { name: 'Subject', value: 'Hello' }],
  parts: [{ mimeType: 'text/plain', body: { data: btoa('Plain content') } },
    { mimeType: 'text/html', body: { data: btoa('<script>bad()</script>') } }],
} })

test('only explicit INBOX labels mark arrivals; sent, archived and missing labels fail closed', async () => {
  const adapter = new GmailReadProvider('token', 'account', async url => {
    if (url.includes('/messages?')) return json({ messages: ['inbox', 'sent', 'archived', 'missing'].map(id => ({ id })) })
    const id = new URL(url).pathname.split('/').at(-1)!
    return json({ ...message(id), ...(id === 'missing' ? {} : { labelIds: id === 'inbox' ? ['INBOX'] : id === 'sent' ? ['SENT'] : [] }) })
  })
  const result = await adapter.read({ ...full, cursor: '100' }) as { messages: { id: string; inbox?: boolean }[] }
  assert.deepEqual(result.messages.map(item => [item.id, item.inbox === true]), [['inbox', true], ['sent', false], ['archived', false], ['missing', false]])
})

test('out-of-range dates are quarantined while the exact Date maximum remains valid', async () => {
  const adapter = new GmailReadProvider('token', 'account', async url => {
    if (url.includes('/messages?')) return json({ messages: [{ id: 'bad' }, { id: 'edge' }] })
    const id = url.includes('/messages/bad') ? 'bad' : 'edge'
    return json({ ...message(id), internalDate: id === 'bad' ? '8640000000000001' : '8640000000000000' })
  })
  const result = await adapter.read({ ...full, cursor: '100' }) as { messages: { id: string; at: number }[]; incomplete: unknown[] }
  assert.deepEqual(result.messages.map(({ id, at }) => ({ id, at })), [{ id: 'edge', at: 8_640_000_000_000_000 }])
  assert.deepEqual(result.incomplete, [{ id: 'bad', reason: 'message_content_unsupported' }])
})

test('oversized message is quarantined while subsequent valid messages progress', async () => {
  let cancelled = false
  const adapter = new GmailReadProvider('token', 'account', async url => {
    if (url.includes('/messages?')) return json({ messages: [{ id: 'large' }, { id: 'valid' }] })
    if (url.includes('/messages/valid')) return json(message('valid'))
    return new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new Uint8Array(65_537)) },
      cancel() { cancelled = true },
    }))
  })
  const result = await adapter.read({ ...full, cursor: '100' }) as { messages: { id: string }[]; incomplete: unknown[] }
  assert.equal(cancelled, true)
  assert.deepEqual(result.messages.map(item => item.id), ['valid'])
  assert.deepEqual(result.incomplete, [{ id: 'large', reason: 'message_content_unsupported' }])
})

test('oversized auth errors and broken transport never become incomplete content', async () => {
  for (const failure of ['auth', 'transport'] as const) {
    const adapter = new GmailReadProvider('token', 'account', async url => {
      if (url.includes('/messages?')) return json({ messages: [{ id: 'one' }] })
      if (failure === 'auth') return new Response('x'.repeat(70_000), { status: 401 })
      return new Response(new ReadableStream({ start(controller) { controller.error(new Error('private token')) } }))
    })
    await assert.rejects(adapter.read({ ...full, cursor: '100' }), {
      code: failure === 'auth' ? 'gmail_credentials_expired' : 'gmail_response_unavailable',
    })
  }
})

test('Gmail full scan captures watermark before listing and preserves it across pages', async () => {
  const paths: string[] = []
  const adapter = new GmailReadProvider('token', 'account', async (url, init) => {
    const parsed = new URL(url); paths.push(parsed.pathname)
    assert.equal(parsed.origin, 'https://gmail.googleapis.com')
    assert.equal(init.redirect, 'error')
    if (parsed.pathname.endsWith('/profile')) return json({ historyId: '100' })
    if (parsed.pathname.endsWith('/messages')) { assert.equal(parsed.searchParams.get('maxResults'), '25'); return json({ messages: [{ id: 'one' }], nextPageToken: 'next' }) }
    return json(message())
  })
  assert.deepEqual(await adapter.read(full), { messages: [{ id: 'one', threadId: 'thread', sender: 'alice@example.com',
    subject: 'Hello', body: 'Plain content', at: 1234 }], deleted: [], cursor: '100', next: 'next' })
  assert.ok(paths[0]?.endsWith('/profile'))
  paths.length = 0
  await adapter.read({ ...full, cursor: '100', pageToken: 'next' })
  assert.ok(paths.every(path => !path.endsWith('/profile')))
})

test('Gmail history collapses changes chronologically and passes pagination', async () => {
  const adapter = new GmailReadProvider('token', 'account', async url => {
    const parsed = new URL(url)
    if (parsed.pathname.endsWith('/history')) {
      assert.equal(parsed.searchParams.get('startHistoryId'), '100'); assert.equal(parsed.searchParams.get('pageToken'), 'next')
      return json({ historyId: '200', nextPageToken: 'last', history: [
        { id: '102', messagesDeleted: [{ message: { id: 'one' } }], messagesAdded: [{ message: { id: 'two' } }] },
        { id: '101', messagesAdded: [{ message: { id: 'one' } }], messagesDeleted: [{ message: { id: 'two' } }] },
      ] })
    }
    return json(message('two'))
  })
  const result = await adapter.read({ ...history, pageToken: JSON.stringify({ v: 1, p: 'next', o: 0, h: null }) }) as { messages: { id: string }[]; deleted: string[]; cursor: string; next: string }
  assert.deepEqual(result.messages.map(item => item.id), ['two']); assert.deepEqual(result.deleted, ['one'])
  assert.equal(result.cursor, '200'); assert.equal(JSON.parse(result.next).p, 'last')
})

test('Gmail expired history is distinct from individual message disappearance', async () => {
  await assert.rejects(new GmailReadProvider('token', 'account', async () => json({}, 404)).read(history), GmailCursorExpired)
  const adapter = new GmailReadProvider('token', 'account', async url => url.includes('/history?')
    ? json({ historyId: '200', history: [{ id: '101', messagesAdded: [{ message: { id: 'one' } }] }] }) : json({}, 404))
  assert.deepEqual(await adapter.read(history), { messages: [], deleted: ['one'], cursor: '200', next: null })
})

test('Gmail durably subpages 31 IDs, then applies deletion on the next remote page', async () => {
  const requested: (string | null)[] = []
  const adapter = new GmailReadProvider('token', 'account', async url => {
    const parsed = new URL(url)
    if (!parsed.pathname.endsWith('/history')) return json(message(parsed.pathname.split('/').at(-1)))
    const remote = parsed.searchParams.get('pageToken'); requested.push(remote)
    assert.equal(parsed.searchParams.get('startHistoryId'), '100')
    return json(remote ? { historyId: '300', history: [{ id: '250', messagesDeleted: [{ message: { id: 'm0' } }] }] }
      : { historyId: '200', nextPageToken: 'remote2', history: [{ id: '101',
        messagesAdded: Array.from({ length: 31 }, (_, i) => ({ message: { id: `m${i}` } })) }] })
  })
  type Page = { messages: { id: string }[]; deleted: string[]; next: string | null; cursor: string }
  const first = await adapter.read(history) as Page
  assert.equal(first.messages.length, 25); assert.ok(first.next && first.next.length < 2048)
  const second = await adapter.read({ ...history, pageToken: first.next }) as Page
  assert.equal(second.messages.length, 6)
  assert.equal(new Set([...first.messages, ...second.messages].map(item => item.id)).size, 31)
  const last = await adapter.read({ ...history, pageToken: second.next }) as Page
  assert.deepEqual(last.deleted, ['m0']); assert.equal(last.next, null); assert.equal(last.cursor, '300')
  assert.deepEqual(requested, [null, null, 'remote2'])
})

test('Gmail subpage replay resets safely when history expires or its page changes', async () => {
  let changed = false; let expired = false; let watermark = '200'
  const adapter = new GmailReadProvider('token', 'account', async url => {
    if (!url.includes('/history?')) return json(message(new URL(url).pathname.split('/').at(-1)))
    if (expired) return json({}, 404)
    return json({ historyId: watermark, history: [{ id: '101',
      messagesDeleted: Array.from({ length: 31 }, (_, i) => ({ message: { id: `${changed ? 'changed' : 'm'}${i}` } })) }] })
  })
  const first = await adapter.read(history) as { next: string }
  watermark = '201'
  const resumed = await adapter.read({ ...history, pageToken: first.next }) as { deleted: string[]; cursor: string }
  assert.equal(resumed.deleted.length, 6); assert.equal(resumed.cursor, '201')
  changed = true
  await assert.rejects(adapter.read({ ...history, pageToken: first.next }), GmailCursorExpired)
  expired = true
  await assert.rejects(adapter.read({ ...history, pageToken: first.next }), GmailCursorExpired)
})

test('Gmail rejects subject mismatch before network and redacts malformed/oversized responses', async () => {
  const forbidden = new GmailReadProvider('token', 'account', async () => { throw new Error('must not call') })
  await assert.rejects(forbidden.read({ ...full, subject: 'foreign' }), { code: 'gmail_sync_request_invalid' })
  for (const body of [{ historyId: 'bad' }, { historyId: '1', filler: 'x'.repeat(70000) }]) {
    await assert.rejects(new GmailReadProvider('token', 'account', async () => json(body)).read(full), /gmail_/u)
  }
})

test('Gmail records unsupported content without blocking valid messages on the same page', async () => {
  for (const body of [{ data: '_w' }, { attachmentId: 'attachment' }]) {
    const adapter = new GmailReadProvider('token', 'account', async url => {
      if (url.includes('/messages?')) return json({ messages: [{ id: 'before' }, { id: 'one' }, { id: 'after' }] })
      const id = new URL(url).pathname.split('/').at(-1)!
      if (id !== 'one') return json(message(id))
      return json({ ...message(), payload: { ...message().payload, mimeType: 'text/plain', parts: [], body } })
    })
    const result = await adapter.read({ ...full, cursor: '100' }) as { messages: { id: string }[]; incomplete: unknown[]; next: null }
    assert.deepEqual(result.messages.map(item => item.id), ['before', 'after'])
    assert.deepEqual(result.incomplete, [{ id: 'one', reason: 'message_content_unsupported' }])
    assert.equal(result.next, null)
  }
})

test('Gmail records HTML-only mail as incomplete but accepts an empty plain-text body', async () => {
  const adapter = new GmailReadProvider('token', 'account', async url => {
    if (url.includes('/messages?')) return json({ messages: [{ id: 'html' }, { id: 'empty' }] })
    const id = new URL(url).pathname.split('/').at(-1)!
    return json({ ...message(id), payload: { ...message(id).payload, parts: [
      id === 'html' ? { mimeType: 'text/html', body: { data: btoa('<p>Visible content</p>') } }
        : { mimeType: 'text/plain', body: { data: '' } },
    ] } })
  })
  const result = await adapter.read({ ...full, cursor: '100' }) as {
    messages: { id: string; body: string }[]; incomplete: unknown[]; cursor: string; next: null
  }
  assert.deepEqual(result.messages.map(({ id, body }) => ({ id, body })), [{ id: 'empty', body: '' }])
  assert.deepEqual(result.incomplete, [{ id: 'html', reason: 'message_content_unsupported' }])
  assert.equal(result.cursor, '100'); assert.equal(result.next, null)
})

test('Gmail quarantines malformed sender but never treats authentication failure as incomplete content', async () => {
  let status = 200
  const adapter = new GmailReadProvider('token', 'account', async url => {
    if (url.includes('/messages?')) return json({ messages: [{ id: 'one' }] })
    return json({ ...message(), payload: { ...message().payload, headers: [{ name: 'From', value: 'invalid' }] } }, status)
  })
  const result = await adapter.read({ ...full, cursor: '100' }) as { incomplete: unknown[] }
  assert.equal(result.incomplete.length, 1)
  status = 401
  await assert.rejects(adapter.read({ ...full, cursor: '100' }), { code: 'gmail_credentials_expired' })
})
