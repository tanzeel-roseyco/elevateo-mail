// SSO boundary: the status schema fails closed on anything unexpected, the HTTP adapter hits the
// exact route without proof or context headers, the fixture adapter answers the scripted
// variants, and the landing-error reader never echoes an unknown value.
import { describe, expect, it } from 'vitest'
import { createFixtureGateway } from './fixtures/fixtureGateway'
import { createHttpGateway } from './http/httpGateway'
import { AuthSsoStatusSchema, readSsoLandingError, SSO_START_PATH, ssoLandingErrorText, stripSsoLandingError } from './ssoContract'

const SSO_ONLY = { enabled: true, provider: 'custom:authentik', password_login_enabled: false }

function recording(status: number, body: unknown) {
  const calls: Array<{ path: string; init: RequestInit }> = []
  const gateway = createHttpGateway(async (path, init) => {
    calls.push({ path, init })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return { gateway, calls }
}

describe('AuthSsoStatusSchema', () => {
  it('accepts the three confirmed shapes', () => {
    expect(AuthSsoStatusSchema.parse(SSO_ONLY)).toEqual(SSO_ONLY)
    // The allowlist still carries the server's legacy identifier; the client names no vendor either way.
    expect(AuthSsoStatusSchema.parse({ ...SSO_ONLY, provider: 'google' }).provider).toBe('google')
    expect(AuthSsoStatusSchema.parse({ enabled: false, provider: null, password_login_enabled: true }).provider).toBeNull()
  })

  it('rejects a provider outside the allowlist and extra keys so the UI fails closed', () => {
    expect(AuthSsoStatusSchema.safeParse({ ...SSO_ONLY, provider: 'okta' }).success).toBe(false)
    expect(AuthSsoStatusSchema.safeParse({ ...SSO_ONLY, provider: 'authentik' }).success).toBe(false)
    expect(AuthSsoStatusSchema.safeParse({ ...SSO_ONLY, provider: '' }).success).toBe(false)
    expect(AuthSsoStatusSchema.safeParse({ ...SSO_ONLY, start_url: 'https://evil.example' }).success).toBe(false)
    expect(AuthSsoStatusSchema.safeParse({ enabled: true, provider: 'custom:authentik' }).success).toBe(false)
  })

  it('rejects contradictory enabled/provider pairs so the page never has to resolve them', () => {
    expect(AuthSsoStatusSchema.safeParse({ enabled: true, provider: null, password_login_enabled: true }).success).toBe(false)
    expect(AuthSsoStatusSchema.safeParse({ enabled: false, provider: 'custom:authentik', password_login_enabled: true }).success).toBe(false)
  })
})

describe('HTTP adapter', () => {
  it('GETs /v1/auth/sso/status with no proof or context headers and validates the body', async () => {
    const { gateway, calls } = recording(200, SSO_ONLY)
    expect(await gateway.getSsoStatus()).toEqual(SSO_ONLY)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/v1/auth/sso/status')
    const headers = new Headers(calls[0]!.init.headers)
    expect(calls[0]!.init.method ?? 'GET').toBe('GET')
    expect(headers.get('X-CSRF-Token')).toBeNull()
    expect(headers.get('X-Session-Context')).toBeNull()
  })

  it('rejects a malformed status body as a transport error', async () => {
    const { gateway } = recording(200, { enabled: 'yes', provider: 'custom:authentik', password_login_enabled: false })
    await expect(gateway.getSsoStatus()).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it('surfaces a 503 as the api error the page turns into its fail-closed state', async () => {
    const { gateway } = recording(503, { code: 'temporarily_unavailable', message: 'down', request_id: 'req_0000000001' })
    await expect(gateway.getSsoStatus()).rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable' })
  })

  it('keeps the start path a same-origin absolute path (never a URL the page could be pointed at)', () => {
    expect(SSO_START_PATH).toBe('/v1/auth/sso/start')
  })
})

describe('fixture adapter', () => {
  it('defaults to single sign-on plus password and scripts the other variants', async () => {
    expect(await createFixtureGateway().getSsoStatus()).toEqual({ enabled: true, provider: 'custom:authentik', password_login_enabled: true })
    expect(await createFixtureGateway({ getSsoStatus: 'sso_only' }).getSsoStatus()).toEqual(SSO_ONLY)
    expect(await createFixtureGateway({ getSsoStatus: 'sso_password_only' }).getSsoStatus()).toEqual({ enabled: false, provider: null, password_login_enabled: true })
    expect(await createFixtureGateway({ getSsoStatus: 'sso_none' }).getSsoStatus()).toEqual({ enabled: false, provider: null, password_login_enabled: false })
    await expect(createFixtureGateway({ getSsoStatus: 'temporarily_unavailable' }).getSsoStatus()).rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable' })
  })
})

describe('landing error', () => {
  it('reads the known codes and collapses anything else to unknown without echoing it', () => {
    expect(readSsoLandingError('?sso_error=access_denied')).toEqual({ code: 'access_denied' })
    expect(readSsoLandingError('?a=1&sso_error=unavailable')).toEqual({ code: 'unavailable' })
    expect(readSsoLandingError('?sso_error=invalid_response')).toEqual({ code: 'invalid_response' })
    const crafted = readSsoLandingError('?sso_error=%3Cscript%3Ealert(1)%3C%2Fscript%3E')
    expect(crafted).toEqual({ code: 'unknown' })
    expect(ssoLandingErrorText(crafted!)).not.toContain('script')
    expect(readSsoLandingError('?sso_error=')).toBeNull()
    expect(readSsoLandingError('')).toBeNull()
  })

  it('strips only the sso_error parameter', () => {
    expect(stripSsoLandingError('?sso_error=access_denied')).toBe('')
    expect(stripSsoLandingError('?keep=1&sso_error=unavailable')).toBe('?keep=1')
  })
})
