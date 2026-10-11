// Bounded same-origin JSON transport. Behavior adapted from first-party Ledger frontend 4322cfbb,
// src/data/http/httpClient.ts (blob 8f8e6e08…): credentials same-origin, no-store, 10s abort
// deadline, streamed byte bound, Zod result/error parsing. Changes: per-endpoint byte budgets,
// redirect rejection, content-type check before body use, and no legacy x-elevateo-* headers.
import type { z } from 'zod'
import { GatewayError } from '../errors'
import { ErrorSchema, MAX_BYTES } from '../contract'

export const REQUEST_TIMEOUT_MS = 10_000

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

async function untilAborted<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  let onAbort = () => {}
  const cancelled = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
  try {
    return await Promise.race([pending, cancelled])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

function discardBody(body: ReadableStream<Uint8Array> | null): void {
  // AIDEV-NOTE: Cleanup is best-effort and never awaited: a broken source must not mask or stall the outcome.
  try {
    if (body && !body.locked) void body.cancel().catch(() => undefined)
  } catch {
    // Injected streams may throw synchronously; preserve the classified request outcome.
  }
}

async function readBounded(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  // AIDEV-NOTE: Always bound the stream; Content-Length alone is not trusted (R2 oversized case).
  const body = response.body
  if (!body) {
    const text = await untilAborted(response.text(), signal)
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new GatewayError('transport', 'oversized', 'Response exceeded its size limit.')
    return text
  }
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let received = 0
  let text = ''
  let complete = false
  try {
    for (;;) {
      const { done, value } = await untilAborted(reader.read(), signal)
      if (done) {
        complete = true
        break
      }
      received += value.byteLength
      if (received > maxBytes) throw new GatewayError('transport', 'oversized', 'Response exceeded its size limit.')
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  } finally {
    // AIDEV-NOTE: Attempt cancellation before release; injected cancellation must not mask the request error.
    try {
      if (!complete) void reader.cancel().catch(() => undefined)
    } catch {
      // Preserve the request outcome even when an injected reader throws synchronously.
    } finally {
      reader.releaseLock()
    }
  }
}

async function toApiError(response: Response, raw: string): Promise<GatewayError> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new GatewayError('transport', 'malformed', 'The server returned an unreadable error.', { status: response.status })
  }
  const result = ErrorSchema.safeParse(parsed)
  if (!result.success) return new GatewayError('transport', 'malformed', 'The server returned an unexpected error shape.', { status: response.status })
  const retryAfterHeader = response.headers.get('Retry-After')
  const retryAfter = retryAfterHeader === null ? Number.NaN : Number.parseInt(retryAfterHeader, 10)
  const opts: { status: number; requestId: string; retryAfterSeconds?: number } = { status: response.status, requestId: result.data.request_id }
  if (Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 300) opts.retryAfterSeconds = retryAfter
  return new GatewayError('api', result.data.code, result.data.message, opts)
}

/**
 * GET a relative /v1 path and validate the body. Rejects absolute URLs, redirects, non-JSON
 * content types and oversized or malformed bodies with deliberate GatewayErrors.
 */
export async function requestJson<S extends z.ZodType>(
  path: string,
  schema: S,
  maxBytes: number,
  options: { headers?: Record<string, string>; signal?: AbortSignal | undefined; fetchImpl?: FetchLike },
): Promise<z.output<S>> {
  if (!path.startsWith('/v1/')) throw new GatewayError('transport', 'network', 'Only relative /v1 paths are allowed.')
  if (options.signal?.aborted) throw new GatewayError('transport', 'aborted', 'The request was cancelled.')
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new GatewayError('transport', 'timeout', 'The request timed out.')), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => controller.abort(new GatewayError('transport', 'aborted', 'The request was cancelled.'))
  options.signal?.addEventListener('abort', onOuterAbort, { once: true })
  let response: Response | undefined
  try {
    // AIDEV-NOTE: Race both fetch and reads so even an abort-ignoring implementation obeys the same deadline.
    const receivedResponse = await untilAborted(fetchImpl(path, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        headers: { Accept: 'application/json', ...options.headers },
        signal: controller.signal,
      }).then((received) => {
        response = received
        // A fetch may resolve after the race has already rejected and run its outer finally.
        if (controller.signal.aborted) discardBody(received.body)
        return received
      }), controller.signal)
    if (receivedResponse.type === 'opaqueredirect' || (receivedResponse.status >= 300 && receivedResponse.status < 400)) {
      throw new GatewayError('transport', 'redirected', 'Unexpected redirect was rejected.', { status: receivedResponse.status })
    }
    const contentType = receivedResponse.headers.get('Content-Type') ?? ''
    if (contentType.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
      throw new GatewayError('transport', 'wrong_content_type', 'The server returned a non-JSON response.', { status: receivedResponse.status })
    }
    if (!receivedResponse.ok) throw await toApiError(receivedResponse, await readBounded(receivedResponse, MAX_BYTES.error, controller.signal))
    const raw = await readBounded(receivedResponse, maxBytes, controller.signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new GatewayError('transport', 'malformed', 'The server returned unreadable data.')
    }
    const result = schema.safeParse(parsed)
    if (!result.success) throw new GatewayError('transport', 'malformed', 'The server returned data that does not match the contract.')
    return result.data
  } catch (cause) {
    if (cause instanceof GatewayError) throw cause
    if (controller.signal.aborted && controller.signal.reason instanceof GatewayError) throw controller.signal.reason
    throw new GatewayError('transport', 'network', 'The server response could not be read.')
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onOuterAbort)
    if (response) discardBody(response.body)
  }
}
