// Direct tests for the adapters behind the PROPOSED (contract-request) routes: connector grants and
// delivery reports, HTTP and simulated. They pin routes, methods, headers, boundary validation, the
// schema-derived byte budgets (a maximum-size valid response must never be rejected as oversized)
// and the simulated adapters' paging, copy and cancellation semantics (reviews P19, P20).
import { describe, expect, it, vi, type Mock } from 'vitest'
import { CONNECTOR_GRANT_MAX_MAILBOXES, CONNECTOR_GRANTS_MAX_ITEMS, type ConnectorGrant } from '../connectorGrantsContract'
import { DELIVERY_REPORTS_MAX_PAGE, type BounceRecord } from '../deliveryReportsContract'
import { createSimulatedConnectorGrantsGateway } from '../fixtures/simulatedConnectorGrants'
import { createSimulatedDeliveryReportsGateway } from '../simulatedDeliveryReports'
import { createHttpConnectorGrantsGateway } from './httpConnectorGrantsGateway'
import { createHttpDeliveryReportsGateway } from './httpDeliveryReportsGateway'
import type { FetchLike } from './transport'

const ctx = { contextId: 'ctx-0123456789abcdef', authorizationVersion: 'auth-0123456789abcdef' }
const proof = { csrfToken: 'csrf-token-value' }
const MAILBOX = '22222222-2222-4222-8222-222222222222'
const ORG = '33333333-3333-4333-8333-333333333333'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function jsonFetch(body: unknown): Mock<FetchLike> {
  return vi.fn<FetchLike>(async () => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } }))
}
function headersOf(fetchImpl: Mock<FetchLike>): Headers {
  return new Headers(fetchImpl.mock.calls[0]?.[1].headers)
}

// Worst-case strings: U+0001 serializes as a six-byte escape, the most any character can cost.
const escaped = (length: number) => '\u0001'.repeat(length)
function maxGrant(n: number): ConnectorGrant {
  return {
    id: uuid(n), client_name: escaped(120), client_kind: 'other',
    created_at: '2026-10-01T00:00:00.000Z', last_used_at: '2026-10-02T00:00:00.000Z', expires_at: '2027-10-01T00:00:00.000Z',
    mailboxes: Array.from({ length: CONNECTOR_GRANT_MAX_MAILBOXES }, (_, i) => ({
      mailbox_id: uuid(10_000 + n * 100 + i), display_name: escaped(256), scopes: ['mailbox:read', 'draft:write'],
    })),
  }
}

describe('HTTP connector grants adapter', () => {
  it('lists grants on the proposed route with the read-context headers', async () => {
    const fetchImpl = jsonFetch({ items: [] })
    await expect(createHttpConnectorGrantsGateway(fetchImpl).listConnectorGrants(ctx)).resolves.toEqual({ items: [] })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/v2/me/connector-grants')
    expect(headersOf(fetchImpl).get('X-Session-Context')).toBe(ctx.contextId)
    expect(headersOf(fetchImpl).get('X-CSRF-Token')).toBeNull()
  })

  // Regression (P19-1): the largest schema-valid list fits the derived budget.
  it('accepts a maximum-size grant list', async () => {
    const items = Array.from({ length: CONNECTOR_GRANTS_MAX_ITEMS }, (_, n) => maxGrant(n))
    const list = await createHttpConnectorGrantsGateway(jsonFetch({ items })).listConnectorGrants(ctx)
    expect(list.items).toHaveLength(CONNECTOR_GRANTS_MAX_ITEMS)
  })

  it('revokes with DELETE, the CSRF proof and an encoded grant id', async () => {
    const fetchImpl = jsonFetch({ revoked: true })
    await createHttpConnectorGrantsGateway(fetchImpl).revokeConnectorGrant(ctx, proof, 'a/b')
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/v2/me/connector-grants/a%2Fb')
    expect(fetchImpl.mock.calls[0]?.[1].method).toBe('DELETE')
    expect(headersOf(fetchImpl).get('X-CSRF-Token')).toBe(proof.csrfToken)
  })

  it('never sends an invalid create body', async () => {
    const fetchImpl = jsonFetch({})
    const create = createHttpConnectorGrantsGateway(fetchImpl).createConnectorGrant(ctx, proof, { client_name: '', client_kind: 'claude', expires_at: null, mailboxes: [] })
    await expect(create).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a response that does not match the contract', async () => {
    const list = createHttpConnectorGrantsGateway(jsonFetch({ items: [{ id: 'not-a-uuid' }] })).listConnectorGrants(ctx)
    await expect(list).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })
})

