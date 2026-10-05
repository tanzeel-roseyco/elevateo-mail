import { describe, expect, it, vi } from 'vitest'
import { capabilitiesResponse, messageDetail } from './contract'
import type { SendContent } from '@/domain/sendLifecycle'
import { ApiFailure, createHttpClient } from './httpClient'
import { createFixtureSignIn, createHttpGateway } from './httpGateway'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const client = (fetchImpl: typeof fetch, timeoutMs = 50) => createHttpClient({ baseUrl: '', fetch: fetchImpl, timeoutMs })
const draft: SendContent = { mailboxId: 'mb', to: ['a@example.com'], cc: [], bcc: [], subject: 'S', body: 'B' }
const row = { id: 'i1', mailbox_id: 'mb', idempotency_key: 'key-1', revision: 'b'.repeat(64), status: 'draft', created_at: 1_800_000_000_000, updated_at: 1_800_000_000_000, scheduled_at: 1_800_000_000_000, successor_id: null }
const failure = async (run: Promise<unknown>): Promise<ApiFailure> => {
  const error = await run.then(
    () => null,
    (e: unknown) => e,
  )
  if (!(error instanceof ApiFailure)) throw new Error('expected an ApiFailure')
  return error
}
const saved = { saved: true, simulated: true }

describe('HTTP client', () => {
  it('sends the cookie session, the CSRF marker and a JSON body, and never a bearer token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(saved))
    const gateway = createHttpGateway(client(fetchImpl))
    await gateway.approveSendRequest('intent-1', 'a'.repeat(64))
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('/v1/send-intents/intent-1/approve')
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ revision: 'a'.repeat(64) }), cache: 'no-store' })
    expect(init?.credentials).toBe('same-origin')
    expect(init?.headers).toMatchObject({ 'x-elevateo-csrf': '1', 'content-type': 'application/json' })
    expect(JSON.stringify(init?.headers).toLowerCase()).not.toContain('authorization')
  })

  it('sends no CSRF marker on a read', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ accountId: 'a'.repeat(32), session: { expiresAt: 1_800_000_000_000 }, simulated: true }))
    const me = await createHttpGateway(client(fetchImpl)).me()
    expect(me).toEqual({ accountId: 'a'.repeat(32), sessionExpiresAt: '2027-01-15T08:00:00.000Z' })
    expect(fetchImpl.mock.calls[0]![1]?.headers).not.toHaveProperty('x-elevateo-csrf')
    expect(fetchImpl.mock.calls[0]![1]?.credentials).toBe('same-origin')
  })

  it('reports a 401 as an ended session', async () => {
    const error = await failure(client(async () => json({ error: { code: 'unauthorized', requestId: 'r-1' } }, 401)).request('GET', '/v1/capabilities', capabilitiesResponse))
    expect(error).toMatchObject({ kind: 'unauthorized', code: 'unauthorized', status: 401, requestId: 'r-1', outcomeUncertain: false })
  })

  it('reports a coded refusal as definite, with the server code', async () => {
    const error = await failure(client(async () => json({ error: { code: 'quota_exceeded', requestId: 'r-2' } }, 409)).request('GET', '/x', capabilitiesResponse))
    expect(error).toMatchObject({ kind: 'refused', code: 'quota_exceeded', status: 409, outcomeUncertain: false })
    expect(error.message).toContain('still awaiting approval')
  })

  it('treats a network failure as uncertain, never as success', async () => {
    const error = await failure(
      client(async () => {
        throw new TypeError('Failed to fetch')
      }).request('GET', '/x', capabilitiesResponse),
    )
    expect(error).toMatchObject({ kind: 'network', outcomeUncertain: true })
  })

  it('aborts and reports a timeout when no answer arrives', async () => {
    const hang: typeof fetch = (_input, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const error = await failure(client(hang, 10).request('GET', '/x', capabilitiesResponse))
    expect(error).toMatchObject({ kind: 'timeout', outcomeUncertain: true })
  })

  it('treats a proxy error page as unavailable and uncertain', async () => {
    const error = await failure(client(async () => new Response('<html>Bad gateway</html>', { status: 502 })).request('GET', '/x', capabilitiesResponse))
    expect(error).toMatchObject({ kind: 'unavailable', status: 502, outcomeUncertain: true })
  })

  it('treats a coded internal error as uncertain', async () => {
    const error = await failure(client(async () => json({ error: { code: 'internal_error', requestId: 'r-3' } }, 500)).request('GET', '/x', capabilitiesResponse))
    expect(error).toMatchObject({ kind: 'refused', code: 'internal_error', outcomeUncertain: true })
  })

  it('refuses a successful answer of the wrong shape instead of rendering it', async () => {
    const error = await failure(client(async () => json({ version: 2 })).request('GET', '/v1/capabilities', capabilitiesResponse))
    expect(error.kind).toBe('unavailable')
  })

  it('refuses a message body that is not marked plain text from an untrusted sender', async () => {
    const message = { id: 'm1', thread_id: 't1', mailbox_id: 'mb', sender: 's@example.com', subject: 'S', at: 1, body: '<b>x</b>' }
    expect(messageDetail.safeParse({ message, contentType: 'text/html', trust: 'untrusted-email' }).success).toBe(false)
    expect(messageDetail.safeParse({ message, contentType: 'text/plain', trust: 'untrusted-email' }).success).toBe(true)
  })
})

