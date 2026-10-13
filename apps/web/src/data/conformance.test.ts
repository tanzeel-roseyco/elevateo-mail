// R2: one conformance table over the fixture gateway and the HTTP gateway with a controlled
// transport: valid, empty, null-field, stable-error, malformed, wrong content type, oversized,
// timed out and redirected responses. Real Rails conformance remains separately pending.
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixtures from '../../../../contracts/v1/fixtures.json'
import { GatewayError } from './errors'
import type { MailroomGateway, ReadContext } from './gateway'
import { createFixtureGateway } from './fixtures/fixtureGateway'
import { createHttpGateway } from './http/httpGateway'
import { REQUEST_TIMEOUT_MS } from './http/transport'

const examples = fixtures.examples as Record<string, { status: number; body: unknown }>
const CTX: ReadContext = { contextId: 'context_A_0123456789', authorizationVersion: 'authz_A_0123456789' }

function jsonResponse(name: string): Response {
  const example = examples[name]!
  return new Response(JSON.stringify(example.body), { status: example.status, headers: { 'Content-Type': 'application/json' } })
}

/** HTTP gateway whose every request resolves with the given response factory. */
function httpWith(make: () => Response | Promise<Response>): MailroomGateway {
  return createHttpGateway(async (_input, init) => {
    if (init.method !== 'GET') throw new Error('unexpected non-GET request')
    return make()
  })
}

const BOTH: Array<[string, (example: string) => MailroomGateway]> = [
  ['fixture', (name) => createFixtureGateway({ getSession: name, listMailboxes: name, listThreads: name, getThread: name })],
  ['http', (name) => httpWith(() => jsonResponse(name))],
]

afterEach(() => vi.useRealTimers())

describe.each(BOTH)('shared cases via %s gateway', (_label, make) => {
  it('valid session resolves with validated data', async () => {
    const session = await make('session_a').getSession()
    expect(session.simulation_mode).toBe(true)
    expect(session.csrf_token.length).toBeGreaterThanOrEqual(16)
  })
  it('an empty mailbox page is valid', async () => {
    const page = await make('mailboxes_empty').listMailboxes(CTX, {})
    expect(page.items).toEqual([])
    expect(page.next_cursor).toBeNull()
  })
  it('null subject/sender/date summaries are valid', async () => {
    const page = await make('threads').listThreads(CTX, '00000000-0000-4000-8000-000000000021', {})
    expect(page.items[0]?.subject).toBeNull()
    expect(page.items[0]?.sender).toBeNull()
  })
  it('a zero-message conversation is valid', async () => {
    const detail = await make('thread_empty').getThread(CTX, '00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000021', {})
    expect(detail.messages).toEqual([])
    expect(detail.thread.message_count).toBe(0)
  })
  it('message continuation exposes a separate cursor and visible truncation flag', async () => {
    const detail = await make('thread_truncated').getThread(CTX, '00000000-0000-4000-8000-000000000031', '00000000-0000-4000-8000-000000000021', {})
    expect(detail.next_cursor).toBe('synthetic_next_cursor_2')
    expect(detail.messages[0]?.body_truncated).toBe(true)
  })
  it.each(['unauthenticated', 'not_available', 'context_changed', 'cursor_invalid', 'request_invalid', 'rate_limited', 'temporarily_unavailable', 'internal_error'] as const)(
    'stable %s error surfaces its code',
    async (code) => {
      const error = await make(code).getSession().catch((e: unknown) => e)
      expect(error).toBeInstanceOf(GatewayError)
      expect((error as GatewayError).kind).toBe('api')
      expect((error as GatewayError).code).toBe(code)
      expect((error as GatewayError).requestId).toBe('fixture-request-001')
      expect((error as GatewayError).status).toBe(examples[code]!.status)
    },
  )
})

