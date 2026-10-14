import { describe, expect, it, vi } from 'vitest'
import { createV2OutreachGateway } from './v2OutreachGateway'
import type { OutreachGateway } from '@/features/outreach/contract'

const id = '00000000-0000-4000-8000-000000000001'
const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

describe('isolated V2 outreach gateway', () => {
  it('reads only bounded tenant campaign metadata', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => response({ items: [{ id, name: 'Pilot', status: 'draft', version: 1 }], next_cursor: null }))
    const gateway: OutreachGateway = createV2OutreachGateway(fetchImpl)
    const page = await gateway.listCampaigns(context, { limit: 10 }, new AbortController().signal)
    expect(page.items[0]?.id).toBe(id)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('/v2/outreach/campaigns?limit=10')
  })

  it('rejects a server lifecycle outside the inert status set', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => response({ items: [{ id, name: 'Pilot', status: 'sending', version: 1 }], next_cursor: null }))
    await expect(createV2OutreachGateway(fetchImpl).listCampaigns(context, {}, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it('keeps accounts unavailable without dispatch', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => response({ items: [], next_cursor: null }))
    const gateway: OutreachGateway = createV2OutreachGateway(fetchImpl)
    await expect(gateway.listAccounts(context, id, {}, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'api', code: 'temporarily_unavailable' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
