import { describe, expect, it, vi } from 'vitest'
import { createV2PreferencesGateway } from './v2PreferencesGateway'

const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })

describe('isolated personal preference gateway proposal', () => {
  it('reads current actor context and updates only the display name at its revision', async () => {
    const fetchImpl = vi.fn(async (_path: string, init: RequestInit) => {
      if (init.method === 'PUT') return response({ display_name: 'Avery', revision: 2 })
      return response({ context_id: context.contextId, authorization_version: context.authorizationVersion,
        display_name: 'Avery', revision: 1 })
    })
    const gateway = createV2PreferencesGateway(fetchImpl)
    const page = await gateway.getUserDisplayPreference(context, new AbortController().signal)
    const saved = await gateway.updateUserDisplayPreference(context, { csrfToken: 'proof' },
      { display_name: 'Avery', expected_revision: page.revision }, new AbortController().signal)
    expect(saved.revision).toBe(2)
    expect(fetchImpl.mock.calls.map(([path]) => path)).toEqual(['/v2/me/preferences', '/v2/me/preferences'])
  })

  it('rejects an invalid target field before any request', async () => {
    const fetchImpl = vi.fn(async () => response({}))
    await expect(createV2PreferencesGateway(fetchImpl).updateUserDisplayPreference(context, { csrfToken: 'proof' },
      { display_name: 'Avery', expected_revision: 0, user_id: 'forged' }, new AbortController().signal))
      .rejects.toBeDefined()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a response without current actor context', async () => {
    const fetchImpl = vi.fn(async () => response({ display_name: 'Avery', revision: 1 }))
    await expect(createV2PreferencesGateway(fetchImpl).getUserDisplayPreference(context, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it('rejects a stale server context instead of showing another preference', async () => {
    const fetchImpl = vi.fn(async () => response({ context_id: 'c'.repeat(16),
      authorization_version: context.authorizationVersion, display_name: 'Avery', revision: 1 }))
    await expect(createV2PreferencesGateway(fetchImpl).getUserDisplayPreference(context, new AbortController().signal))
      .rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })
})
