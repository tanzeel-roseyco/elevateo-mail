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

// AIDEV-NOTE: BE-02 C/D CollaborationError is a closed superset of Error; A/B routes keep the
// narrow enum (contract: Error is not widened), C/D routes parse the wider one. Both land in the
// same GatewayError so page policy (401/409 context) stays in one place.
export const COLLABORATION_ERROR_CODES = [
  ...API_ERROR_CODES,
  'draft_conflict',
  'operation_mismatch',
  'draft_consumed',
  'assignment_conflict',
  'membership_conflict',
] as const
export type CollaborationErrorCode = (typeof COLLABORATION_ERROR_CODES)[number]

/** Deliberate client-side failures; none of these may activate fixtures. */
export type TransportErrorCode = 'network' | 'timeout' | 'aborted' | 'redirected' | 'wrong_content_type' | 'oversized' | 'malformed'

export class GatewayError extends Error {
  readonly kind: 'api' | 'transport'
  readonly code: CollaborationErrorCode | TransportErrorCode
  readonly status: number | undefined
  readonly requestId: string | undefined
  readonly retryAfterSeconds: number | undefined

  constructor(
    kind: 'api' | 'transport',
    code: CollaborationErrorCode | TransportErrorCode,
    message: string,
    opts?: { status?: number; requestId?: string; retryAfterSeconds?: number },
  ) {
    super(message)
    this.name = 'GatewayError'
    this.kind = kind
    this.code = code
    this.status = opts?.status
    this.requestId = opts?.requestId
    this.retryAfterSeconds = opts?.retryAfterSeconds
  }
}

export function isApiError(error: unknown, code: CollaborationErrorCode): boolean {
  return error instanceof GatewayError && error.kind === 'api' && error.code === code
}

/**
 * True when the outcome of a WRITE is unknown: the request may have committed although no
 * definitive answer arrived (timeout, network, 429/503/500, or an abort after dispatch).
 * A 4xx business answer (400/401/404/409) is definitive and therefore not uncertain.
 */
export function isUncertainWriteOutcome(error: unknown): boolean {
  if (!(error instanceof GatewayError)) return true
  if (error.kind === 'transport') return error.code !== 'malformed' || error.status !== undefined
  return error.code === 'rate_limited' || error.code === 'temporarily_unavailable' || error.code === 'internal_error'
}
