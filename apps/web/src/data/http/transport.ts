// Bounded same-origin JSON transport. Behavior adapted from first-party Ledger frontend 4322cfbb,
// src/data/http/httpClient.ts (blob 8f8e6e08…): credentials same-origin, no-store, 10s abort
// deadline, streamed byte bound, Zod result/error parsing. Changes: per-endpoint byte budgets,
// redirect rejection, content-type check before body use, and no legacy x-elevateo-* headers.
import type { z } from 'zod'
import { GatewayError } from '../errors'
import { ErrorSchema, MAX_BYTES } from '../contract'

export const REQUEST_TIMEOUT_MS = 10_000

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

async function readBounded(response: Response, maxBytes: number): Promise<string> {
  // AIDEV-NOTE: Always bound the stream; Content-Length alone is not trusted (R2 oversized case).
  const body = response.body
  if (!body) {
    const text = await response.text()
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new GatewayError('transport', 'oversized', 'Response exceeded its size limit.')
    return text
  }
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new GatewayError('transport', 'oversized', 'Response exceeded its size limit.')
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
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
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init))
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new GatewayError('transport', 'timeout', 'The request timed out.')), REQUEST_TIMEOUT_MS)
  const onOuterAbort = () => controller.abort(new GatewayError('transport', 'aborted', 'The request was cancelled.'))
  options.signal?.addEventListener('abort', onOuterAbort, { once: true })
  try {
    let response: Response
    try {
      response = await fetchImpl(path, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        headers: { Accept: 'application/json', ...options.headers },
        signal: controller.signal,
      })
    } catch (cause) {
      if (cause instanceof GatewayError) throw cause
      if (controller.signal.aborted && controller.signal.reason instanceof GatewayError) throw controller.signal.reason
      throw new GatewayError('transport', 'network', 'The server could not be reached.')
    }
    if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
      throw new GatewayError('transport', 'redirected', 'Unexpected redirect was rejected.', { status: response.status })
    }
    const contentType = response.headers.get('Content-Type') ?? ''
    if (!contentType.toLowerCase().includes('application/json')) {
      throw new GatewayError('transport', 'wrong_content_type', 'The server returned a non-JSON response.', { status: response.status })
    }
    if (!response.ok) throw await toApiError(response, await readBounded(response, MAX_BYTES.error))
    const raw = await readBounded(response, maxBytes)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new GatewayError('transport', 'malformed', 'The server returned unreadable data.')
    }
    const result = schema.safeParse(parsed)
    if (!result.success) throw new GatewayError('transport', 'malformed', 'The server returned data that does not match the contract.')
    return result.data
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', onOuterAbort)
  }
}
