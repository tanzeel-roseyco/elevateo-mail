import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { currentUserResponse } from './contract'
import { createHttpClient } from './httpClient'

const identity = (id: string) => ({ accountId: id.repeat(32), session: { expiresAt: 1_800_000_000_000 } })
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const ok = z.object({ ok: z.literal(true) })

// AIDEV-NOTE: Identity binding is transport state, never a credential or a replacement for server authorization.
describe('account-bound HTTP requests', () => {
  it('binds mutations, retains protection after 401, and rebinds only through /me', async () => {
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(identity('a')))
      .mockResolvedValueOnce(json({ error: { code: 'unauthorized', requestId: 'test' } }, 401))
      .mockResolvedValueOnce(json({ ok: true }))
      .mockResolvedValueOnce(json(identity('b')))
      .mockResolvedValueOnce(json({ ok: true }))
    const client = createHttpClient({ baseUrl: '', fetch: transport })
    await client.request('GET', '/v1/me', currentUserResponse)
    await expect(client.request('POST', '/v1/action', ok, {})).rejects.toMatchObject({ kind: 'unauthorized' })
    await client.request('GET', '/v1/data', ok)
    await client.request('GET', '/v1/me', currentUserResponse)
    await client.request('GET', '/v1/data', ok)
    const headers = (index: number) => new Headers(transport.mock.calls[index]![1]?.headers)
    expect(headers(1).get('x-elevateo-account')).toBe('a'.repeat(32))
    expect(headers(2).get('x-elevateo-account')).toBe('a'.repeat(32))
    expect(headers(3).has('x-elevateo-account')).toBe(false)
    expect(headers(4).get('x-elevateo-account')).toBe('b'.repeat(32))
  })

  it('rejects old account responses that arrive after a successful identity refresh', async () => {
    let finish!: (response: Response) => void
    const transport = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(json(identity('a')))
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce(json(identity('b')))
    const client = createHttpClient({ baseUrl: '', fetch: transport })
    await client.request('GET', '/v1/me', currentUserResponse)
    const pending = client.request('GET', '/v1/data', ok)
    await client.request('GET', '/v1/me', currentUserResponse)
    finish(json({ ok: true }))
    await expect(pending).rejects.toMatchObject({ kind: 'unauthorized' })
  })

  it('rejects a superseded identity refresh without reverting the newest binding', async () => {
    let finish!: (response: Response) => void
    const transport = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
      .mockResolvedValueOnce(json(identity('b')))
      .mockResolvedValueOnce(json({ ok: true }))
    const client = createHttpClient({ baseUrl: '', fetch: transport })
    const earlier = client.request('GET', '/v1/me', currentUserResponse)
    await client.request('GET', '/v1/me', currentUserResponse)
    finish(json(identity('a')))
    await expect(earlier).rejects.toMatchObject({ kind: 'unauthorized' })
    await client.request('GET', '/v1/data', ok)
    expect(new Headers(transport.mock.calls[2]![1]?.headers).get('x-elevateo-account')).toBe('b'.repeat(32))
  })
})
