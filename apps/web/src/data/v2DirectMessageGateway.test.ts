import { describe, expect, it, vi } from 'vitest'
import { createV2Gateway } from './v2Gateway'

const mailbox = '00000000-0000-4000-8000-000000000001'
const thread = '00000000-0000-4000-8000-000000000002'
const message = '00000000-0000-4000-8000-000000000003'
const context = { contextId: 'a'.repeat(16), authorizationVersion: 'b'.repeat(16) }
const page = {
  context_id: context.contextId, authorization_version: context.authorizationVersion,
  mailbox_id: mailbox, thread_id: thread,
  message: { id: message, sender: null, to: [], sent_at: null, body_text: '<b>plain</b>', body_truncated: false, attachment_count: 0 },
}
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'Content-Type': 'application/json' },
})

describe('V2 direct message gateway', () => {
  it('reads one scoped plaintext message with current context', async () => {
    const fetchImpl = vi.fn(async (input: string, init: RequestInit) => {
      expect(input).toBe(`/v2/threads/${thread}/messages/${message}?mailbox_id=${mailbox}`)
      expect(new Headers(init.headers).get('X-Session-Context')).toBe(context.contextId)
      return json(page)
    })
    const result = await createV2Gateway(fetchImpl).getDirectMessage(context, mailbox, thread, message)
    expect(result.message.body_text).toBe('<b>plain</b>')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed path before transport', () => {
    const fetchImpl = vi.fn(async () => json(page))
    expect(() => createV2Gateway(fetchImpl).getDirectMessage(context, mailbox, '../escape', message)).toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('preserves a generic inaccessible result', async () => {
    const fetchImpl = vi.fn(async () => json({ code: 'not_available', message: 'This item is unavailable.', request_id: 'req-1' }, 404))
    await expect(createV2Gateway(fetchImpl).getDirectMessage(context, mailbox, thread, message))
      .rejects.toMatchObject({ kind: 'api', code: 'not_available' })
  })
})
