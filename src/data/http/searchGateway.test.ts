import { expect, it, vi } from 'vitest'
import { createSearchGateway } from './searchGateway'
import { createHttpClient } from './httpClient'

const page = { items: [], next: { before: 123, beforeId: 'last' }, search: { scope: 'subject_sender', scanned: 1000, scanLimit: 1000 } }
const row = { id: 'message', mailbox_id: 'mail', thread_id: 'thread', sender: 'a@example.com', subject: 'Hello', at: 123 }
it('preserves an empty scan continuation and makes exactly one bounded request', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => Response.json(page))
  const api = createSearchGateway(createHttpClient({ baseUrl: '', fetch: fetcher }))
  expect(await api.search('mail', ' hello ', null)).toEqual(page)
  expect(fetcher).toHaveBeenCalledOnce()
  expect(fetcher.mock.calls[0]?.[0]).toBe('/v1/messages/search?mailboxId=mail&q=hello&limit=25')
  await api.search('mail', 'hello', page.next)
  expect(fetcher.mock.calls[1]?.[0]).toContain('&before=123&beforeId=last')
})
it.each([
  { ...page, items: [{ ...row, mailbox_id: 'foreign' }] },
  { ...page, items: Array.from({ length: 26 }, () => row) },
  { ...page, search: { ...page.search, scanned: 1001 } },
  { ...page, next: { before: -1, beforeId: 'last' } },
  { ...page, items: [{ ...row, at: 'yesterday' }] },
])('rejects malformed, excessive, or foreign response data', async response => {
  const api = createSearchGateway(createHttpClient({ baseUrl: '', fetch: async () => Response.json(response) }))
  await expect(api.search('mail', 'hello', null)).rejects.toThrow()
})
it('rejects invalid request boundaries before any transport', async () => {
  const fetcher = vi.fn<typeof fetch>()
  const api = createSearchGateway(createHttpClient({ baseUrl: '', fetch: fetcher }))
  await expect(api.search('../mail', 'hello', null)).rejects.toThrow()
  await expect(api.search('mail', '  ', null)).rejects.toThrow()
  await expect(api.search('mail', 'x'.repeat(101), null)).rejects.toThrow()
  await expect(api.search('mail', 'hello', { before: NaN, beforeId: 'last' })).rejects.toThrow()
  expect(fetcher).not.toHaveBeenCalled()
})
