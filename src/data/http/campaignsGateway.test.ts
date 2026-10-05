import { describe, expect, it, vi } from 'vitest'
import { createCampaignsGateway } from './campaignsGateway'
import { createHttpClient } from './httpClient'

// AIDEV-NOTE: Invalid content must not cross HTTP; draft responses reuse the ledger contract.
describe('campaign gateway', () => {
  it('accepts explicit live mode but rejects untyped provider flags', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ items: [], next: null, simulated: false }))
      .mockResolvedValueOnce(Response.json({ items: [], next: null, simulated: 'false' }))
    const api = createCampaignsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    expect((await api.list()).simulated).toBe(false)
    await expect(api.list()).rejects.toThrow()
  })
  it('prepares normalized recipient content without invoking approval', async () => {
    const result = { id: 'request', revision: 'a'.repeat(64), status: 'draft', simulated: true }
    const transport = vi.fn<typeof fetch>(async () => Response.json(result))
    const api = createCampaignsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    expect(await api.prepare('welcome', { mailboxId: 'mail', recipient: 'CLIENT@example.com', subject: ' Hello ', body: 'Welcome' })).toEqual(result)
    expect(transport).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls[0]?.[0]).toBe('/v1/campaigns/welcome/drafts')
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body)).recipient).toBe('client@example.com')
  })
  it('rejects invalid identifiers and empty draft content before transport', () => {
    const transport = vi.fn<typeof fetch>()
    const api = createCampaignsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    expect(() => api.create('../private')).toThrow()
    expect(() => api.prepare('welcome', { mailboxId: 'mail', recipient: 'client@example.com', subject: '', body: '' })).toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('normalizes offset schedules and rejects timestamps without a timezone', async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ id: 'request', revision: 'a'.repeat(64), status: 'draft', simulated: true }))
    const api = createCampaignsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    const content = { mailboxId: 'mail', recipient: 'client@example.com', subject: 'Hello', body: 'Welcome' }
    await api.prepare('welcome', { ...content, scheduledAt: '2030-01-01T12:00:00+10:00' })
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body)).scheduledAt).toBe('2030-01-01T02:00:00.000Z')
    expect(() => api.prepare('welcome', { ...content, scheduledAt: '2030-01-01T12:00:00' })).toThrow()
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed inventory responses', async () => {
    const api = createCampaignsGateway(createHttpClient({ baseUrl: '', fetch: async () => Response.json({ items: [], next: null }) }))
    await expect(api.list()).rejects.toThrow()
  })
})
