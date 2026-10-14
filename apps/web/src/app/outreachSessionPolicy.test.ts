// FE-805 central policy for Outreach operations: every failure reaches handleError with the
// generation captured at call time (not at bind time), consumed and ordinary errors are both
// rethrown so the page keeps its own rendering, and optional capabilities are preserved verbatim.
import { describe, expect, it, vi } from 'vitest'
import { GatewayError } from '@/data/errors'
import type { OutreachGateway } from '@/features/outreach/contract'
import { policeOutreachGateway, type SessionPolicy } from './outreachSessionPolicy'

const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const proof = { csrfToken: 'c'.repeat(16) }
const signal = new AbortController().signal
const id = '00000000-0000-4000-8000-000000000001'
const unauthenticated = () => new GatewayError('api', 'unauthenticated', 'synthetic', { status: 401, requestId: 'r1' })

function rawGateway(overrides: Partial<OutreachGateway> = {}): OutreachGateway {
  const ok = vi.fn(async () => ({ items: [], next_cursor: null }))
  return {
    listCampaigns: ok, getCampaign: ok, createCampaign: ok, updateCampaign: ok, listLeads: ok,
    addLead: ok, updateLead: ok, listAccounts: ok, getAccount: ok, listAnalytics: ok, ...overrides,
  }
}

function policy(generation = 7, consumed = false): SessionPolicy & { handleError: ReturnType<typeof vi.fn> } {
  return { current: () => generation, handleError: vi.fn(() => consumed) }
}

describe('outreach session policy', () => {
  it('reports a 401 from a write to the central policy with the call-time generation and rethrows (happy path)', async () => {
    const createCampaign = vi.fn(async () => { throw unauthenticated() })
    let generation = 1
    const sessionPolicy: SessionPolicy = { current: () => generation, handleError: vi.fn(() => true) }
    const gateway = policeOutreachGateway(rawGateway({ createCampaign }), sessionPolicy)
    // Rebinding is not needed on epoch change: the generation is read when the call is made.
    generation = 3
    await expect(gateway.createCampaign(context, proof, { id, operation_id: id, name: 'Pilot', status: 'draft' }, signal)).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(sessionPolicy.handleError).toHaveBeenCalledWith(expect.any(GatewayError), 3)
    expect(createCampaign).toHaveBeenCalledTimes(1)
  })

  it('passes an ordinary rejection through unchanged so the page renders its own state', async () => {
    const failure = new GatewayError('api', 'request_invalid', 'synthetic', { status: 422, requestId: 'r2' })
    const sessionPolicy = policy(7, false)
    const gateway = policeOutreachGateway(rawGateway({ updateCampaign: vi.fn(async () => { throw failure }) }), sessionPolicy)
    await expect(gateway.updateCampaign(context, proof, id, { operation_id: id, expected_version: 1, name: 'Pilot', status: 'paused' }, signal)).rejects.toBe(failure)
    expect(sessionPolicy.handleError).toHaveBeenCalledWith(failure, 7)
  })

  it('routes a synchronous adapter throw through the same policy and keeps optional capabilities absent when the adapter lacks them', async () => {
    const sessionPolicy = policy(2, false)
    const boom = new Error('invalid input')
    const gateway = policeOutreachGateway(rawGateway({ addLead: (() => { throw boom }) as unknown as OutreachGateway['addLead'] }), sessionPolicy)
    await expect(gateway.addLead(context, proof, id, { id, operation_id: id, email: 'a@example.test' }, signal)).rejects.toBe(boom)
    expect(sessionPolicy.handleError).toHaveBeenCalledWith(boom, 2)
    expect(gateway.getLead).toBeUndefined()
    expect(gateway.recordConsent).toBeUndefined()
    const withConsent = policeOutreachGateway(rawGateway({ recordConsent: vi.fn(async () => ({})) }), sessionPolicy)
    expect(typeof withConsent.recordConsent).toBe('function')
  })
})
