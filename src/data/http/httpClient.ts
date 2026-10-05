import type { z } from 'zod'
import { describeServerError } from '@/domain/sendLifecycle'
import { errorResponse } from './contract'

// AIDEV-NOTE: The only place that calls fetch in API-backed mode. Pure transport: it never touches a store and has
// no mock fallback. A failure is always thrown as ApiFailure, so "unavailable" can never look like success.

export type FailureKind =
  /** The request never produced a response (offline, refused, reset). The server may or may not have acted. */
  | 'network'
  /** No response within the time limit. The server may or may not have acted. */
  | 'timeout'
  /** 401: the session is missing, expired or revoked. */
  | 'unauthorized'
  /** The server answered with a stable error code and did not perform the action. */
  | 'refused'
  /** The server or a proxy answered with something that is not the contract (5xx page, bad JSON, wrong shape). */
  | 'unavailable'

export class ApiFailure extends Error {
  constructor(
    readonly kind: FailureKind,
    message: string,
    readonly code: string | null = null,
    readonly status: number | null = null,
    readonly requestId: string | null = null,
  ) {
    super(message)
    this.name = 'ApiFailure'
  }
  /** True when the server may have acted even though no usable answer arrived. Callers must inspect, not repeat. */
  get outcomeUncertain(): boolean {
    return this.kind === 'network' || this.kind === 'timeout' || (this.kind === 'unavailable' && this.status !== null && this.status >= 500) || this.code === 'internal_error'
  }
}

export interface HttpClientOptions {
  /** Same-origin prefix, e.g. "" so requests go to /v1/... through the serving proxy. The server enables no CORS. */
  baseUrl: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export interface HttpClient {
  request<S extends z.ZodType>(method: 'GET' | 'POST' | 'PATCH', path: string, schema: S, body?: unknown): Promise<z.infer<S>>
}

export const DEFAULT_TIMEOUT_MS = 10_000
/** Mirrors the server's body cap; a response larger than this is not the contract. */
const MAX_RESPONSE_BYTES = 262_144

export function createHttpClient(options: HttpClientOptions): HttpClient {
  const transport = options.fetch ?? ((input, init) => fetch(input, init))
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    async request(method, path, schema, body) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      let response: Response
      let text: string
      let oversized = false
      try {
        response = await transport(`${options.baseUrl}${path}`, {
          method,
          // The session is an HttpOnly cookie the browser attaches itself; this code never sees or stores it.
          credentials: 'same-origin',
          // Every state-changing request carries the marker the server requires, so another site cannot forge one.
          headers: { accept: 'application/json', ...(method === 'GET' ? {} : { 'x-elevateo-csrf': '1' }), ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          cache: 'no-store',
          signal: controller.signal,
        })
        // A declared length over the cap is refused without reading the body at all.
        oversized = Number(response.headers.get('content-length') ?? 0) > MAX_RESPONSE_BYTES
        text = oversized ? '' : await response.text()
      } catch {
        if (controller.signal.aborted) throw new ApiFailure('timeout', 'The server did not answer in time.')
        throw new ApiFailure('network', 'The server could not be reached.')
      } finally {
        clearTimeout(timer)
      }
      if (oversized || text.length > MAX_RESPONSE_BYTES) throw new ApiFailure('unavailable', 'The server sent an unexpectedly large answer.', null, response.status)

      let data: unknown
      try {
        data = JSON.parse(text)
      } catch {
        // A proxy error page or an empty body: the backend itself did not answer.
        throw new ApiFailure('unavailable', 'The server is unavailable or sent an answer that could not be read.', null, response.status)
      }
      if (!response.ok) {
        const parsed = errorResponse.safeParse(data)
        if (!parsed.success) throw new ApiFailure('unavailable', 'The server is unavailable or sent an answer that could not be read.', null, response.status)
        const { code, requestId } = parsed.data.error
        throw new ApiFailure(response.status === 401 ? 'unauthorized' : 'refused', describeServerError(code), code, response.status, requestId)
      }
      const parsed = schema.safeParse(data)
      // Fail loud: a shape we do not understand is never rendered as if it were data.
      if (!parsed.success) throw new ApiFailure('unavailable', 'The server sent an answer this version of the app does not understand.', null, response.status)
      return parsed.data
    },
  }
}
