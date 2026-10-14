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
  it('passes a successful operation through untouched and never consults the policy (happy path)', async () => {
    const page = { items: [], next_cursor: null }
    const listCampaigns = vi.fn(async () => page)
    const sessionPolicy = policy(5)
    const gateway = policeOutreachGateway(rawGateway({ listCampaigns }), sessionPolicy)
    await expect(gateway.listCampaigns(context, {}, signal)).resolves.toBe(page)
    expect(listCampaigns).toHaveBeenCalledWith(context, {}, signal)
    expect(sessionPolicy.handleError).not.toHaveBeenCalled()
  })

  it('still rethrows a stale 401 that the policy consumed, so the caller cannot mistake it for success', async () => {
    // The policy answers true for a stale generation (session.tsx); the wrapper must not swallow it
    // into a resolved promise, because the awaiting page would then commit a non-existent result.
    const sessionPolicy = policy(9, true)
    const gateway = policeOutreachGateway(rawGateway({ listLeads: vi.fn(async () => { throw unauthenticated() }) }), sessionPolicy)
    await expect(gateway.listLeads(context, id, {}, signal)).rejects.toMatchObject({ code: 'unauthenticated' })
    expect(sessionPolicy.handleError).toHaveBeenCalledWith(expect.any(GatewayError), 9)
  })

  it('reports a current context change with its own generation and rethrows after the policy consumed it', async () => {
    const changed = new GatewayError('api', 'context_changed', 'synthetic', { status: 409, requestId: 'r3' })
    const sessionPolicy = policy(4, true)
    const gateway = policeOutreachGateway(rawGateway({ getCampaign: vi.fn(async () => { throw changed }) }), sessionPolicy)
    await expect(gateway.getCampaign(context, id, signal)).rejects.toBe(changed)
    expect(sessionPolicy.handleError).toHaveBeenCalledTimes(1)
    expect(sessionPolicy.handleError).toHaveBeenCalledWith(changed, 4)
  })

  it('reports a 401 from a write to the central policy with the call-time generation and rethrows', async () => {
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

  describe('sequence draft capability (FE864)', () => {
    const draftInput = { id, campaign_id: id, operation_id: id, expected_version: null, status: 'draft' as const, timezone: 'UTC', steps: [{ id, position: 1, delay_seconds: 0, local_time: '09:00:00', label: 'Step 1' }] }

    it('keeps both draft methods absent when the adapter lacks them, so SequencePage renders unavailable instead of calling a fallback', () => {
      const gateway = policeOutreachGateway(rawGateway(), policy(1))
      expect(gateway.getOutreachSequenceDraft).toBeUndefined()
      expect(gateway.saveOutreachSequenceDraft).toBeUndefined()
      expect('getOutreachSequenceDraft' in gateway).toBe(false)
    })

    it('forwards a draft read and write verbatim to the adapter and resolves with the adapter result untouched', async () => {
      const draft = { id, campaign_id: id, version: 1 }
      const getOutreachSequenceDraft = vi.fn(async () => draft)
      const saveOutreachSequenceDraft = vi.fn(async () => ({ ...draft, version: 2 }))
      const sessionPolicy = policy(3)
      const gateway = policeOutreachGateway(rawGateway({ getOutreachSequenceDraft, saveOutreachSequenceDraft }), sessionPolicy)
      await expect(gateway.getOutreachSequenceDraft!(context, id, signal)).resolves.toBe(draft)
      expect(getOutreachSequenceDraft).toHaveBeenCalledWith(context, id, signal)
      await expect(gateway.saveOutreachSequenceDraft!(context, proof, id, draftInput, signal)).resolves.toMatchObject({ version: 2 })
      expect(saveOutreachSequenceDraft).toHaveBeenCalledWith(context, proof, id, draftInput, signal)
      expect(sessionPolicy.handleError).not.toHaveBeenCalled()
    })

    it('reads the session generation on every draft invocation, not once at bind time', async () => {
      let generation = 1
      const sessionPolicy: SessionPolicy = { current: () => generation, handleError: vi.fn(() => true) }
      const gateway = policeOutreachGateway(rawGateway({
        getOutreachSequenceDraft: vi.fn(async () => { throw unauthenticated() }),
        saveOutreachSequenceDraft: vi.fn(async () => { throw unauthenticated() }),
      }), sessionPolicy)
      generation = 5
      await expect(gateway.getOutreachSequenceDraft!(context, id, signal)).rejects.toMatchObject({ code: 'unauthenticated' })
      expect(sessionPolicy.handleError).toHaveBeenLastCalledWith(expect.any(GatewayError), 5)
      generation = 8
      await expect(gateway.saveOutreachSequenceDraft!(context, proof, id, draftInput, signal)).rejects.toMatchObject({ code: 'unauthenticated' })
      expect(sessionPolicy.handleError).toHaveBeenLastCalledWith(expect.any(GatewayError), 8)
      expect(sessionPolicy.handleError).toHaveBeenCalledTimes(2)
    })

    it('fails safe on an unauthorized draft write: the consumed 401 still rejects, so the page never commits a fake receipt', async () => {
      const denied = unauthenticated()
      const saveOutreachSequenceDraft = vi.fn(async () => { throw denied })
      const sessionPolicy = policy(6, true)
      const gateway = policeOutreachGateway(rawGateway({ saveOutreachSequenceDraft }), sessionPolicy)
      await expect(gateway.saveOutreachSequenceDraft!(context, proof, id, draftInput, signal)).rejects.toBe(denied)
      expect(sessionPolicy.handleError).toHaveBeenCalledWith(denied, 6)
      expect(saveOutreachSequenceDraft).toHaveBeenCalledTimes(1)
    })
  })
})
