// FE-805 bridge: every campaign/lead/analytics call reaches Cassian's adapter unchanged, and the
// campaign-scoped account calls drop only the campaign id (the adapter still refuses them inertly).
import { describe, expect, it, vi } from 'vitest'
import { createV2OutreachGateway } from '@/data/v2OutreachGateway'
import { bridgeOutreachGateway } from './outreachGatewayBridge'

const campaignId = '00000000-0000-4000-8000-000000000001'
const leadId = '00000000-0000-4000-8000-000000000002'
const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const proof = { csrfToken: 'c'.repeat(16) }
const signal = new AbortController().signal
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

describe('outreach gateway bridge', () => {
  it('forwards a campaign list read to the V2 adapter and returns its validated page (happy path)', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => response({ items: [{ id: campaignId, name: 'Pilot', status: 'draft', version: 1 }], next_cursor: null }))
    const page = await bridgeOutreachGateway(createV2OutreachGateway(fetchImpl)).listCampaigns(context, { limit: 5 }, signal)
    expect(page).toMatchObject({ items: [{ id: campaignId, name: 'Pilot' }] })
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/v2/outreach/campaigns?limit=5')
  })

  it('keeps campaign-scoped account reads inert: no dispatch, explicit temporarily_unavailable', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => response({ items: [], next_cursor: null }))
    const gateway = bridgeOutreachGateway(createV2OutreachGateway(fetchImpl))
    await expect(gateway.listAccounts(context, campaignId, {}, signal)).rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable' })
    await expect(gateway.getAccount(context, campaignId, leadId, signal)).rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a malformed lead write before any network call', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => response({}))
    const gateway = bridgeOutreachGateway(createV2OutreachGateway(fetchImpl))
    // The adapter validates synchronously, so wrap the call: a throw or a rejection both count.
    await expect(async () => gateway.addLead(context, proof, campaignId, { id: leadId, operation_id: leadId, email: 'not-an-email' }, signal)).rejects.toBeTruthy()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
