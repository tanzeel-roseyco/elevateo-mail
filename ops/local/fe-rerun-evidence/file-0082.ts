import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { MAX_BYTES, MAX_REQUEST_BYTES } from '../contract'
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

// BE-02A: bounded same-origin JSON POST. The proof header is the only addition; Origin is the
// browser's own forbidden header and must never appear in the init we hand to fetch.
describe('json post', () => {
  function capture(response: Response) {
    const fetchImpl = vi.fn<FetchLike>(async () => response)
    return { fetchImpl, init: () => fetchImpl.mock.calls[0]?.[1] }
  }

  it('sends method, JSON content type, serialized body and the proof header; never Origin', async () => {
    const { fetchImpl, init } = capture(new Response(json, { headers }))
    await expect(requestJson('/v1/auth/login', schema, 1024, { fetchImpl, body: { email: 'a@example.test', password: 'p' }, headers: { 'X-CSRF-Token': 'synthetic_challenge_token_00000001' } }))
      .resolves.toEqual({ value: 'ok' })
    const sent = init()!
    expect(sent.method).toBe('POST')
    expect(sent.credentials).toBe('same-origin')
    expect(sent.cache).toBe('no-store')
    expect(sent.redirect).toBe('manual')
    expect(sent.body).toBe('{"email":"a@example.test","password":"p"}')
    const sentHeaders = sent.headers as Record<string, string>
    expect(sentHeaders['Content-Type']).toBe('application/json')
    expect(sentHeaders['X-CSRF-Token']).toBe('synthetic_challenge_token_00000001')
    expect(Object.keys(sentHeaders).map((k) => k.toLowerCase())).not.toContain('origin')
  })

  it('a GET carries neither a body nor a JSON content type', async () => {
    const { fetchImpl, init } = capture(new Response(json, { headers }))
    await requestJson('/v1/session', schema, 1024, { fetchImpl })
    expect(init()!.method).toBe('GET')
    expect(init()!.body).toBeUndefined()
    expect((init()!.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('accepts 202 as success and keeps rejecting redirects for POST', async () => {
    await expect(requestJson('/v1/auth/recovery', schema, 1024, { fetchImpl: async () => new Response(json, { status: 202, headers }), body: {} })).resolves.toEqual({ value: 'ok' })
    const { response, cancel } = streamResponse('application/json', 303)
    await expect(requestJson('/v1/auth/accept', schema, 1024, { fetchImpl: async () => response, body: {} })).rejects.toMatchObject({ code: 'redirected' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('bounds the serialized request at exactly 8 KiB and never dispatches a larger one', async () => {
    const fetchImpl = vi.fn(async () => new Response(json, { headers }))
    const overhead = '{"password":""}'.length
    const fits = { password: 'x'.repeat(MAX_REQUEST_BYTES - overhead) }
    const over = { password: 'x'.repeat(MAX_REQUEST_BYTES - overhead + 1) }
    await expect(requestJson('/v1/auth/login', schema, 1024, { fetchImpl, body: fits })).resolves.toEqual({ value: 'ok' })
    await expect(requestJson('/v1/auth/login', schema, 1024, { fetchImpl, body: over })).rejects.toMatchObject({ kind: 'transport', code: 'oversized' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('counts request bytes in UTF-8, not characters', async () => {
    const fetchImpl = vi.fn(async () => new Response(json, { headers }))
    const overhead = '{"password":""}'.length
    const fourBytesEach = '\u{1F48C}'.repeat(Math.floor((MAX_REQUEST_BYTES - overhead) / 4) + 1) // over by bytes, under by chars
    await expect(requestJson('/v1/auth/login', schema, 1024, { fetchImpl, body: { password: fourBytesEach } })).rejects.toMatchObject({ code: 'oversized' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('an API error from a POST carries status, code and request id but never the request body', async () => {
    const error = { code: 'unauthenticated', message: 'Rejected.', request_id: 'r-9' }
    const fetchImpl: FetchLike = async () => new Response(JSON.stringify(error), { status: 401, headers })
    const caught: unknown = await requestJson('/v1/auth/login', schema, 1024, { fetchImpl, body: { password: 'hunter2hunter2' } }).catch((e: unknown) => e)
    expect(caught).toBeInstanceOf(GatewayError)
    expect(caught).toMatchObject({ kind: 'api', code: 'unauthenticated', status: 401, requestId: 'r-9' })
    expect(JSON.stringify(caught)).not.toContain('hunter2')
    expect((caught as GatewayError).message).not.toContain('hunter2')
  })
})
