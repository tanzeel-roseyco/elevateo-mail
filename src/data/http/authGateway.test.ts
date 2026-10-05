import { expect, it, vi } from 'vitest'
import { createAuthGateway } from './authGateway'
import { createHttpClient } from './httpClient'
it('checks availability and starts login without requesting browser credentials', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ enabled: true }))
    .mockResolvedValueOnce(Response.json({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=opaque', expiresAt: 12345 }))
  const api = createAuthGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect(await api.status()).toEqual({ enabled: true })
  await api.begin()
  expect(transport.mock.calls[0]?.[0]).toBe('/v1/login/status')
  expect(transport.mock.calls[1]?.[0]).toBe('/v1/login/begin')
  expect(transport.mock.calls[1]?.[1]).toMatchObject({ method: 'POST', body: '{}' })
})
it('rejects redirected origins, credentials, wrong paths and exposed secrets', async () => {
  for (const authorizationUrl of ['https://evil.example/o/oauth2/v2/auth', 'https://user:pass@accounts.google.com/o/oauth2/v2/auth',
    'https://accounts.google.com/other', 'https://accounts.google.com/o/oauth2/v2/auth#token']) {
    const api = createAuthGateway(createHttpClient({ baseUrl: '', fetch: async () => Response.json({ authorizationUrl, expiresAt: 123 }) }))
    await expect(api.begin()).rejects.toThrow()
  }
  const api = createAuthGateway(createHttpClient({ baseUrl: '', fetch: async () => Response.json({ enabled: false, token: 'secret' }) }))
  await expect(api.status()).rejects.toThrow()
})