describe('HTTP gateway', () => {
  it('refuses an id that could alter the request path, without calling the server', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const gateway = createHttpGateway(client(fetchImpl))
    await expect(gateway.getSendRequest('../mailboxes')).rejects.toMatchObject({ kind: 'refused', code: 'validation_failed' })
    await expect(gateway.getMessage('mb', 'a/b')).rejects.toBeInstanceOf(ApiFailure)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('creates a manual request under the caller key and maps the reply', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ id: 'i1', revision: 'b'.repeat(64), status: 'draft', simulated: true }, 201))
    const created = await createHttpGateway(client(fetchImpl)).createSendRequest('key-1', { mailboxId: 'mb', to: ['a@example.com'], cc: [], bcc: [], subject: 'S', body: 'B' })
    expect(created).toEqual({ id: 'i1', revision: 'b'.repeat(64), status: 'draft' })
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toEqual({ mailboxId: 'mb', to: ['a@example.com'], cc: [], bcc: [], subject: 'S', body: 'B', kind: 'manual', revision: 1, idempotencyKey: 'key-1' })
  })

  it('lists send requests a bounded page at a time, without content', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ items: [row], next: { before: 7, beforeId: 'i0' }, simulated: true }))
    const page = await createHttpGateway(client(fetchImpl)).listSendRequests({ before: 9, beforeId: 'i9' }, 500)
    expect(fetchImpl.mock.calls[0]![0]).toBe('/v1/send-intents?limit=50&before=9&beforeId=i9')
    expect(page).toEqual({ items: [{ id: 'i1', mailboxId: 'mb', idempotencyKey: 'key-1', revision: 'b'.repeat(64), status: 'draft', createdAt: '2027-01-15T08:00:00.000Z', successorId: null }], next: { before: 7, beforeId: 'i0' } })
  })

  it('reads saved content and refuses an answer of the wrong shape', async () => {
    const content = { from: 'me@example.com', to: ['a@example.com'], cc: [], bcc: [], subject: 'S', body: 'B', kind: 'manual' }
    const good = await createHttpGateway(client(async () => json({ intent: { ...row, successor_id: 'i2' }, content, simulated: true }))).getSendContent('i1')
    expect(good).toMatchObject({ summary: { id: 'i1', successorId: 'i2' }, from: 'me@example.com', to: ['a@example.com'], body: 'B', kind: 'manual' })
    const bad = await failure(createHttpGateway(client(async () => json({ intent: row, content: { ...content, body: 7 }, simulated: true }))).getSendContent('i1'))
    expect(bad.kind).toBe('unavailable')
  })

  it('replaces a request atomically under a new key and the predecessor revision', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ predecessorId: 'i1', id: 'i2', revision: 'c'.repeat(64), status: 'draft', simulated: true }))
    const replaced = await createHttpGateway(client(fetchImpl)).replaceSendRequest('i1', 'b'.repeat(64), 'key-2', draft)
    expect(replaced).toEqual({ predecessorId: 'i1', id: 'i2', revision: 'c'.repeat(64), status: 'draft' })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/v1/send-intents/i1/replace')
    expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toEqual({ revision: 'b'.repeat(64), draft: { ...draft, kind: 'manual', revision: 1, idempotencyKey: 'key-2' } })
  })

  it('signs out and starts a fixture session through their own routes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url) => json(String(url).includes('logout') ? { signedOut: true, simulated: true } : { provisioned: true, simulated: true }))
    const http = client(fetchImpl)
    await createHttpGateway(http).logout()
    await createFixtureSignIn(http).provision('alice')
    expect(fetchImpl.mock.calls.map((c) => [c[0], c[1]?.method, c[1]?.body])).toEqual([['/v1/session/logout', 'POST', undefined], ['/__fixture/session', 'POST', JSON.stringify({ user: 'alice' })]])
  })

  it('reports a fixture refusal, whose error shape differs, as a failure rather than a session', async () => {
    const error = await failure(createFixtureSignIn(client(async () => json({ error: 'fixture_session_expired' }, 401))).provision('alice'))
    expect(error.kind).toBe('unavailable')
  })

  it('passes both cursor parts back unchanged and converts times to ISO', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ items: [{ id: 'm1', thread_id: 't1', mailbox_id: 'mb', sender: 's@example.com', subject: 'S', at: 1_800_000_000_000 }], next: { before: 5, beforeId: 'm0' }, simulated: true }))
    const page = await createHttpGateway(client(fetchImpl)).listMessages({ mailboxId: 'mb', cursor: { before: 9, beforeId: 'm9' }, limit: 50 })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/v1/messages?mailboxId=mb&limit=50&before=9&beforeId=m9')
    expect(page).toEqual({ items: [{ id: 'm1', threadId: 't1', mailboxId: 'mb', sender: 's@example.com', subject: 'S', at: '2027-01-15T08:00:00.000Z' }], next: { before: 5, beforeId: 'm0' } })
  })

  it('never asks for more than fifty summaries, whatever the caller passes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ items: [], next: null, simulated: true }))
    await createHttpGateway(client(fetchImpl)).listMessages({ mailboxId: 'mb', cursor: null, limit: 500 })
    expect(fetchImpl.mock.calls[0]![0]).toBe('/v1/messages?mailboxId=mb&limit=50')
  })

  it('refuses an incomplete connected inventory in one bounded request instead of following history', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ items: [], next: { after: 'more' }, simulated: true }))
    await expect(createHttpGateway(client(fetchImpl)).listMailboxes()).rejects.toMatchObject({ kind: 'unavailable' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]![0]).toBe('/v1/mailboxes?connected=true&limit=10')
  })

  it('cancels an answer that declares itself too large without pulling body chunks', async () => {
    const cancel = vi.fn()
    const pull = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ pull, cancel }, { highWaterMark: 0 })
    const big = new Response(stream, { status: 200, headers: { 'content-length': '999999' } })
    const error = await failure(client(async () => big).request('GET', '/x', capabilitiesResponse))
    expect(error.kind).toBe('unavailable')
    expect(cancel).toHaveBeenCalledOnce()
    expect(pull).not.toHaveBeenCalled()
  })

  it('loads bounded connected inventory and maps flags to booleans', async () => {
    const row = (id: string, connected: 0 | 1) => ({ id, address: `${id}@example.com`, provider: 'fake', connected, send_enabled: 1, ai_read: 0, ai_draft: 0, ai_send: 0 })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ items: [row('a', 1)], next: null, simulated: true }))
    const mailboxes = await createHttpGateway(client(fetchImpl)).listMailboxes()
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['/v1/mailboxes?connected=true&limit=10'])
    expect(mailboxes.map((m) => [m.id, m.connected, m.sendEnabled, m.aiRead])).toEqual([
      ['a', true, true, false],
    ])
  })
})

