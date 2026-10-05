import { expect, it, vi } from 'vitest'
import { createHttpClient } from './httpClient'
import { createHunterGateway } from './hunterGateway'

it('normalizes explicit lookup requests and accepts an absent profile', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ profile: null, source: 'hunter' })))
  const gateway = createHunterGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect(await gateway.enrich(' Person@Example.com ')).toEqual({ profile: null, source: 'hunter' })
  expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({ email: 'person@example.com', acknowledgeCreditUse: true })
})
it('rejects invalid inputs before transport and never accepts extra provider fields', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ connection: { revision: 1, revoked: 0, apiKey: 'secret' } })))
  const gateway = createHunterGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect(() => gateway.enrich('bad')).toThrow(); expect(() => gateway.save(' ', null)).toThrow()
  expect(() => gateway.revoke(-1)).toThrow(); expect(transport).not.toHaveBeenCalled()
  await expect(gateway.connection()).rejects.toThrow()
})
