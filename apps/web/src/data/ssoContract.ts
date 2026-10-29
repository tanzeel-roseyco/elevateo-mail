// App-level SSO boundary (launch sprint, 2026-10-23). The backend worker owns the server side and
// the canonical OpenAPI entry; this module is the only place the web client spells the SSO routes
// and response shape, so a contract refinement is one edit here plus the adapters.
//
// AIDEV-NOTE: Contract as confirmed by the coordinator: GET /v1/auth/sso/status reports
// { enabled, provider, password_login_enabled }; GET /v1/auth/sso/start is a full-page navigation
// (no return_to, fixed inbox landing); the callback sets the ordinary session cookie and redirects
// to "/", or to "/?sso_error=<code>" on failure. Not yet in contracts/v1/openapi.json.
// AIDEV-NOTE: Provider is a typed allowlist, not arbitrary acceptance (coordinator 2026-10-23): the
// auth worker reports `custom:authentik` for the self-hosted Authentik IdP. Google Cloud is
// prohibited, so the client treats a reported `google` provider as SSO-unavailable (fail closed):
// `google` stays in the parse allowlist only so a server that still enumerates it does not break the
// schema, but `isSsoUsable` refuses to drive it and no Google UI is ever rendered. `CLIENT_SSO_PROVIDERS`
// is the real set this client can begin a flow with. The client never names a vendor in copy.
import { z } from 'zod'

/** Provider identifiers the server may report; anything else is a contract error and fails closed. */
export const SSO_PROVIDERS = ['custom:authentik', 'google'] as const

/**
 * Providers this client is willing to start a sign-in with. `google` is parsed (above) but absent
 * here, so a `google` report is treated as unavailable rather than rendered — Google Cloud is
 * prohibited and the UI must never offer it.
 */
export const CLIENT_SSO_PROVIDERS = ['custom:authentik'] as const

/** Status response from GET /v1/auth/sso/status. Unknown providers are rejected and fail closed. */
export const AuthSsoStatusSchema = z.strictObject({
  enabled: z.boolean(),
  /** Null when SSO is disabled; otherwise one of the known server identifiers, never shown verbatim. */
  provider: z.enum(SSO_PROVIDERS).nullable(),
  /** The password form is shown only when the server says so explicitly (fail closed). */
  password_login_enabled: z.boolean(),
})
  // `enabled` and `provider` must agree; a contradictory body is a contract error, not a guess.
  .refine((status) => status.enabled === (status.provider !== null), { message: 'provider must match enabled' })
export type AuthSsoStatus = z.infer<typeof AuthSsoStatusSchema>

/** Response byte budget for the status read; the body is three scalars. */
export const SSO_STATUS_MAX_BYTES = 1_024

/** Full-page navigation target that begins the IdP round trip (server redirects to the identity provider). */
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
  access_denied: 'Single sign-on was not completed. The account was not accepted for this workspace, or the request was cancelled.',
  unavailable: 'Single sign-on is temporarily unavailable. Try again in a moment.',
  invalid_response: 'The sign-in response could not be verified. Start the sign-in again.',
  unknown: 'Sign-in was not completed. Try again.',
}

export function ssoLandingErrorText(error: SsoLandingError): string {
  return LANDING_COPY[error.code]
}

/** True when the client can begin the SSO flow: enabled, a provider is named, and it is one this client drives. */
export function isSsoUsable(status: AuthSsoStatus): boolean {
  return status.enabled && status.provider !== null && (CLIENT_SSO_PROVIDERS as readonly string[]).includes(status.provider)
}

/**
 * True when the server offers SSO but with a provider this client refuses to drive (e.g. `google`).
 * The sign-in page shows an unavailable state for this rather than a vendor button.
 */
export function isSsoProviderUnsupported(status: AuthSsoStatus): boolean {
  return status.enabled && status.provider !== null && !isSsoUsable(status)
}
