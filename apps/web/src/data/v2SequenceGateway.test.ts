import { describe, expect, it, vi } from 'vitest'
import { createV2OutreachGateway } from './v2OutreachGateway'
import type { Sequence, SequencePut } from '@/features/outreach/sequenceContract'

const campaign = '00000000-0000-4000-8000-000000000001'
const step = '00000000-0000-4000-8000-000000000002'
const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const draft: Sequence = { id: campaign, campaign_id: campaign, version: 1, status: 'draft', timezone: 'UTC',
  steps: [{ id: step, position: 1, delay_seconds: 0, local_time: '09:00:00', label: 'First' }] }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

describe('V2 inert sequence draft gateway', () => {
  it('reads then saves a campaign-bound draft with current context and CSRF proof', async () => {
    const fetchImpl = vi.fn(async (_path: string, _init: RequestInit) => json(draft))
    const gateway = createV2OutreachGateway(fetchImpl)
    const signal = new AbortController().signal
    expect((await gateway.getOutreachSequenceDraft(context, campaign, signal)).steps).toHaveLength(1)
    const input: SequencePut = { id: draft.id, campaign_id: draft.campaign_id, status: draft.status,
      timezone: draft.timezone, steps: draft.steps, operation_id: step, expected_version: 1 }
    expect((await gateway.saveOutreachSequenceDraft(context, { csrfToken: 'proof' }, campaign, input, signal)).version).toBe(1)
    expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual([
      `/v2/outreach/campaigns/${campaign}/sequence`, `/v2/outreach/campaigns/${campaign}/sequence`,
    ])
    expect(new Headers(fetchImpl.mock.calls[1]?.[1].headers).get('X-CSRF-Token')).toBe('proof')
  })

  it('rejects another campaign before dispatch', () => {
    const fetchImpl = vi.fn(async () => json(draft))
    const input: SequencePut = { id: draft.id, campaign_id: draft.campaign_id, status: draft.status,
      timezone: draft.timezone, steps: draft.steps, operation_id: step, expected_version: 1 }
    expect(() => createV2OutreachGateway(fetchImpl).saveOutreachSequenceDraft(context, { csrfToken: 'proof' }, step, input,
      new AbortController().signal)).toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('keeps absent and inaccessible drafts as the same API error', async () => {
    const fetchImpl = vi.fn(async () => json({ code: 'not_available', message: 'This item is unavailable.', request_id: 'req-1' }, 404))
    await expect(createV2OutreachGateway(fetchImpl).getOutreachSequenceDraft(context, campaign, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'api', code: 'not_available' })
  })
})
