// App-level SSO boundary (launch sprint, 2026-10-23). The backend worker owns the server side and
// the canonical OpenAPI entry; this module is the only place the web client spells the SSO routes
// and response shape, so a contract refinement is one edit here plus the adapters.
//
// AIDEV-NOTE: Contract as confirmed by the coordinator: GET /v1/auth/sso/status reports
// { enabled, provider, password_login_enabled }; GET /v1/auth/sso/start is a full-page navigation
// (no return_to, fixed inbox landing); the callback sets the ordinary session cookie and redirects
// to "/", or to "/?sso_error=<code>" on failure. Not yet in contracts/v1/openapi.json.
import { z } from 'zod'

/** Status response from GET /v1/auth/sso/status. Unknown providers are rejected and fail closed. */
export const AuthSsoStatusSchema = z.strictObject({
  enabled: z.boolean(),
  /** Null when SSO is disabled; only Google is rendered by the client today. */
  provider: z.enum(['google']).nullable(),
  /** The password form is shown only when the server says so explicitly (fail closed). */
  password_login_enabled: z.boolean(),
})
  // `enabled` and `provider` must agree; a contradictory body is a contract error, not a guess.
  .refine((status) => status.enabled === (status.provider !== null), { message: 'provider must match enabled' })
export type AuthSsoStatus = z.infer<typeof AuthSsoStatusSchema>

/** Response byte budget for the status read; the body is three scalars. */
export const SSO_STATUS_MAX_BYTES = 1_024

/** Full-page navigation target that begins the IdP round trip (server redirects to Google). */
export const SSO_START_PATH = '/v1/auth/sso/start'

/** Query parameter the callback appends to "/" when the round trip did not produce a session. */
export const SSO_ERROR_PARAM = 'sso_error'

export const SSO_ERROR_CODES = ['access_denied', 'unavailable', 'invalid_response'] as const
export type SsoErrorCode = (typeof SSO_ERROR_CODES)[number]

/** A landing failure: a known code, or `unknown` for any other non-empty value (never echoed). */
export type SsoLandingError = { code: SsoErrorCode | 'unknown' }

/**
 * Reads the callback failure from a location search string. The raw value is never returned or
 * displayed: anything outside the known codes collapses to `unknown` so a crafted URL cannot inject
 * copy into the sign-in page.
 */
export function readSsoLandingError(search: string): SsoLandingError | null {
  const value = new URLSearchParams(search).get(SSO_ERROR_PARAM)
  if (value === null || value === '') return null
  const known = SSO_ERROR_CODES.find((code) => code === value)
  return { code: known ?? 'unknown' }
}

/** Removes the failure parameter so a reload or bookmark does not repeat a stale message. */
export function stripSsoLandingError(search: string): string {
  const params = new URLSearchParams(search)
  params.delete(SSO_ERROR_PARAM)
  const rest = params.toString()
  return rest === '' ? '' : `?${rest}`
}

// AIDEV-NOTE: Generic, safe copy by design: no account, provider error detail or email is shown,
// matching the password form's no-account-existence-leakage rule.
const LANDING_COPY: Record<SsoLandingError['code'], string> = {
  access_denied: 'Google sign-in was not completed. The account was not accepted for this workspace, or the request was cancelled.',
  unavailable: 'Google sign-in is temporarily unavailable. Try again in a moment.',
  invalid_response: 'The sign-in response could not be verified. Start the sign-in again.',
  unknown: 'Sign-in was not completed. Try again.',
}

export function ssoLandingErrorText(error: SsoLandingError): string {
  return LANDING_COPY[error.code]
}
