// Maps a lifecycle request failure to a bounded, generic user-facing outcome. Branches on the
// contract error CODE, never on server text, and never echoes request input (no password or
// body in any message). Shared by the session controller and the /auth/complete form.
import { GatewayError } from '@/data/errors'

export interface ActionFailure {
  code: 'rejected' | 'invalid' | 'rate_limited' | 'unavailable' | 'no_organization' | 'context_changed' | 'failed'
  message: string
  /** Present only for a bounded 429/503 Retry-After (1..300 s). */
  retryAfterSeconds?: number
}

export type ActionResult = { kind: 'ok' } | { kind: 'superseded' } | { kind: 'failed'; failure: ActionFailure }

const GENERIC_REJECTION = 'Sign-in was not accepted. Check the email address and password, or recover access.'

export function classifyFailure(error: unknown, rejection = GENERIC_REJECTION): ActionFailure {
  if (!(error instanceof GatewayError)) return { code: 'failed', message: 'The request could not be completed.' }
  if (error.kind === 'transport') {
    // Browser-side validation rejects the input before dispatch; everything else is a transport fault.
    if (error.code === 'malformed' && error.status === undefined) return { code: 'invalid', message: 'The entered values are not acceptable.' }
    if (error.code === 'aborted') return { code: 'failed', message: 'The request was cancelled.' }
    if (error.code === 'timeout') return { code: 'unavailable', message: 'The server did not answer in time. Nothing was changed on this screen.' }
    return { code: 'unavailable', message: 'The server could not be reached. Nothing was changed on this screen.' }
  }
  const retry = error.retryAfterSeconds === undefined ? {} : { retryAfterSeconds: error.retryAfterSeconds }
  switch (error.code) {
    case 'unauthenticated':
      return { code: 'rejected', message: rejection }
    case 'request_invalid':
    case 'cursor_invalid':
      return { code: 'invalid', message: 'The request was not accepted. Reload the page and try again.' }
    case 'rate_limited':
      return { code: 'rate_limited', message: 'Too many attempts. Wait before trying again.', ...retry }
    case 'temporarily_unavailable':
      return { code: 'unavailable', message: 'The service is temporarily unavailable. Your entries are kept on this screen; nothing was saved.', ...retry }
    case 'not_available':
      return { code: 'no_organization', message: 'No organization is available for this account yet.' }
    case 'context_changed':
      return { code: 'context_changed', message: 'Your access changed. Reload to continue.' }
    case 'internal_error':
      return { code: 'failed', message: 'The server reported an internal error.' }
    default:
      // Transport codes were handled above; the union is not discriminated by kind for TypeScript.
      return { code: 'failed', message: 'The request could not be completed.' }
  }
}
