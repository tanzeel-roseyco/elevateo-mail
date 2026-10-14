import { describe, expect, it, vi } from 'vitest'
import { createV2AssigneeOptionsGateway } from './v2AssigneeOptionsGateway'

const ctx = { contextId: 'c'.repeat(16), authorizationVersion: 'v'.repeat(16) }
const mailbox = '11111111-1111-4111-8111-111111111111'
const user = '22222222-2222-4222-8222-222222222222'
const page = (override: Record<string, unknown> = {}) => new Response(JSON.stringify({
  context_id: ctx.contextId, authorization_version: ctx.authorizationVersion, mailbox_id: mailbox,
  items: [{ user_id: user }], next_cursor: null, ...override,
}), { headers: { 'Content-Type': 'application/json' } })

describe('proposed mailbox assignee option adapter', () => {
  it('reads a scoped UUID-only page with session headers and a bounded limit', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => page())
    const result = await createV2AssigneeOptionsGateway(fetchImpl).listMailboxAssigneeOptions(ctx, mailbox,
      { limit: 50 }, new AbortController().signal)
    expect(result.items).toEqual([{ user_id: user }])
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(`/v2/mailboxes/${mailbox}/assignee-options?limit=50`)
    expect(fetchImpl.mock.calls[0]?.[1].headers).toMatchObject({
      'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion,
    })
  })

  it('rejects an invalid limit before network access', async () => {
    const fetchImpl = vi.fn(async (_input: string, _init: RequestInit) => page())
    await expect(createV2AssigneeOptionsGateway(fetchImpl).listMailboxAssigneeOptions(ctx, mailbox,
      { limit: 51 }, new AbortController().signal)).rejects.toMatchObject({ code: 'malformed' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a foreign mailbox or profile field in the response', async () => {
    const foreign = vi.fn(async (_input: string, _init: RequestInit) => page({ mailbox_id: user }))
    await expect(createV2AssigneeOptionsGateway(foreign).listMailboxAssigneeOptions(ctx, mailbox,
      {}, new AbortController().signal)).rejects.toMatchObject({ code: 'malformed' })
    const profile = vi.fn(async (_input: string, _init: RequestInit) => page({ items: [{ user_id: user, email: 'example.invalid' }] }))
    await expect(createV2AssigneeOptionsGateway(profile).listMailboxAssigneeOptions(ctx, mailbox,
      {}, new AbortController().signal)).rejects.toMatchObject({ code: 'malformed' })
  })
})
