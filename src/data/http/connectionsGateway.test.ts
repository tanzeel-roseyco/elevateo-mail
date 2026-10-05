import { expect, it, vi } from 'vitest'
import { createConnectionsGateway } from './connectionsGateway'
import { createHttpClient } from './httpClient'

it('requests bounded connection pages and explicitly revokes access', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ items: [], next: null }))
    .mockResolvedValueOnce(Response.json({ revoked: true }))
  const api = createConnectionsGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  await api.list('previous')
  await api.revoke('connection')
  expect(transport.mock.calls[0]?.[0]).toBe('/v1/connections?limit=25&after=previous')
  expect(transport.mock.calls[1]?.[0]).toBe('/v1/connections/connection/revoke')
  expect(transport.mock.calls[1]?.[1]?.method).toBe('POST')
  expect(() => api.revoke('../other')).toThrow()
  expect(transport).toHaveBeenCalledTimes(2)
})
it('rejects credential-bearing and oversized metadata responses', async () => {
  const row = { id: 'connection', provider: 'gmail', subject: 'subject', revision: 1, revoked: false }
  for (const items of [[{ ...row, sealed: 'secret' }], Array.from({ length: 26 }, () => row)]) {
    const api = createConnectionsGateway(createHttpClient({ baseUrl: '', fetch: async () => Response.json({ items, next: null }) }))
    await expect(api.list()).rejects.toThrow()
  }
})
