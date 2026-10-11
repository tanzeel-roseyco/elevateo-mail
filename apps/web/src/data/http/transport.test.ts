import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { MAX_BYTES } from '../contract'
import { GatewayError } from '../errors'
import { requestJson, REQUEST_TIMEOUT_MS, type FetchLike } from './transport'

const schema = z.strictObject({ value: z.string() })
const json = '{"value":"ok"}'
const headers = { 'Content-Type': 'application/json' }
const encoder = new TextEncoder()

// AIDEV-NOTE: Controlled streams prove body-phase cancellation without relying on fetch to reject for us.
function streamResponse(contentType = 'application/json', status = 200) {
  let source!: ReadableStreamDefaultController<Uint8Array>
  const cancel = vi.fn(() => undefined)
  const stream = new ReadableStream<Uint8Array>({ start(controller) { source = controller }, cancel })
  return { response: new Response(stream, { status, headers: { 'Content-Type': contentType } }), source, cancel }
}

function request(response: Response, signal?: AbortSignal, maxBytes = 1024) {
  return requestJson('/v1/session', schema, maxBytes, { fetchImpl: async () => response, signal })
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  const remainingTimers = vi.getTimerCount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  expect(remainingTimers).toBe(0)
})

describe('full request lifecycle', () => {
  it('pre-aborted caller does not dispatch fetch', async () => {
    const caller = new AbortController()
    caller.abort()
    const fetchImpl = vi.fn(async () => new Response(json, { headers }))
    await expect(requestJson('/v1/session', schema, 1024, { signal: caller.signal, fetchImpl }))
      .rejects.toMatchObject({ kind: 'transport', code: 'aborted' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each(['caller', 'deadline'] as const)('%s cancellation after headers settles and releases reader', async (cause) => {
    const caller = new AbortController()
    const { response, source, cancel } = streamResponse()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    let outcome: unknown = 'pending'
    const pending = request(response, caller.signal).then(value => { outcome = value }, error => { outcome = error })
    await vi.advanceTimersByTimeAsync(0)
    if (cause === 'caller') caller.abort()
    await vi.advanceTimersByTimeAsync(cause === 'deadline' ? REQUEST_TIMEOUT_MS : 0)
    const observed = outcome
    const cancelled = cancel.mock.calls.length
    const unlocked = response.body?.locked === false
    const listenerRemoved = remove.mock.calls.some(([event]) => event === 'abort')
    // Release the unchanged implementation too, so a failing reproduction never hangs the test process.
    if (cancelled === 0) source.close()
    await pending
    expect(observed).toBeInstanceOf(GatewayError)
    expect(observed).toMatchObject({ code: cause === 'caller' ? 'aborted' : 'timeout' })
    expect(cancelled).toBe(1)
    expect(unlocked).toBe(true)
    expect(listenerRemoved).toBe(true)
  })

  it('a body rejection is classified as network and releases its reader', async () => {
    const { response, source } = streamResponse()
    const pending = request(response).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(0)
    source.error(new TypeError('connection reset'))
    expect(await pending).toMatchObject({ kind: 'transport', code: 'network' })
    expect(response.body?.locked).toBe(false)
  })

  it('success releases the reader and caller listener', async () => {
    const caller = new AbortController()
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    const response = new Response(json, { headers })
    await expect(request(response, caller.signal)).resolves.toEqual({ value: 'ok' })
    expect(response.body?.locked).toBe(false)
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it.each([['text/html', 200, 'wrong_content_type'], ['application/json', 302, 'redirected']] as const)(
    'rejects headers %s/%s and cancels the unconsumed body', async (contentType, status, code) => {
      const { response, cancel } = streamResponse(contentType, status)
      await expect(request(response)).rejects.toMatchObject({ code })
      expect(cancel).toHaveBeenCalledOnce()
      expect(response.body?.locked).toBe(false)
    },
  )

  it('a fetch rejection is classified as network', async () => {
    const fetchImpl: FetchLike = async () => { throw new TypeError('offline') }
    await expect(requestJson('/v1/session', schema, 1024, { fetchImpl })).rejects.toMatchObject({ code: 'network' })
  })
})

describe('content type and byte boundaries', () => {
  it.each(['application/jsonp', 'text/application/json', 'application/problem+json', ''])('rejects %s', async (contentType) => {
    await expect(request(new Response(json, { headers: { 'Content-Type': contentType } })))
      .rejects.toMatchObject({ code: 'wrong_content_type' })
  })
  it.each(['application/json', 'Application/JSON; charset=utf-8', 'application/json ; charset=UTF-8'])('accepts %s', async (contentType) => {
    await expect(request(new Response(json, { headers: { 'Content-Type': contentType } }))).resolves.toEqual({ value: 'ok' })
  })
  it.each([undefined, '1', '999999'])('counts actual UTF-8 bytes with Content-Length %s', async (length) => {
    const raw = JSON.stringify({ value: '💌' })
    const responseHeaders: Record<string, string> = { ...headers }
    if (length !== undefined) responseHeaders['Content-Length'] = length
    const bytes = encoder.encode(raw)
    await expect(request(new Response(raw, { headers: responseHeaders }), undefined, bytes.length)).resolves.toEqual({ value: '💌' })
    await expect(request(new Response(raw, { headers: responseHeaders }), undefined, bytes.length - 1)).rejects.toMatchObject({ code: 'oversized' })
  })
  it('decodes Unicode split across chunks', async () => {
    const { response, source } = streamResponse()
    const bytes = encoder.encode(JSON.stringify({ value: '💌' }))
    source.enqueue(bytes.slice(0, 12))
    source.enqueue(bytes.slice(12))
    source.close()
    await expect(request(response)).resolves.toEqual({ value: '💌' })
  })
  it('cancels as soon as the stream exceeds the limit', async () => {
    const { response, source, cancel } = streamResponse()
    source.enqueue(encoder.encode('x'.repeat(1025)))
    await expect(request(response)).rejects.toMatchObject({ code: 'oversized' })
    expect(cancel).toHaveBeenCalledOnce()
    expect(response.body?.locked).toBe(false)
  })
  it('uses the error budget independently of the success budget', async () => {
    await expect(request(new Response('x'.repeat(MAX_BYTES.error + 1), { status: 500, headers }), undefined, MAX_BYTES.thread))
      .rejects.toMatchObject({ code: 'oversized' })
  })
})
