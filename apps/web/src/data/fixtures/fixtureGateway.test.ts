import { describe, expect, expectTypeOf, it } from 'vitest'
import type { MailboxPage, Session, ThreadDetailPage, ThreadPage } from '../contract'
import type { ReadContext } from '../gateway'
import { createFixtureGateway } from './fixtureGateway'

const context: ReadContext = { contextId: 'context_A_0123456789', authorizationVersion: 'authz_A_0123456789' }
const mailbox = '00000000-0000-4000-8000-000000000021'
const thread = '00000000-0000-4000-8000-000000000031'

// AIDEV-NOTE: Exercise adapter operations, not only schemas; compilation must also preserve each concrete DTO.
describe('operation-specific fixture validation', () => {
  it('returns the concrete type and valid data for every operation', async () => {
    const gateway = createFixtureGateway()
    const session = await gateway.getSession()
    const mailboxes = await gateway.listMailboxes(context, {})
    const threads = await gateway.listThreads(context, mailbox, {})
    const detail = await gateway.getThread(context, thread, mailbox, {})
    expectTypeOf(session).toEqualTypeOf<Session>()
    expectTypeOf(mailboxes).toEqualTypeOf<MailboxPage>()
    expectTypeOf(threads).toEqualTypeOf<ThreadPage>()
    expectTypeOf(detail).toEqualTypeOf<ThreadDetailPage>()
    expect(session.simulation_mode).toBe(true)
    expect(mailboxes.items[0]?.id).toBe(mailbox)
    expect(threads.mailbox_id).toBe(mailbox)
    expect(detail.thread.id).toBe(thread)
  })

  const operations = [
    ['getSession', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.getSession()],
    ['listMailboxes', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.listMailboxes(context, {})],
    ['listThreads', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.listThreads(context, mailbox, {})],
    ['getThread', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.getThread(context, thread, mailbox, {})],
  ] as const

  it.each(operations)('%s rejects another operation payload', async (operation, read) => {
    const wrong = operation === 'getSession' ? 'mailboxes' : 'session_a'
    await expect(read(createFixtureGateway({ [operation]: wrong }))).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it.each(operations)('%s fails deliberately for an unknown fixture', async (operation, read) => {
    await expect(read(createFixtureGateway({ [operation]: 'missing-example' }))).rejects.toThrow('Unknown fixture example')
  })

  it.each(operations)('%s preserves canonical API failure status and request ID', async (operation, read) => {
    await expect(read(createFixtureGateway({ [operation]: 'context_changed' }))).rejects.toMatchObject({
      kind: 'api', code: 'context_changed', status: 409, requestId: 'fixture-request-001',
    })
  })
})
