import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { requestJson, REQUEST_TIMEOUT_MS, type FetchLike } from './transport'

const schema = z.strictObject({ value: z.string() })
const headers = { 'Content-Type': 'application/json' }
const encoder = new TextEncoder()

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  const remainingTimers = vi.getTimerCount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  expect(remainingTimers).toBe(0)
})

// AIDEV-NOTE: Native source throws reject cancel promises; injected transports may also throw synchronously.
describe('cleanup cannot replace the request outcome', () => {
  it.each(['throws', 'rejects'] as const)('preserves header rejection when body cancellation %s', async (failure) => {
    const response = new Response('not JSON', { headers: { 'Content-Type': 'text/plain' } })
    const cleanupError = new Error('cancel failed')
    const cancel = vi.spyOn(response.body!, 'cancel')
    if (failure === 'throws') cancel.mockImplementation(() => { throw cleanupError })
    else cancel.mockRejectedValue(cleanupError)
    await expect(requestJson('/v1/session', schema, 1024, { fetchImpl: async () => response }))
      .rejects.toMatchObject({ kind: 'transport', code: 'wrong_content_type' })
    expect(cancel).toHaveBeenCalledOnce()
  })

  it.each(['throws', 'rejects'] as const)('preserves oversize and unlocks the reader when cancellation %s', async (failure) => {
    let source!: ReadableStreamDefaultController<Uint8Array>
    const body = new ReadableStream<Uint8Array>({ start(controller) { source = controller } })
    source.enqueue(encoder.encode('oversized'))
    const response = new Response(body, { headers })
    const reader = body.getReader()
    vi.spyOn(body, 'getReader').mockReturnValue(reader)
    const cleanupError = new Error('cancel failed')
    const cancel = vi.spyOn(reader, 'cancel')
    if (failure === 'throws') cancel.mockImplementation(() => { throw cleanupError })
    else cancel.mockRejectedValue(cleanupError)
    const outcome: unknown = await requestJson('/v1/session', schema, 1, { fetchImpl: async () => response })
      .catch((error: unknown) => error)
    const unlocked = !body.locked
    // Release the broken baseline ourselves only after capturing its observable cleanup result.
    reader.releaseLock()
    expect(outcome).toMatchObject({ kind: 'transport', code: 'oversized' })
    expect(unlocked).toBe(true)
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe('fetch cancellation ownership', () => {
  it.each(['caller', 'deadline'] as const)('settles pending fetch on %s cancellation and disposes its late response', async (cause) => {
    const caller = new AbortController()
    const add = vi.spyOn(caller.signal, 'addEventListener')
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    let resolveFetch!: (response: Response) => void
    let innerSignal: AbortSignal | null | undefined
    const fetchImpl: FetchLike = (_path, init) => {
      innerSignal = init.signal
      return new Promise<Response>((resolve) => { resolveFetch = resolve })
    }
    const pending = requestJson('/v1/session', schema, 1024, { signal: caller.signal, fetchImpl })
      .catch((error: unknown) => error)
    if (cause === 'caller') caller.abort()
    await vi.advanceTimersByTimeAsync(cause === 'deadline' ? REQUEST_TIMEOUT_MS : 0)
    expect(await pending).toMatchObject({ code: cause === 'caller' ? 'aborted' : 'timeout' })
    expect(innerSignal?.aborted).toBe(true)
    const registered = add.mock.calls.filter(([event]) => event === 'abort')
    expect(registered).toHaveLength(1)
    expect(remove).toHaveBeenCalledWith('abort', registered[0]![1])
    const cancel = vi.fn(() => undefined)
    const late = new Response(new ReadableStream<Uint8Array>({ cancel }), { headers })
    resolveFetch(late)
    await vi.advanceTimersByTimeAsync(0)
    expect(cancel).toHaveBeenCalledOnce()
    expect(late.body?.locked).toBe(false)
  })

  it('removes the identical caller listener after a successful response', async () => {
    const caller = new AbortController()
    const add = vi.spyOn(caller.signal, 'addEventListener')
    const remove = vi.spyOn(caller.signal, 'removeEventListener')
    await expect(requestJson('/v1/session', schema, 1024, {
      signal: caller.signal, fetchImpl: async () => new Response('{"value":"ok"}', { headers }),
    })).resolves.toEqual({ value: 'ok' })
    const registered = add.mock.calls.filter(([event]) => event === 'abort')
    expect(registered).toHaveLength(1)
    expect(remove).toHaveBeenCalledWith('abort', registered[0]![1])
  })
})
