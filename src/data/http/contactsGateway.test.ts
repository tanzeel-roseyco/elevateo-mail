import { describe, expect, it, vi } from 'vitest'
import { createContactsGateway } from './contactsGateway'
import { createHttpClient } from './httpClient'

// AIDEV-NOTE: Exercise boundary validation through the real transport, including no-request invalid imports.
describe('contacts gateway', () => {
  it('loads a bounded page with an encoded cursor and preserves suppression', async () => {
    const response = { items: [{ email: 'a@example.com', consent_source: 'Signup', opted_in: 1, suppression: 'withdrawal' }], next: null }
    const transport = vi.fn<typeof fetch>(async () => Response.json(response))
    const api = createContactsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    expect(await api.list('a+tag@example.com')).toEqual(response)
    expect(transport.mock.calls[0]?.[0]).toBe('/v1/contacts?limit=25&after=a%2Btag%40example.com')
  })
  it('normalizes addresses and sends explicit evidence and consent', async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ processed: 1 }))
    const api = createContactsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    await api.import([{ email: ' A@example.com ', consentSource: ' Form 2026-10-06 ', optedIn: true }])
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual([{ email: 'a@example.com', consentSource: 'Form 2026-10-06', optedIn: true }])
  })
  it('rejects duplicates, missing evidence and oversized imports before transport', () => {
    const transport = vi.fn<typeof fetch>()
    const api = createContactsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    const row = { email: 'a@example.com', consentSource: 'Signup', optedIn: true }
    expect(() => api.import([row, { ...row, email: 'A@example.com' }])).toThrow()
    expect(() => api.import([{ ...row, consentSource: '' }])).toThrow()
    expect(() => api.import(Array.from({ length: 501 }, () => row))).toThrow()
    expect(transport).not.toHaveBeenCalled()
  })
  it('rejects malformed server contact data', async () => {
    const api = createContactsGateway(createHttpClient({ baseUrl: '', fetch: async () => Response.json({ items: [{ email: 'bad' }], next: null }) }))
    await expect(api.list()).rejects.toThrow('does not understand')
  })
})
