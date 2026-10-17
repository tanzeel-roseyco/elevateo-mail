// Stage-A micro-gap regression: exact timer and retry-horizon boundaries. The 10s request deadline
// must not fire one millisecond early and must fire exactly on time (aborting the underlying
// fetch); the Retry-After horizon accepts whole seconds 1..300 inclusive and discards 0, 301 and
// non-numeric values rather than guessing. Fake timers with the shared leak check keep each case
// at its exact boundary.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { requestJson, REQUEST_TIMEOUT_MS, type FetchLike } from './transport'

const schema = z.strictObject({ value: z.string() })
const headers = { 'Content-Type': 'application/json' }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  const remainingTimers = vi.getTimerCount()
  vi.useRealTimers()
  vi.restoreAllMocks()
  expect(remainingTimers).toBe(0)
})

describe('request deadline boundary', () => {
  it('the required deadline is exactly 10000ms, asserted independently of the constant used below', () => {
    expect(REQUEST_TIMEOUT_MS).toBe(10_000)
  })

  it('a response arriving one millisecond before the deadline still succeeds', async () => {
    let resolveFetch!: (response: Response) => void
    const fetchImpl: FetchLike = () => new Promise<Response>((resolve) => (resolveFetch = resolve))
    const pending = requestJson('/v1/session', schema, 1024, { fetchImpl })
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS - 1) // deadline - 1: no timeout yet
    resolveFetch(new Response('{"value":"ok"}', { headers }))
    await expect(pending).resolves.toEqual({ value: 'ok' })
  })

  it('exactly at the deadline the request times out and the fetch signal is aborted', async () => {
    let innerSignal: AbortSignal | null | undefined
    const fetchImpl: FetchLike = (_path, init) => {
      innerSignal = init.signal
      return new Promise<never>(() => {})
    }
    const pending = requestJson('/v1/session', schema, 1024, { fetchImpl }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    expect(await pending).toMatchObject({ kind: 'transport', code: 'timeout' })
    expect(innerSignal?.aborted).toBe(true)
  })
})

// Scope limit, recorded rather than overclaimed: these cases cover HEADER PARSING only. The read
// checkpoint has no automatic retry scheduler — retryAfterSeconds is surfaced on the GatewayError
// and every retry is an explicit user action — so a fetch-count/delay scheduling-horizon test is
// not satisfiable here and that gap remains UNRESOLVED until a scheduler exists to test.
describe('Retry-After header parsing boundary (accepted window is whole seconds 1..300)', () => {
  const apiError = (retryAfter?: string): Response =>
    new Response(JSON.stringify({ code: 'temporarily_unavailable', message: 'forced by test', request_id: 'r1' }), {
      status: 503,
      headers: retryAfter === undefined ? headers : { ...headers, 'Retry-After': retryAfter },
    })

  it.each<[string, number | undefined]>([
    ['0', undefined], // below the horizon: discarded, not rounded up
    ['1', 1], // first accepted second
    ['300', 300], // last accepted second (equal to the horizon is still honored)
    ['301', undefined], // one past the horizon: discarded, not clamped
    ['soon', undefined], // non-numeric: discarded rather than guessed
    ['1oops', undefined], // trailing junk: the WHOLE header must be digits (parseInt accepted 1)
    ['1.5', undefined], // fractional seconds: discarded, not truncated to 1
    ['300.9', undefined], // fractional at the horizon: discarded, not truncated to 300
    ['1e2', undefined], // exponent form: discarded, not evaluated as 100
    ['-1', undefined], // signs are not whole-second digits
  ])('Retry-After %s yields retryAfterSeconds %s', async (header, expected) => {
    await expect(requestJson('/v1/session', schema, 1024, { fetchImpl: async () => apiError(header) }))
      .rejects.toMatchObject({
        kind: 'api',
        code: 'temporarily_unavailable',
        status: 503,
        retryAfterSeconds: expected,
      })
  })

  it('an absent Retry-After header yields no retryAfterSeconds', async () => {
    await expect(requestJson('/v1/session', schema, 1024, { fetchImpl: async () => apiError() }))
      .rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable', retryAfterSeconds: undefined })
  })
})
