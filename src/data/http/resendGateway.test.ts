import { expect, it, vi } from 'vitest'
import { createHttpClient } from './httpClient'
import { createResendGateway } from './resendGateway'

it('uses strict bounded metadata and rejects secret leakage', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ connections: [{ id: 'key', revision: 1, revoked: 0 }] }))
    .mockResolvedValueOnce(Response.json({ connections: [{ id: 'key', revision: 1, revoked: 0, apiKey: 'secret' }] }))
    .mockResolvedValueOnce(Response.json({ connections: Array.from({ length: 11 }, () => ({ id: 'key', revision: 1, revoked: 0 })) }))
  const gateway = createResendGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect((await gateway.list()).connections).toHaveLength(1)
  await expect(gateway.list()).rejects.toThrow()
  await expect(gateway.list()).rejects.toThrow()
})
it('sends revision-bound mutations and validates keys/identifiers before transport', async () => {
  const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ id: 'key', revision: 2, revoked: 0 }))
  const gateway = createResendGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  await gateway.replace('key', 1, 'synthetic-key')
  expect(transport.mock.calls[0]?.[0]).toBe('/v1/resend/connections/key/replace')
  expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({ revision: 1, apiKey: 'synthetic-key' })
  expect(() => gateway.create('has space')).toThrow()
  expect(() => gateway.create('x'.repeat(8193))).toThrow()
  expect(() => gateway.revoke('../other', 1)).toThrow()
  expect(() => gateway.revoke('key', 0)).toThrow()
  expect(transport).toHaveBeenCalledOnce()
})
