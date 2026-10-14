import { describe, expect, it, vi } from 'vitest'
import { createV2OutreachGateway } from './v2OutreachGateway'

const id = '00000000-0000-4000-8000-000000000001'
const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

describe('isolated V2 outreach gateway', () => {
  it('reads only bounded tenant campaign metadata', async () => {
    const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
      void input
      void init
      return response({ items: [{ id, name: 'Pilot', status: 'draft', version: 1 }], next_cursor: null })
    })
    const gateway = createV2OutreachGateway(fetchImpl)
    const page = await gateway.listCampaigns(context, { limit: 10 }, new AbortController().signal)
    expect(page.items[0]?.id).toBe(id)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/v2/outreach/campaigns?limit=10')
  })

  it('rejects a server lifecycle outside the inert status set', async () => {
    const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
      void input
      void init
      return response({ items: [{ id, name: 'Pilot', status: 'sending', version: 1 }], next_cursor: null })
    })
    await expect(createV2OutreachGateway(fetchImpl).listCampaigns(context, {}, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it('keeps accounts unavailable without dispatch', async () => {
    const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
      void input
      void init
      return response({ items: [], next_cursor: null })
    })
    const gateway = createV2OutreachGateway(fetchImpl)
    await expect(gateway.listAccounts(context, id, {}, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable' })
    await expect(gateway.getAccount(context, id, id, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('records manual consent and reads back redacted evidence without a send request', async () => {
    const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
      void input
      if (init.method === 'POST') return response({ id, campaign_id: id, email: 'lead@example.test', consent_status: 'granted', suppressed: false, version: 2 })
      return response({ id, campaign_id: id, email: 'lead@example.test', consent_status: 'granted', suppressed: false, version: 2,
        consent_recorded_at: '2026-10-14T12:00:00Z', consent_source: 'Signed intake form', consent_recorded_by: id,
        consent_evidence_kind: 'manual_attestation' })
    })
    const gateway = createV2OutreachGateway(fetchImpl)
    const input = { operation_id: id, expected_version: 1, source: 'Signed intake form', observed_at: '2026-10-14T12:00:00Z', attested: true }
    const recorded = await gateway.recordConsent(context, { csrfToken: 'proof' }, id, id, input, new AbortController().signal)
    const detail = await gateway.getLead(context, id, id, new AbortController().signal)
    expect(recorded.consent_status).toBe('granted')
    expect(detail.consent_evidence_kind).toBe('manual_attestation')
    expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual([
      `/v2/outreach/campaigns/${id}/leads/${id}/consent`, `/v2/outreach/campaigns/${id}/leads/${id}`,
    ])
  })

  it('rejects false consent attestation before dispatch', async () => {
    const fetchImpl = vi.fn(async () => response({}))
    await expect(createV2OutreachGateway(fetchImpl).recordConsent(context, { csrfToken: 'proof' }, id, id,
      { operation_id: id, expected_version: 1, source: 'Signed intake form', observed_at: '2026-10-14T12:00:00Z', attested: false },
      new AbortController().signal)).rejects.toBeDefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects incomplete consent detail from the server', async () => {
    const fetchImpl = vi.fn(async () => response({ id, campaign_id: id, email: 'lead@example.test',
      consent_status: 'granted', suppressed: false, version: 2 }))
    await expect(createV2OutreachGateway(fetchImpl).getLead(context, id, id, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })
})
