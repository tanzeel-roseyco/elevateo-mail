import { describe, expect, it, vi } from 'vitest'
import { createImportGateway, parseHistoricalImport } from './importGateway'
import { createHttpClient } from './httpClient'

const message = { id: 'old-1', threadId: 'thread-1', sender: 'a@example.com', subject: 'History', body: 'Text', at: 1000 }
// AIDEV-NOTE: Validate files before transport, including byte limits and dates the inbox can render.
describe('historical import gateway', () => {
  it('posts validated messages to the selected mailbox', async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json({ processed: 1, imported: 1, unchanged: 0 }))
    const api = createImportGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    expect(await api.import('mail', { messages: [message] })).toEqual({ processed: 1, imported: 1, unchanged: 0 })
    expect(transport.mock.calls[0]?.[0]).toBe('/v1/mailboxes/mail/import')
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({ messages: [message] })
  })
  it('rejects malformed, duplicate, excessive and unrenderable messages before HTTP', () => {
    const transport = vi.fn<typeof fetch>()
    const api = createImportGateway(createHttpClient({ baseUrl: '', fetch: transport }))
    for (const messages of [[], [message, message], [{ ...message, at: 8_640_000_000_000_001 }],
      Array.from({ length: 26 }, (_, i) => ({ ...message, id: String(i) }))]) {
      expect(() => api.import('mail', { messages })).toThrow()
    }
    expect(() => parseHistoricalImport('{')).toThrow()
    expect(() => parseHistoricalImport(JSON.stringify({ messages: [{ ...message, body: '£'.repeat(70_000) }] }))).toThrow('128 KiB')
    expect(transport).not.toHaveBeenCalled()
  })
  it('rejects malformed server results', async () => {
    const api = createImportGateway(createHttpClient({ baseUrl: '', fetch: async () => Response.json({ imported: 99 }) }))
    await expect(api.import('mail', { messages: [message] })).rejects.toThrow('does not understand')
  })
})