// AIDEV-NOTE: Chunked UTF-8 replies must obey the byte budget even without a Content-Length header.
it('cancels an oversized streamed response before consuming its tail', async () => {
  const cancel = vi.fn()
  let reads = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      reads++
      controller.enqueue(new TextEncoder().encode('é'.repeat(70_000)))
    },
    cancel,
  }, { highWaterMark: 0 })
  const error = await failure(client(async () => new Response(stream)).request('GET', '/x', capabilitiesResponse))
  expect(error.kind).toBe('unavailable')
  expect(cancel).toHaveBeenCalledOnce()
  expect(reads).toBe(2)
})

it('decodes JSON correctly across split UTF-8 chunks', async () => {
  const encoded = new TextEncoder().encode(JSON.stringify({ error: { code: 'unknown_é', requestId: 'r1' } }))
  const split = encoded.indexOf(195) + 1
  const stream = new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(encoded.slice(0, split))
    controller.enqueue(encoded.slice(split))
    controller.close()
  } })
  const error = await failure(client(async () => new Response(stream, { status: 409 })).request('GET', '/x', capabilitiesResponse))
  expect(error.code).toBe('unknown_é')
})

it('preserves reply linkage on create, replacement and saved recovery, rejecting malformed returned linkage', async () => {
  const threaded = { ...draft, replyToMessageId: 'source_1' }
  const fetchImpl = vi.fn<typeof fetch>(async () => json({ id: 'i1', predecessorId: 'i0', revision: 'b'.repeat(64), status: 'draft', simulated: true }))
  const gateway = createHttpGateway(client(fetchImpl))
  await gateway.createSendRequest('key-1', threaded)
  await gateway.replaceSendRequest('i0', 'a'.repeat(64), 'key-2', threaded)
  expect(JSON.parse(String(fetchImpl.mock.calls[0]![1]?.body))).toMatchObject({ replyToMessageId: 'source_1' })
  expect(JSON.parse(String(fetchImpl.mock.calls[1]![1]?.body))).toMatchObject({ draft: { replyToMessageId: 'source_1' } })
  const content = { ...threaded, from: 'me@example.com', kind: 'manual' }
  expect(await createHttpGateway(client(async () => json({ intent: row, content }))).getSendContent('i1')).toMatchObject({ replyToMessageId: 'source_1' })
  await expect(createHttpGateway(client(async () => json({ intent: row, content: { ...content, replyToMessageId: '../bad' } }))).getSendContent('i1')).rejects.toMatchObject({ kind: 'unavailable' })
})
