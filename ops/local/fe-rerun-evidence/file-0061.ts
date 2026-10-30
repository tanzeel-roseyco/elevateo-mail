// User-facing description of a failed BE-02 C/D request. Branches on the contract error CODE,
// never on server text, and never echoes request content. Pages still route 401/409
// context_changed through the session controller BEFORE calling this.
import { GatewayError, isUncertainWriteOutcome } from '@/data/errors'

export interface CollaborationFailure {
  code:
    | 'unavailable_resource'
    | 'stale_version'
    | 'operation_mismatch'
    | 'consumed'
    | 'invalid'
    | 'rate_limited'
    | 'outage'
    | 'uncertain'
    | 'failed'
  message: string
  /** True when a WRITE may have committed although no definitive answer arrived. */
  uncertain: boolean
  retryAfterSeconds: number | null
}

export function describeFailure(error: unknown, kind: 'read' | 'write'): CollaborationFailure {
  const uncertain = kind === 'write' && isUncertainWriteOutcome(error)
  const notConfirmed = uncertain ? ' The change was not confirmed; it may or may not have been stored.' : ''
  if (!(error instanceof GatewayError)) return { code: 'failed', message: `The request could not be completed.${notConfirmed}`, uncertain, retryAfterSeconds: null }
  const retry = error.retryAfterSeconds ?? null
  if (error.kind === 'transport') {
    if (error.code === 'malformed' && error.status === undefined) return { code: 'invalid', message: 'The entered values are not acceptable.', uncertain: false, retryAfterSeconds: null }
    if (error.code === 'oversized' && error.status === undefined) return { code: 'invalid', message: 'The content is larger than the server accepts.', uncertain: false, retryAfterSeconds: null }
    if (error.code === 'timeout') return { code: 'uncertain', message: `The server did not answer in time.${notConfirmed}`, uncertain, retryAfterSeconds: null }
    if (error.code === 'aborted') return { code: 'failed', message: 'The request was cancelled.', uncertain, retryAfterSeconds: null }
    return { code: 'uncertain', message: `The server could not be reached.${notConfirmed}`, uncertain, retryAfterSeconds: null }
  }
  switch (error.code) {
    case 'not_available':
      return { code: 'unavailable_resource', message: 'This item is unavailable to you now.', uncertain: false, retryAfterSeconds: null }
    case 'draft_conflict':
    case 'assignment_conflict':
      return { code: 'stale_version', message: 'This changed elsewhere since you loaded it. Reload to see the current state before changing it.', uncertain: false, retryAfterSeconds: null }
    case 'membership_conflict':
      // The same code covers a stale roster revision AND the last-manager guard (§8).
      return { code: 'stale_version', message: 'The membership changed elsewhere since you loaded it, or this change would leave the mailbox without a manager. Reload before changing it again.', uncertain: false, retryAfterSeconds: null }
    case 'operation_mismatch':
      return { code: 'operation_mismatch', message: 'This attempt cannot be reused with different content. Start a new attempt.', uncertain: false, retryAfterSeconds: null }
    case 'draft_consumed':
      return { code: 'consumed', message: 'This draft has been consumed and can no longer be edited.', uncertain: false, retryAfterSeconds: null }
    case 'request_invalid':
    case 'cursor_invalid':
      return { code: 'invalid', message: 'The request was not accepted. Reload and try again.', uncertain: false, retryAfterSeconds: null }
    case 'rate_limited':
      return { code: 'rate_limited', message: `Too many requests. Wait before trying again.${notConfirmed}`, uncertain, retryAfterSeconds: retry }
    case 'temporarily_unavailable':
      return { code: 'outage', message: `The service is temporarily unavailable.${notConfirmed}`, uncertain, retryAfterSeconds: retry }
    case 'internal_error':
      return { code: 'failed', message: `The server reported an internal error.${notConfirmed}`, uncertain, retryAfterSeconds: null }
    default:
      // 401/409 context_changed are consumed by the session controller before reaching here.
      return { code: 'failed', message: `The request could not be completed.${notConfirmed}`, uncertain, retryAfterSeconds: null }
  }
}
