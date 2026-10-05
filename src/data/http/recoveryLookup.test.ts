import { describe, expect, it, vi } from 'vitest'
import { createHttpClient } from './httpClient'
import { createHttpGateway } from './httpGateway'

// AIDEV-NOTE: Recovery must distinguish explicit absence from malformed or unrelated server answers.
const row = { id: 'i1', mailbox_id: 'mb', idempotency_key: 'key-1', revision: 'b'.repeat(64), status: 'draft', created_at: 1_800_000_000_000, updated_at: 1_800_000_000_000, scheduled_at: 1_800_000_000_000, successor_id: null }
function fixture(body: unknown) {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }))
  return { fetch, gateway: createHttpGateway(createHttpClient({ baseUrl: '', fetch })) }
}

describe('exact recovery lookup', () => {
  it('accepts live recovery responses and rejects non-boolean simulation flags', async () => {
    expect(await fixture({ intent: row, simulated: false }).gateway.lookupSendRequest('key-1')).toMatchObject({ id: 'i1' })
    await expect(fixture({ intent: row, simulated: 'false' }).gateway.lookupSendRequest('key-1')).rejects.toMatchObject({ kind: 'unavailable' })
  })
  it('requests one key and maps the returned summary', async () => {
    const { fetch, gateway } = fixture({ intent: row, simulated: true })
    expect(await gateway.lookupSendRequest('key-1')).toMatchObject({ id: 'i1', mailboxId: 'mb', idempotencyKey: 'key-1', successorId: null })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0]?.[0]).toBe('/v1/send-intents/lookup?idempotencyKey=key-1')
  })

  it('returns null only for an explicit absent result', async () => {
    expect(await fixture({ intent: null, simulated: true }).gateway.lookupSendRequest('key-1')).toBeNull()
    await expect(fixture({ simulated: true }).gateway.lookupSendRequest('key-1')).rejects.toMatchObject({ kind: 'unavailable' })
    await expect(fixture({ intent: { ...row, idempotency_key: 'other' }, simulated: true }).gateway.lookupSendRequest('key-1')).rejects.toMatchObject({ kind: 'unavailable' })
  })

  it('rejects an invalid key without contacting the server', async () => {
    const { fetch, gateway } = fixture({ intent: null, simulated: true })
    await expect(gateway.lookupSendRequest('../other')).rejects.toMatchObject({ code: 'validation_failed' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
