import { expect, it, vi } from 'vitest'
import { createSequencesGateway } from './sequencesGateway'
import { createHttpClient } from './httpClient'

const sequence = { id: 'seq', mailboxId: 'mail', recipient: 'client@example.com', steps: [{ id: 'send', revision: 'a'.repeat(64), status: 'draft', scheduledAt: 1 }] }
const input = { mailboxId: 'mail', recipient: 'CLIENT@example.com', steps: [{ subject: ' Hello ', body: 'Message', scheduledAt: '2030-01-01T12:00:00+10:00' }] }
// AIDEV-NOTE: Creation never invokes approval; response capability flags must remain fail-closed.
it('normalizes content and preserves the caller retry key without approving', async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json({ sequence, liveActivationAvailable: false }))
  const api = createSequencesGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect((await api.create('campaign', input, 'retry')).sequence).toEqual(sequence)
  expect(transport).toHaveBeenCalledOnce()
  expect(transport.mock.calls[0]?.[0]).toBe('/v1/campaigns/campaign/sequences')
  expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({ ...input, recipient: 'client@example.com', idempotencyKey: 'retry', steps: [{ ...input.steps[0], subject: 'Hello', scheduledAt: '2030-01-01T02:00:00.000Z' }] })
})
it('validates list and cancellation contracts', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [sequence], next: 'next', liveActivationAvailable: false }))
    .mockResolvedValueOnce(Response.json({ sequence, liveActivationAvailable: false }))
  const api = createSequencesGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect((await api.list('campaign', 'old')).next).toBe('next')
  await api.cancel('campaign', 'seq')
  expect(transport.mock.calls[0]?.[0]).toBe('/v1/campaigns/campaign/sequences?limit=25&after=old')
  expect(transport.mock.calls[1]?.[0]).toBe('/v1/campaigns/campaign/sequences/seq/cancel')
})
it('rejects empty, excessive, unordered and unsafe inputs without transport', () => {
  const transport = vi.fn<typeof fetch>(), api = createSequencesGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  for (const steps of [[], Array.from({ length: 4 }, () => input.steps[0]), [input.steps[0], input.steps[0]]]) expect(() => api.create('campaign', { ...input, steps }, 'key')).toThrow()
  expect(() => api.list('../foreign')).toThrow()
  expect(() => api.create('campaign', { ...input, steps: [{ ...input.steps[0], subject: 'a\r\nb' }] }, 'key')).toThrow()
  expect(() => api.create('campaign', { ...input, steps: [{ ...input.steps[0], body: '€'.repeat(50000) }] }, 'key')).toThrow(/128 KiB/)
  expect(transport).not.toHaveBeenCalled()
})
it('rejects unrecognized activation and malformed response steps', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [], next: null, liveActivationAvailable: 'true' }))
    .mockResolvedValueOnce(Response.json({ sequence: { ...sequence, steps: [] }, liveActivationAvailable: false }))
  const api = createSequencesGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  await expect(api.list('campaign')).rejects.toThrow()
  await expect(api.cancel('campaign', 'seq')).rejects.toThrow()
})
it('accepts an explicitly configured activation capability without sending', async () => {
  const transport = vi.fn<typeof fetch>(async () => Response.json({ items: [], next: null, liveActivationAvailable: true }))
  const api = createSequencesGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect((await api.list('campaign')).liveActivationAvailable).toBe(true)
  expect(transport).toHaveBeenCalledOnce()
})
