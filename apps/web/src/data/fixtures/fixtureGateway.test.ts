import { describe, expect, expectTypeOf, it } from 'vitest'
import type { AuthChallenge, AuthLifecycle, AuthLogout, MailboxPage, OrganizationPage, OrganizationThreadPage, Session, ThreadDetailPage, ThreadPage } from '../contract'
import type { ReadContext } from '../gateway'
import { createFixtureGateway } from './fixtureGateway'
import { CD_FIXTURE } from './collaborationState'

const context: ReadContext = { contextId: 'context_A_0123456789', authorizationVersion: 'authz_A_0123456789' }
const mailbox = '00000000-0000-4000-8000-000000000021'
const thread = '00000000-0000-4000-8000-000000000031'

describe('fixture assignee options', () => {
  it('paginates the eligible targets and accepts a returned target for assignment', async () => {
    const gateway = createFixtureGateway()
    const signal = new AbortController().signal
    const first = await gateway.listMailboxAssigneeOptions(context, CD_FIXTURE.mailboxId, { limit: 1 }, signal)
    expect(first).toMatchObject({ context_id: context.contextId, authorization_version: context.authorizationVersion,
      mailbox_id: CD_FIXTURE.mailboxId, items: [{ user_id: CD_FIXTURE.actorId }], next_cursor: CD_FIXTURE.actorId })
    const second = await gateway.listMailboxAssigneeOptions(context, CD_FIXTURE.mailboxId,
      { limit: 1, cursor: first.next_cursor! }, signal)
    expect(second.items).toEqual([{ user_id: CD_FIXTURE.readerId }])
    expect(second.next_cursor).toBeNull()
    const assigned = await gateway.setThreadAssignment(context, { csrfToken: 'synthetic_challenge_token_00000001' },
      CD_FIXTURE.threadId, { mailbox_id: CD_FIXTURE.mailboxId, assignee_id: second.items[0]!.user_id,
        expected_assignment_version: 0 }, signal)
    expect(assigned.assignee_id).toBe(CD_FIXTURE.readerId)
  })

  it('rejects unknown mailboxes, stale contexts, and cancelled reads', async () => {
    const gateway = createFixtureGateway()
    const signal = new AbortController().signal
    await expect(gateway.listMailboxAssigneeOptions(context, CD_FIXTURE.threadId, {}, signal))
      .rejects.toMatchObject({ code: 'not_available' })
    await expect(gateway.listMailboxAssigneeOptions({ ...context, contextId: 'another_context_0123456789' }, mailbox, {}, signal))
      .rejects.toMatchObject({ code: 'context_changed' })
    const controller = new AbortController()
    controller.abort()
    await expect(gateway.listMailboxAssigneeOptions(context, mailbox, {}, controller.signal))
      .rejects.toMatchObject({ code: 'aborted' })
  })

  it.each([{ limit: 0 }, { limit: 51 }, { limit: 1.5 }, { cursor: 'unknown' }])(
    'rejects invalid pagination %j', async (query) => {
      await expect(createFixtureGateway().listMailboxAssigneeOptions(context, mailbox, query, new AbortController().signal))
        .rejects.toMatchObject({ code: 'malformed' })
    },
  )
})

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

  it('composes the organization list from both fixture mailboxes in server order, no envelope mailbox_id', async () => {
    const gateway = createFixtureGateway()
    const page = await gateway.listOrganizationThreads(context, {})
    expectTypeOf(page).toEqualTypeOf<OrganizationThreadPage>()
    expect('mailbox_id' in page).toBe(false)
    expect(page.next_cursor).toBeNull()
    expect(new Set(page.items.map((t) => t.mailbox_id)).size).toBe(2)
    const times = page.items.map((t) => (t.last_message_at === null ? Number.NEGATIVE_INFINITY : Date.parse(t.last_message_at)))
    expect(times).toEqual([...times].sort((x, y) => y - x))
    expect((await gateway.listOrganizationThreads(context, { limit: 1 })).items).toHaveLength(1)
    await expect(createFixtureGateway({ listOrganizationThreads: 'context_changed' }).listOrganizationThreads(context, {})).rejects.toMatchObject({ kind: 'api', code: 'context_changed' })
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

// BE-02A: lifecycle operations resolve their own examples and reject the others' payloads.
const proof = { csrfToken: 'synthetic_challenge_token_00000001' }
describe('lifecycle fixture operations', () => {
  it('returns concrete lifecycle DTOs with the default script', async () => {
    const gateway = createFixtureGateway()
    const challenge = await gateway.getLoginChallenge()
    const lifecycle = await gateway.login(proof, { email: 'a@example.test', password: 'secret' })
    const logout = await gateway.logout(proof, { scope: 'local' })
    const organizations = await gateway.listOrganizations(context, {})
    const switched = await gateway.switchOrganization(context, proof, { organization_id: mailbox })
    expectTypeOf(challenge).toEqualTypeOf<AuthChallenge>()
    expectTypeOf(lifecycle).toEqualTypeOf<AuthLifecycle>()
    expectTypeOf(logout).toEqualTypeOf<AuthLogout>()
    expectTypeOf(organizations).toEqualTypeOf<OrganizationPage>()
    expect(lifecycle.session.actor.display_name).toBe('Fixture user A')
    expect(switched.session.actor.display_name).toBe('Fixture user B')
    expect(logout.upstream_status).toBe('pending')
    expect(organizations.items.map((o) => o.name)).toEqual(['Synthetic organization A', 'Synthetic organization B'])
    expect((await gateway.requestRecovery(proof, { email: 'a@example.test' })).accepted).toBe(true)
  })

  it('the default refresh fails like an absent cookie (401), so a 401 bootstrap ends on sign-in', async () => {
    await expect(createFixtureGateway().refreshSession(proof)).rejects.toMatchObject({ kind: 'api', code: 'unauthenticated', status: 401 })
  })

  const lifecycleOperations = [
    ['getLoginChallenge', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.getLoginChallenge()],
    ['login', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.login(proof, { email: 'a@example.test', password: 'secret' })],
    ['requestRecovery', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.requestRecovery(proof, { email: 'a@example.test' })],
    ['acceptAuthEntry', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.acceptAuthEntry(proof, { password: 'twelve-chars-long' })],
    ['refreshSession', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.refreshSession(proof)],
    ['logout', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.logout(proof, { scope: 'local' })],
    ['listOrganizations', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.listOrganizations(context, {})],
    ['switchOrganization', (gateway: ReturnType<typeof createFixtureGateway>) => gateway.switchOrganization(context, proof, { organization_id: mailbox })],
  ] as const

  it.each(lifecycleOperations)('%s rejects another operation payload', async (operation, call) => {
    await expect(call(createFixtureGateway({ [operation]: 'mailboxes' }))).rejects.toMatchObject({ kind: 'transport', code: 'malformed' })
  })

  it.each(lifecycleOperations)('%s preserves canonical API failure status and request ID', async (operation, call) => {
    await expect(call(createFixtureGateway({ [operation]: 'temporarily_unavailable' }))).rejects.toMatchObject({
      kind: 'api', code: 'temporarily_unavailable', status: 503, requestId: 'fixture-request-001',
    })
  })
})
