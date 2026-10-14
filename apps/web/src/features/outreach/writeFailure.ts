import { GatewayError, isApiError, isUncertainWriteOutcome } from '@/data/errors'

/** Treat a lost or malformed receipt as uncertain; only a definitive 4xx can be corrected in place. */
export function writeFailure(error: unknown): { message: string; lock: boolean } {
  if (isApiError(error, 'unauthenticated') || isApiError(error, 'context_changed') || isApiError(error, 'not_available')) {
    return { message: 'Access changed or this resource is unavailable. Leave this page and sign in or reopen the campaign.', lock: true }
  }
  if (isUncertainWriteOutcome(error) || (error instanceof GatewayError && error.kind === 'transport' && error.code === 'malformed')) {
    return { message: 'Change was not confirmed. Check the saved resource before trying again.', lock: true }
  }
  return { message: 'The server rejected this change. Review the fields and try again.', lock: false }
}
