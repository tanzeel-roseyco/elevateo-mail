import { describe, expect, it, vi } from 'vitest'
import { createHttpClient } from './httpClient'
import { createHealthGateway, healthResponse } from './healthGateway'

const snapshot = { incompleteMessages: 0, sends: [], simulated: true, liveSending: false, dnsWrites: false, dispatchPaused: true, integrationReady: false }
describe('health boundary', () => {
  it('rejects unknown and duplicated background jobs', () => {
    const job = { name: 'dispatch', status: 'healthy', lastSuccessAt: null }
    expect(healthResponse.safeParse({ ...snapshot, backgroundJobs: [job, job] }).success).toBe(false)
    expect(healthResponse.safeParse({ ...snapshot, backgroundJobs: [{ ...job, status: 'delivered' }] }).success).toBe(false)
  })
  it('reads the authenticated route and strips unknown diagnostic fields', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...snapshot, secret: 'not displayed' })))
    const gateway = createHealthGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    expect(await gateway.read()).toEqual(snapshot)
    expect(transport.mock.calls[0]?.[0]).toBe('/v1/health')
    expect(transport.mock.calls[0]?.[1]?.credentials).toBe('same-origin')
  })
  it('rejects duplicate, negative, unsafe and unknown counts', () => {
    for (const sends of [[{ status: 'draft', count: -1 }], [{ status: 'draft', count: Number.MAX_SAFE_INTEGER + 1 }],
      [{ status: 'delivered', count: 1 }], [{ status: 'draft', count: 1 }, { status: 'draft', count: 2 }]]) {
      expect(healthResponse.safeParse({ ...snapshot, sends }).success).toBe(false)
    }
  })
})