describe('simulated connector grants adapter', () => {
  // Regression (P19-2): returned scopes arrays are detached from the store.
  it('returns copies that cannot mutate stored grants', async () => {
    const gateway = createSimulatedConnectorGrantsGateway()
    const first = await gateway.listConnectorGrants(ctx)
    first.items[0]!.mailboxes[0]!.scopes.push('draft:write')
    const second = await gateway.listConnectorGrants(ctx)
    expect(second.items[0]!.mailboxes[0]!.scopes).toEqual(['mailbox:read'])
  })

  // Regression (P19-3): a cancelled write neither changes state nor reports success.
  it('rejects cancelled writes without changing state', async () => {
    const gateway = createSimulatedConnectorGrantsGateway()
    const before = await gateway.listConnectorGrants(ctx)
    const aborted = AbortSignal.abort()
    await expect(gateway.revokeConnectorGrant(ctx, proof, before.items[0]!.id, aborted)).rejects.toMatchObject({ kind: 'transport', code: 'aborted' })
    await expect(gateway.createConnectorGrant(ctx, proof, { client_name: 'x', client_kind: 'codex', expires_at: null, mailboxes: [{ mailbox_id: MAILBOX, scopes: ['mailbox:read'] }] }, aborted))
      .rejects.toMatchObject({ code: 'aborted' })
    expect(await gateway.listConnectorGrants(ctx)).toEqual(before)
  })
})

function bounce(n: number, reason: string): BounceRecord {
  return { id: uuid(n), send_id: uuid(1000 + n), thread_id: null, recipient: `r${n}@example.invalid`, provider_event: 'bounced', bounce_type: 'hard', reason, occurred_at: '2026-10-27T09:12:00Z' }
}
const bouncePage = (items: BounceRecord[], mailbox_id = MAILBOX) =>
  ({ context_id: ctx.contextId, authorization_version: ctx.authorizationVersion, mailbox_id, items, next_cursor: null })

describe('HTTP delivery reports adapter', () => {
  it('reads bounces on the proposed route with the filter in the query string', async () => {
    const fetchImpl = jsonFetch(bouncePage([bounce(1, 'User unknown')]))
    const page = await createHttpDeliveryReportsGateway(fetchImpl).listBounces(ctx, MAILBOX, { type: 'hard', limit: 10 }, new AbortController().signal)
    expect(page.items).toHaveLength(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`/v2/mailboxes/${MAILBOX}/bounces?type=hard&limit=10`)
    expect(headersOf(fetchImpl).get('X-Authorization-Version')).toBe(ctx.authorizationVersion)
  })

  // Regression (P20-1): fifty maximum-length multi-byte reasons fit the derived budget.
  it('accepts a maximum-size bounce page', async () => {
    const items = Array.from({ length: DELIVERY_REPORTS_MAX_PAGE }, (_, n) => bounce(n, '€'.repeat(2048)))
    const page = await createHttpDeliveryReportsGateway(jsonFetch(bouncePage(items))).listBounces(ctx, MAILBOX, {}, new AbortController().signal)
    expect(page.items).toHaveLength(DELIVERY_REPORTS_MAX_PAGE)
  })

  it('rejects a page echoing another mailbox', async () => {
    const read = createHttpDeliveryReportsGateway(jsonFetch(bouncePage([], uuid(9)))).listBounces(ctx, MAILBOX, {}, new AbortController().signal)
    await expect(read).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it('rejects an out-of-range limit before sending', async () => {
    const fetchImpl = jsonFetch({})
    const read = createHttpDeliveryReportsGateway(fetchImpl).listSuppressions(ctx, ORG, { limit: DELIVERY_REPORTS_MAX_PAGE + 1 }, new AbortController().signal)
    await expect(read).rejects.toMatchObject({ code: 'malformed' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('simulated delivery reports adapter', () => {
  // Regression (P20-3): limit and cursor page through every record once, in order.
  it('pages through suppressions without omissions or duplicates', async () => {
    const gateway = createSimulatedDeliveryReportsGateway()
    const signal = new AbortController().signal
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await gateway.listSuppressions(ctx, ORG, { limit: 1, ...(cursor === undefined ? {} : { cursor }) }, signal)
      expect(page.items.length).toBeLessThanOrEqual(1)
      seen.push(...page.items.map((item) => item.id))
      cursor = page.next_cursor ?? undefined
    } while (cursor !== undefined)
    const all = await gateway.listSuppressions(ctx, ORG, {}, signal)
    expect(seen).toEqual(all.items.map((item) => item.id))
    expect(all.next_cursor).toBeNull()
  })

  it('rejects a cursor it did not issue', async () => {
    const read = createSimulatedDeliveryReportsGateway().listBounces(ctx, MAILBOX, { cursor: 'forged' }, new AbortController().signal)
    await expect(read).rejects.toMatchObject({ kind: 'api', code: 'request_invalid' })
  })
})
