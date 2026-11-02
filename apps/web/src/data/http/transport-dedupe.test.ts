// In-flight GET dedupe: identical concurrent GETs share one fetch; different context headers, any
// write, and sequential calls never share; one caller's abort does not cancel the shared fetch.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { requestJson, REQUEST_TIMEOUT_MS, type FetchLike } from './transport'

const schema = z.strictObject({ value: z.string() })
const headers = { 'Content-Type': 'application/json' }
const ctxA = { 'X-Session-Context': 'ctx_a', 'X-Authorization-Version': 'v1' }
const ctxB = { 'X-Session-Context': 'ctx_b', 'X-Authorization-Version': 'v1' }
const errorJson = JSON.stringify({ code: 'not_available', message: 'gone', request_id: 'r1' })

afterEach(() => vi.restoreAllMocks())

function okFetch(): ReturnType<typeof vi.fn<FetchLike>> {
  return vi.fn<FetchLike>(async () => new Response('{"value":"ok"}', { headers }))
}

describe('in-flight GET dedupe', () => {
  it('shares one fetch between concurrent identical GETs', async () => {
    const fetchImpl = okFetch()
    const [a, b] = await Promise.all([
      requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA }),
      requestJson('/v1/session', schema, 1024, { fetchImpl, headers: { 'X-Authorization-Version': 'v1', 'X-Session-Context': 'ctx_a' } }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(a).toEqual({ value: 'ok' })
    expect(b).toEqual({ value: 'ok' })
  })

  it('does not share across different context headers', async () => {
    const fetchImpl = okFetch()
    await Promise.all([
      requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA }),
      requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxB }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('never dedupes writes', async () => {
    const fetchImpl = okFetch()
    await Promise.all([
      requestJson('/v1/auth/login', schema, 1024, { fetchImpl, body: { x: 1 } }),
      requestJson('/v1/auth/login', schema, 1024, { fetchImpl, body: { x: 1 } }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('fetches again once the shared request has settled', async () => {
    const fetchImpl = okFetch()
    await requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA })
    await requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('keeps the shared fetch alive when only one caller aborts', async () => {
    let release: () => void = () => {}
    const fetchImpl = vi.fn<FetchLike>((_input, init) => new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      release = () => resolve(new Response('{"value":"ok"}', { headers }))
    }))
    const first = new AbortController()
    const a = requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA, signal: first.signal })
    const b = requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA })
    first.abort()
    await expect(a).rejects.toMatchObject({ kind: 'transport', code: 'aborted' })
    expect(fetchImpl.mock.calls[0]?.[1].signal?.aborted).toBe(false)
    release()
    await expect(b).resolves.toEqual({ value: 'ok' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('starts a fresh fetch for a GET issued after the last subscriber withdrew but before the entry is gone', async () => {
    let release: () => void = () => {}
    const fetchImpl = vi.fn<FetchLike>((_input, init) => new Promise<Response>((resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      release = () => resolve(new Response('{"value":"ok"}', { headers }))
    }))
    const first = new AbortController()
    const a = requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA, signal: first.signal })
    first.abort()
    // Issued synchronously: the aborted entry's `.finally` has not run yet.
    const c = requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA })
    await expect(a).rejects.toMatchObject({ code: 'aborted' })
    release()
    await expect(c).resolves.toEqual({ value: 'ok' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('aborts the shared fetch once every caller has withdrawn', async () => {
    const fetchImpl = vi.fn<FetchLike>((_input, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    }))
    const first = new AbortController()
    const second = new AbortController()
    const a = requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA, signal: first.signal })
    const b = requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA, signal: second.signal })
    first.abort()
    second.abort()
    await expect(a).rejects.toMatchObject({ code: 'aborted' })
    await expect(b).rejects.toMatchObject({ code: 'aborted' })
    expect(fetchImpl.mock.calls[0]?.[1].signal?.aborted).toBe(true)
  })

  it('does not share across different schema references for the same URL', async () => {
    const fetchImpl = okFetch()
    const other = z.strictObject({ value: z.string() })
    await Promise.all([
      requestJson('/v1/session', schema, 1024, { fetchImpl, headers: ctxA }),
      requestJson('/v1/session', other, 1024, { fetchImpl, headers: ctxA }),
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  describe('every subscriber receives the shared failure', () => {
    const pair = (fetchImpl: FetchLike) => Promise.allSettled([
      requestJson('/v1/session', schema, 32, { fetchImpl, headers: ctxA }),
      requestJson('/v1/session', schema, 32, { fetchImpl, headers: ctxA }),
    ])
    const codes = (settled: PromiseSettledResult<unknown>[]) =>
      settled.map((result) => (result.status === 'rejected' ? (result.reason as { code: string }).code : 'resolved'))

    it.each([
      ['oversized', () => new Response(`{"value":"${'x'.repeat(64)}"}`, { headers })],
      ['malformed', () => new Response('{"value":1}', { headers })],
      ['not_available', () => new Response(errorJson, { status: 404, headers })],
    ] as const)('%s', async (code, respond) => {
      const fetchImpl = vi.fn<FetchLike>(async () => respond())
      expect(codes(await pair(fetchImpl))).toEqual([code, code])
      expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('timeout', async () => {
      vi.useFakeTimers()
      try {
        const fetchImpl = vi.fn<FetchLike>((_input, init) => new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }))
        const settled = pair(fetchImpl)
        await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
        expect(codes(await settled)).toEqual(['timeout', 'timeout'])
        expect(fetchImpl).toHaveBeenCalledTimes(1)
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
