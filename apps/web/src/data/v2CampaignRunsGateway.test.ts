import { describe, expect, it, vi } from 'vitest'
import { createV2OutreachGateway } from './v2OutreachGateway'

const id = '00000000-0000-4000-8000-000000000001'
const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const input = { operation_id: id, expected_campaign_version: 1, mailbox_id: id, subject: 'Newsletter', body_text: 'Opted-in mail', lead_ids: [id], marketing_confirmed: true as const }
const run = { id, campaign_id: id, mailbox_id: id, operation_id: id, subject: input.subject, body_text: input.body_text, state: 'queued', simulated: true,
  created_at: '2026-10-20T00:00:00Z', recipients: [{ lead_id: id, email: 'lead@example.test', draft_id: id, send_id: id, state: 'queued', delivery_state: null }] }
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
describe('marketing run HTTP boundaries', () => {
  it('posts an exact confirmed operation with session and CSRF headers', async () => {
    const fetcher = vi.fn(async (path: string, options: RequestInit) => { void path; void options; return response(run) })
    await createV2OutreachGateway(fetcher).createCampaignRun(context, { csrfToken: 'proof' }, id, input, new AbortController().signal)
    expect(fetcher.mock.calls[0]?.[0]).toBe(`/v2/outreach/campaigns/${id}/runs`)
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', headers: expect.objectContaining({ 'X-CSRF-Token': 'proof', 'X-Session-Context': context.contextId }) })
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1].body))).toEqual(input)
  })
  it('rejects duplicate leads before making any request', () => {
    const fetcher = vi.fn(async () => response(run))
    expect(() => createV2OutreachGateway(fetcher).createCampaignRun(context, { csrfToken: 'proof' }, id, { ...input, lead_ids: [id, id] }, new AbortController().signal)).toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rejects unrecognized recipient statuses', async () => {
    const fetcher = vi.fn(async () => response({ items: [{ ...run, recipients: [{ ...run.recipients[0], state: 'delivered' }] }], next_cursor: null }))
    await expect(createV2OutreachGateway(fetcher).listCampaignRuns(context, id, {}, new AbortController().signal)).rejects.toMatchObject({ code: 'malformed' })
  })
  it('reads scoped run detail and submits repeatable cancellation', async () => {
    const fetcher = vi.fn(async (path: string, options: RequestInit) => { void path; return response({ ...run, state: options.method === 'POST' ? 'cancelled' : 'queued' }) })
    const gateway = createV2OutreachGateway(fetcher), signal = new AbortController().signal
    await gateway.getCampaignRun(context, id, id, signal)
    await gateway.cancelCampaignRun(context, { csrfToken: 'proof' }, id, id, { operation_id: id }, signal)
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([`/v2/outreach/campaigns/${id}/runs/${id}`, `/v2/outreach/campaigns/${id}/runs/${id}/cancel`])
  })
})
