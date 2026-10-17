// BE-02A: the HTTP gateway maps each lifecycle operation to its exact route, method, proof and
// context headers, validates input before dispatch and validates every response; the fixture
// gateway answers the same calls. Real Rails conformance remains separately pending.
import { afterEach, describe, expect, it, vi } from 'vitest'
import fixtures from '../../../../contracts/v1/fixtures.json'
import { GatewayError } from './errors'
import type { CsrfProof, MailroomGateway, ReadContext } from './gateway'
import { createFixtureGateway } from './fixtures/fixtureGateway'
import { createHttpGateway } from './http/httpGateway'

const examples = fixtures.examples as Record<string, { status: number; body: unknown }>
const lifecycle = fixtures.lifecycle_examples as Record<string, { value: unknown }>
const CTX: ReadContext = { contextId: 'context_A_0123456789', authorizationVersion: 'authz_A_0123456789' }
const PROOF: CsrfProof = { csrfToken: 'synthetic_challenge_token_00000001' }
const ORG = '00000000-0000-4000-8000-000000000011'
const LIFECYCLE_A = { session: examples['session_a']!.body, access_expires_at: '2026-10-13T01:00:00Z' }

interface Captured {
  path: string
  init: RequestInit
}

/** HTTP gateway over a fetch that records the request and answers with one canned response. */
function recording(status: number, body: unknown) {
  const calls: Captured[] = []
  const gateway = createHttpGateway(async (path, init) => {
    calls.push({ path, init })
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  })
  return { gateway, calls, last: () => calls[calls.length - 1]! }
}

const headersOf = (c: Captured) => c.init.headers as Record<string, string>

afterEach(() => vi.useRealTimers())

describe('lifecycle routes over the HTTP gateway', () => {
  it('GET /v1/auth/login-challenge carries no proof, no context and no body', async () => {
    const { gateway, last } = recording(200, lifecycle['challenge']!.value)
    const challenge = await gateway.getLoginChallenge()
    expect(challenge.csrf_token).toBe('synthetic_challenge_token_00000001')
    expect(last().path).toBe('/v1/auth/login-challenge')
    expect(last().init.method).toBe('GET')
    expect(last().init.body).toBeUndefined()
    expect(headersOf(last())['X-CSRF-Token']).toBeUndefined()
    expect(headersOf(last())['X-Session-Context']).toBeUndefined()
  })

  it('POST /v1/auth/login sends the proof header and exactly the validated input', async () => {
    const { gateway, last } = recording(200, LIFECYCLE_A)
    const result = await gateway.login(PROOF, { email: 'a@example.test', password: 'secret' })
    expect(result.session.context_id).toBe('context_A_0123456789')
    expect(last().path).toBe('/v1/auth/login')
    expect(last().init.method).toBe('POST')
    expect(headersOf(last())['X-CSRF-Token']).toBe(PROOF.csrfToken)
    expect(headersOf(last())['X-Session-Context']).toBeUndefined()
    expect(JSON.parse(last().init.body as string)).toEqual({ email: 'a@example.test', password: 'secret' })
  })

  it('POST /v1/auth/recovery accepts the 202 body and sends only the email', async () => {
    const { gateway, last } = recording(202, lifecycle['recovery_accepted']!.value)
    await expect(gateway.requestRecovery(PROOF, { email: 'a@example.test' })).resolves.toEqual({ accepted: true })
    expect(last().path).toBe('/v1/auth/recovery')
    expect(JSON.parse(last().init.body as string)).toEqual({ email: 'a@example.test' })
  })

  it('POST /v1/auth/accept sends only the password under the challenge proof', async () => {
    const { gateway, last } = recording(200, LIFECYCLE_A)
    await gateway.acceptAuthEntry(PROOF, { password: 'twelve-chars-long' })
    expect(last().path).toBe('/v1/auth/accept')
    expect(headersOf(last())['X-CSRF-Token']).toBe(PROOF.csrfToken)
    expect(JSON.parse(last().init.body as string)).toEqual({ password: 'twelve-chars-long' })
  })

  it('POST /v1/auth/refresh sends an empty JSON object under the challenge proof', async () => {
    const { gateway, last } = recording(200, LIFECYCLE_A)
    await gateway.refreshSession(PROOF)
    expect(last().path).toBe('/v1/auth/refresh')
    expect(last().init.body).toBe('{}')
    expect(headersOf(last())['X-CSRF-Token']).toBe(PROOF.csrfToken)
  })

  it('POST /v1/auth/logout sends the explicit scope and validates the result', async () => {
    const { gateway, last } = recording(200, lifecycle['logout_pending']!.value)
    const result = await gateway.logout({ csrfToken: 'fixture_token_a_0123456789' }, { scope: 'global' })
    expect(result).toEqual({ local_revoked: true, upstream_status: 'pending' })
    expect(last().path).toBe('/v1/auth/logout')
    expect(JSON.parse(last().init.body as string)).toEqual({ scope: 'global' })
    expect(headersOf(last())['X-CSRF-Token']).toBe('fixture_token_a_0123456789')
  })

  it('GET /v1/organizations carries the context headers and page query', async () => {
    const { gateway, last } = recording(200, { ...CTXBODY(), next_cursor: null, items: [{ id: ORG, name: 'Org A' }] })
    const page = await gateway.listOrganizations(CTX, { cursor: 'c1', limit: 10 })
    expect(page.items[0]?.name).toBe('Org A')
    expect(last().path).toBe('/v1/organizations?cursor=c1&limit=10')
    expect(headersOf(last())['X-Session-Context']).toBe(CTX.contextId)
    expect(headersOf(last())['X-Authorization-Version']).toBe(CTX.authorizationVersion)
  })

  it('POST /v1/session/organization carries context, session proof and the target id', async () => {
    const { gateway, last } = recording(200, LIFECYCLE_A)
    await gateway.switchOrganization(CTX, { csrfToken: 'fixture_token_a_0123456789' }, { organization_id: ORG })
    expect(last().path).toBe('/v1/session/organization')
    expect(headersOf(last())['X-Session-Context']).toBe(CTX.contextId)
    expect(headersOf(last())['X-Authorization-Version']).toBe(CTX.authorizationVersion)
    expect(headersOf(last())['X-CSRF-Token']).toBe('fixture_token_a_0123456789')
    expect(JSON.parse(last().init.body as string)).toEqual({ organization_id: ORG })
  })
})

