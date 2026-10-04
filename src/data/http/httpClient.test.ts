import { describe, expect, it, vi } from 'vitest'
import { capabilitiesResponse, messageDetail } from './contract'
import { ApiFailure, createHttpClient } from './httpClient'
import { createHttpGateway } from './httpGateway'

const TOKEN = 't'.repeat(48)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const client = (fetchImpl: typeof fetch, token: string | null = TOKEN, timeoutMs = 50) => createHttpClient({ baseUrl: '', getToken: () => token, fetch: fetchImpl, timeoutMs })
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
  it('sends the bearer session and JSON body, and returns the parsed answer', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json(saved))
    const gateway = createHttpGateway(client(fetchImpl))
    await gateway.approveSendRequest('intent-1', 'a'.repeat(64))
    const [url, init] = fetchImpl.mock.calls[0]!
    expect(url).toBe('/v1/send-intents/intent-1/approve')
    expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ revision: 'a'.repeat(64) }), cache: 'no-store' })
    expect(init?.headers).toMatchObject({ authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' })
  })

  it('makes no request at all without a session', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
    const error = await failure(client(fetchImpl, null).request('GET', '/v1/capabilities', capabilitiesResponse))
    expect(error.kind).toBe('unauthorized')
    expect(fetchImpl).not.toHaveBeenCalled()
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
    const error = await failure(client(hang, TOKEN, 10).request('GET', '/x', capabilitiesResponse))
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

  it('reports an inventory it cannot read to the end instead of a cut-off list', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => json({ items: [], next: { after: 'more' }, simulated: true }))
    await expect(createHttpGateway(client(fetchImpl)).listMailboxes()).rejects.toMatchObject({ kind: 'unavailable' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('refuses an answer that declares itself too large without reading it', async () => {
    const big = new Response('{}', { status: 200, headers: { 'content-length': '999999' } })
    const error = await failure(client(async () => big).request('GET', '/x', capabilitiesResponse))
    expect(error.kind).toBe('unavailable')
    expect(big.bodyUsed).toBe(false)
  })

  it('follows mailbox pages and maps flags to booleans', async () => {
    const row = (id: string, connected: 0 | 1) => ({ id, address: `${id}@example.com`, provider: 'fake', connected, send_enabled: 1, ai_read: 0, ai_draft: 0, ai_send: 0 })
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ items: [row('a', 1)], next: { after: 'a' }, simulated: true })).mockResolvedValueOnce(json({ items: [row('b', 0)], next: null, simulated: true }))
    const mailboxes = await createHttpGateway(client(fetchImpl)).listMailboxes()
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['/v1/mailboxes?limit=100', '/v1/mailboxes?limit=100&after=a'])
    expect(mailboxes.map((m) => [m.id, m.connected, m.sendEnabled, m.aiRead])).toEqual([
      ['a', true, true, false],
      ['b', false, true, false],
    ])
  })
})