// AIDEV-NOTE: These assertions pin the wire boundary for all operations without claiming real Rails integration.
describe('HTTP request contract', () => {
  it('preserves paths, opaque queries, context headers and same-origin GET options', async () => {
    const seen: Array<{ path: string; init: RequestInit }> = []
    const names = ['session_a', 'mailboxes', 'threads', 'thread_empty']
    const gateway = createHttpGateway(async (path, init) => {
      seen.push({ path, init })
      return jsonResponse(names[seen.length - 1]!)
    })
    const caller = new AbortController()
    const cursor = 'opaque +/&=?'
    await gateway.getSession(caller.signal)
    await gateway.listMailboxes(CTX, { cursor, limit: 50 }, caller.signal)
    await gateway.listThreads(CTX, 'mail/box', { cursor, limit: 50, filter: 'unread' }, caller.signal)
    await gateway.getThread(CTX, 'thread/id', 'mail/box', { cursor, limit: 20 }, caller.signal)
    expect(seen[0]?.path).toBe('/v1/session')
    expect(seen[1]?.path).toBe('/v1/mailboxes?cursor=opaque+%2B%2F%26%3D%3F&limit=50')
    expect(seen[2]?.path).toBe('/v1/mailboxes/mail%2Fbox/threads?cursor=opaque+%2B%2F%26%3D%3F&limit=50&filter=unread')
    expect(seen[3]?.path).toBe('/v1/threads/thread%2Fid?mailbox_id=mail%2Fbox&cursor=opaque+%2B%2F%26%3D%3F&limit=20')
    seen.forEach(({ init }, index) => {
      expect(init).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'manual' })
      expect(init.signal?.aborted).toBe(false)
      expect(init.headers).toEqual(index === 0 ? { Accept: 'application/json' } : {
        Accept: 'application/json', 'X-Session-Context': CTX.contextId, 'X-Authorization-Version': CTX.authorizationVersion,
      })
    })
  })

  it.each([['1', 1], ['300', 300], ['0', undefined], ['301', undefined], ['garbage', undefined]] as const)(
    'bounds Retry-After %s', async (value, expected) => {
      const response = jsonResponse('rate_limited')
      response.headers.set('Retry-After', value)
      const error: unknown = await httpWith(() => response).getSession().catch((cause: unknown) => cause)
      expect(error).toMatchObject({ code: 'rate_limited', status: 429, retryAfterSeconds: expected })
    },
  )
})

describe('transport failure cases (HTTP gateway only; fixtures cannot emulate transport)', () => {
  const expectTransport = async (gateway: MailroomGateway, code: string) => {
    const error = await gateway.getSession().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).kind).toBe('transport')
    expect((error as GatewayError).code).toBe(code)
  }

  it('malformed JSON is a deliberate error, never fixture data', async () => {
    await expectTransport(httpWith(() => new Response('{not json', { status: 200, headers: { 'Content-Type': 'application/json' } })), 'malformed')
  })
  it('schema-mismatched JSON is malformed', async () => {
    await expectTransport(httpWith(() => new Response('{"hello":1}', { status: 200, headers: { 'Content-Type': 'application/json' } })), 'malformed')
  })
  it('wrong content type is rejected before parsing', async () => {
    await expectTransport(httpWith(() => new Response('<html></html>', { status: 200, headers: { 'Content-Type': 'text/html' } })), 'wrong_content_type')
  })
  it('oversized bodies are rejected while streaming', async () => {
    const big = JSON.stringify({ pad: 'x'.repeat(20_000) })
    await expectTransport(httpWith(() => new Response(big, { status: 200, headers: { 'Content-Type': 'application/json' } })), 'oversized')
  })
  it('redirects are rejected', async () => {
    await expectTransport(httpWith(() => new Response(null, { status: 302, headers: { Location: '/elsewhere' } })), 'redirected')
  })
  it('a hung request times out at the 10-second deadline', async () => {
    vi.useFakeTimers()
    const gateway = createHttpGateway(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason))
        }),
    )
    const pending = gateway.getSession().catch((e: unknown) => e)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS + 1)
    const error = await pending
    expect(error).toBeInstanceOf(GatewayError)
    expect((error as GatewayError).code).toBe('timeout')
  })
  it('absolute or non-/v1 destinations are refused', async () => {
    const spy = vi.fn()
    const { requestJson } = await import('./http/transport')
    const { SessionSchema } = await import('./contract')
    const error = await requestJson('https://example.invalid/v1/session', SessionSchema, 1024, { fetchImpl: spy }).catch((e: unknown) => e)
    expect((error as GatewayError).kind).toBe('transport')
    expect(spy).not.toHaveBeenCalled()
  })
  it('reads only ever issue GET requests', async () => {
    const seen: string[] = []
    const gateway = createHttpGateway(async (_input, init) => {
      seen.push(init.method ?? '')
      return jsonResponse('threads')
    })
    await gateway.listThreads(CTX, '00000000-0000-4000-8000-000000000021', { filter: 'unread' })
    expect(seen).toEqual(['GET'])
  })
})