describe('input is validated before anything is sent', () => {
  it.each([
    ['login with a malformed email', (g: MailroomGateway) => g.login(PROOF, { email: 'nope', password: 'x' })],
    ['login with an empty password', (g: MailroomGateway) => g.login(PROOF, { email: 'a@example.test', password: '' })],
    ['recovery with an oversized email', (g: MailroomGateway) => g.requestRecovery(PROOF, { email: `${'a'.repeat(330)}@example.test` })],
    ['accept with a short password', (g: MailroomGateway) => g.acceptAuthEntry(PROOF, { password: 'short' })],
    ['logout with an unknown scope', (g: MailroomGateway) => g.logout(PROOF, { scope: 'everywhere' as 'local' })],
    ['switch with a non-UUID target', (g: MailroomGateway) => g.switchOrganization(CTX, PROOF, { organization_id: 'org-a' })],
  ])('%s is rejected locally and no request leaves the browser', async (_label, call) => {
    const { gateway, calls } = recording(200, LIFECYCLE_A)
    await expect(call(gateway)).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
    expect(calls).toHaveLength(0)
  })

  // Regression: validation used to throw synchronously from a non-async method, so the port's
  // Promise contract broke and `.catch`/`rejects` consumers never saw the rejection.
  it('a local rejection is a rejected promise, never a synchronous throw', async () => {
    const { gateway, calls } = recording(200, LIFECYCLE_A)
    let thrown: unknown = null
    let pending: Promise<unknown> | undefined
    try {
      pending = gateway.switchOrganization(CTX, PROOF, { organization_id: 'org-a' })
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeNull()
    expect(pending).toBeInstanceOf(Promise)
    await expect(pending).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
    expect(calls).toHaveLength(0)
  })
})

describe('lifecycle failures keep their canonical status and code', () => {
  it.each([
    ['unauthenticated', 401],
    ['not_available', 404],
    ['rate_limited', 429],
    ['temporarily_unavailable', 503],
    ['request_invalid', 400],
  ])('%s on login surfaces as an api GatewayError with status %s', async (code, status) => {
    const { gateway } = recording(status, examples[code]!.body)
    await expect(gateway.login(PROOF, { email: 'a@example.test', password: 'secret' })).rejects.toMatchObject({ kind: 'api', code, status })
  })

  it('a lifecycle body that does not match the contract is a deliberate malformed error', async () => {
    const { gateway } = recording(200, { session: examples['session_a']!.body })
    await expect(gateway.refreshSession(PROOF)).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it('a challenge body over 1 KiB is rejected as oversized', async () => {
    const { gateway } = recording(200, { csrf_token: 'synthetic_challenge_token_00000001', expires_at: '2026-10-13T00:05:00Z', pad: 'x'.repeat(1100) })
    await expect(gateway.getLoginChallenge()).rejects.toMatchObject({ kind: 'transport', code: 'oversized' })
  })

  it('a Retry-After on 503 is exposed as whole seconds', async () => {
    const gateway = createHttpGateway(async () => new Response(JSON.stringify(examples['temporarily_unavailable']!.body), { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '1' } }))
    const caught = await gateway.refreshSession(PROOF).catch((e: unknown) => e)
    expect(caught).toBeInstanceOf(GatewayError)
    expect((caught as GatewayError).retryAfterSeconds).toBe(1)
  })
})

describe('fixture gateway parity', () => {
  it('answers every lifecycle operation with contract-valid data', async () => {
    const gateway = createFixtureGateway({ refreshSession: 'lifecycle_a' })
    expect((await gateway.getLoginChallenge()).csrf_token).toMatch(/^[A-Za-z0-9_-]{16,256}$/)
    expect((await gateway.login(PROOF, { email: 'a@example.test', password: 'secret' })).session.simulation_mode).toBe(true)
    expect((await gateway.refreshSession(PROOF)).access_expires_at).toBe('2026-10-13T01:00:00Z')
    expect((await gateway.logout(PROOF, { scope: 'local' })).local_revoked).toBe(true)
    expect((await gateway.listOrganizations(CTX, {})).items).toHaveLength(2)
    expect((await gateway.switchOrganization(CTX, PROOF, { organization_id: ORG })).session.organization.name).toBe('Synthetic organization B')
  })
})

function CTXBODY() {
  return { context_id: CTX.contextId, authorization_version: CTX.authorizationVersion }
}
