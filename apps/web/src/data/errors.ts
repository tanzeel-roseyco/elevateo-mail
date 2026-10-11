export const API_ERROR_CODES = [
  'unauthenticated',
  'not_available',
  'context_changed',
  'cursor_invalid',
  'request_invalid',
  'rate_limited',
  'temporarily_unavailable',
  'internal_error',
] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

/** Deliberate client-side failures; none of these may activate fixtures. */
export type TransportErrorCode = 'network' | 'timeout' | 'aborted' | 'redirected' | 'wrong_content_type' | 'oversized' | 'malformed'

export class GatewayError extends Error {
  readonly kind: 'api' | 'transport'
  readonly code: ApiErrorCode | TransportErrorCode
  readonly status: number | undefined
  readonly requestId: string | undefined
  readonly retryAfterSeconds: number | undefined

  constructor(kind: 'api' | 'transport', code: ApiErrorCode | TransportErrorCode, message: string, opts?: { status?: number; requestId?: string; retryAfterSeconds?: number }) {
    super(message)
    this.name = 'GatewayError'
    this.kind = kind
    this.code = code
    this.status = opts?.status
    this.requestId = opts?.requestId
    this.retryAfterSeconds = opts?.retryAfterSeconds
  }
}

export function isApiError(error: unknown, code: ApiErrorCode): boolean {
  return error instanceof GatewayError && error.kind === 'api' && error.code === code
}
