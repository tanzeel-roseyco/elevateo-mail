// Bounded same-origin JSON transport. Behavior adapted from first-party Ledger frontend 4322cfbb,
// src/data/http/httpClient.ts (blob 8f8e6e08…): credentials same-origin, no-store, 10s abort
// deadline, streamed byte bound, Zod result/error parsing. Changes: per-endpoint byte budgets,
// redirect rejection, content-type check before body use, and no legacy x-elevateo-* headers.
// BE-02A adds JSON POST with an 8 KiB request bound; the browser supplies Origin itself (it is a
// forbidden request header and must never be synthesized here), and the only proof header the
// caller may add is X-CSRF-Token from component memory. BE-02 C/D adds PUT/DELETE, per-route
// request budgets (1 MiB draft, 64 KiB note) and the wider CollaborationError envelope.
import type { z } from 'zod'
import { GatewayError } from '../errors'
import type { GatewayApiErrorCode } from '../errors'
import { ErrorSchema, MAX_BYTES, MAX_REQUEST_BYTES } from '../contract'

/** Error envelope accepted for a route: the closed A/B Error or the C/D CollaborationError. */
export type ErrorEnvelopeSchema = z.ZodType<{ code: GatewayApiErrorCode; message: string; request_id: string }>

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

async function toApiError(response: Response, raw: string, errorSchema: ErrorEnvelopeSchema): Promise<GatewayError> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return new GatewayError('transport', 'malformed', 'The server returned an unreadable error.', { status: response.status })
  }
  const result = errorSchema.safeParse(parsed)
  if (!result.success) return new GatewayError('transport', 'malformed', 'The server returned an unexpected error shape.', { status: response.status })
  // AIDEV-NOTE: The ENTIRE header must be whole seconds: parseInt would truncate '1.5'/'300.9'
  // and accept '1oops' as 1. HTTP-date Retry-After values are deliberately discarded, not parsed.
  const retryAfterHeader = response.headers.get('Retry-After')?.trim() ?? null
  const retryAfter = retryAfterHeader !== null && /^\d{1,3}$/.test(retryAfterHeader) ? Number(retryAfterHeader) : Number.NaN
  const opts: { status: number; requestId: string; retryAfterSeconds?: number } = { status: response.status, requestId: result.data.request_id }
  if (Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 300) opts.retryAfterSeconds = retryAfter
  return new GatewayError('api', result.data.code, result.data.message, opts)
}

export type JsonMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface RequestOptions {
  headers?: Record<string, string>
  signal?: AbortSignal | undefined
  fetchImpl?: FetchLike
  /** JSON body. Absent means a body-less request (GET, or DELETE when `method` says so). */
  body?: unknown
  /** Defaults to POST when a body is present, otherwise GET. DELETE never carries a body. */
  method?: JsonMethod
  /** Request budget in serialized UTF-8 bytes (x-max-request-bytes); defaults to the 8 KiB lifecycle bound. */
  maxRequestBytes?: number
  /** Error envelope for this route; defaults to the closed A/B Error. */
  errorSchema?: ErrorEnvelopeSchema
}

export interface JsonResult<T> {
  data: T
  /** The 2xx status, so a caller can tell 201 (created) from 200 (replayed) without re-reading the body. */
  status: number
}

/**
 * GET (or POST a JSON body to) a relative versioned API path and validate the response body. Rejects
 * absolute URLs, redirects, non-JSON content types and oversized or malformed bodies with
 * deliberate GatewayErrors. The request body is never included in any error.
 */
export async function requestJson<S extends z.ZodType>(
  path: string,
  schema: S,
  maxBytes: number,
  options: RequestOptions,
): Promise<z.output<S>> {
  return (await requestJsonWithStatus(path, schema, maxBytes, options)).data
}

export async function requestJsonWithStatus<S extends z.ZodType>(
  path: string,
  schema: S,
  maxBytes: number,
  options: RequestOptions,
): Promise<JsonResult<z.output<S>>> {
  if (!/^\/v(?:1|2)\//.test(path)) throw new GatewayError('transport', 'network', 'Only relative versioned API paths are allowed.')
  if (options.signal?.aborted) throw new GatewayError('transport', 'aborted', 'The request was cancelled.')
  const hasBody = 'body' in options
  const method: JsonMethod = options.method ?? (hasBody ? 'POST' : 'GET')
  if (hasBody && (method === 'GET' || method === 'DELETE')) throw new GatewayError('transport', 'malformed', `${method} cannot carry a body.`)
  if (!hasBody && (method === 'POST' || method === 'PUT')) throw new GatewayError('transport', 'malformed', `${method} requires a JSON body.`)
  const errorSchema = options.errorSchema ?? ErrorSchema
  let serializedBody: string | undefined
  if (hasBody) {
    serializedBody = JSON.stringify(options.body)
    // AIDEV-NOTE: Bound the REQUEST before dispatch too (x-max-request-bytes); the server would
    // reject it anyway, but a too-large password or draft must never leave the browser at all.
    if (new TextEncoder().encode(serializedBody).byteLength > (options.maxRequestBytes ?? MAX_REQUEST_BYTES)) {
      throw new GatewayError('transport', 'oversized', 'The request exceeded its size limit.')
    }
  }
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new GatewayError('transport', 'timeout', 'The request timed out.')), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => controller.abort(new GatewayError('transport', 'aborted', 'The request was cancelled.'))
  options.signal?.addEventListener('abort', onOuterAbort, { once: true })
  let response: Response | undefined
  try {
    // AIDEV-NOTE: Race both fetch and reads so even an abort-ignoring implementation obeys the same deadline.
    const receivedResponse = await untilAborted(fetchImpl(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        headers: hasBody
          ? { Accept: 'application/json', 'Content-Type': 'application/json', ...options.headers }
          : { Accept: 'application/json', ...options.headers },
        ...(serializedBody === undefined ? {} : { body: serializedBody }),
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
    if (!receivedResponse.ok) throw await toApiError(receivedResponse, await readBounded(receivedResponse, MAX_BYTES.error, controller.signal), errorSchema)
    const raw = await readBounded(receivedResponse, maxBytes, controller.signal)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new GatewayError('transport', 'malformed', 'The server returned unreadable data.')
    }
    const result = schema.safeParse(parsed)
    if (!result.success) throw new GatewayError('transport', 'malformed', 'The server returned data that does not match the contract.')
    return { data: result.data, status: receivedResponse.status }
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
