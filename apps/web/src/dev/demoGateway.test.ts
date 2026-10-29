import { describe, expect, it } from 'vitest'
import { createDemoGateway, DEMO_MAILBOX_ID } from './demoGateway'
import { CD_FIXTURE } from '@/data/fixtures/collaborationState'
import { validActorProjection, validGrantProjection, validRosterProjection } from '@/features/members/adminModel'
import { createSimulatedAdministrationGateway, createSimulatedPreferencesGateway } from './simulatedPeople'

const context = { contextId: CD_FIXTURE.contextId, authorizationVersion: CD_FIXTURE.authorizationVersion }

// AIDEV-NOTE: Verify usable demo reads, cancellation, missing data and per-load reset independently of fixtures.
describe('synthetic demo gateway', () => {
  it('provides a populated inbox, plaintext reader, editable drafts and literal search', async () => {
    const gateway = createDemoGateway()
    expect((await gateway.getSession()).organization.name).toBe('Elevateo Studio')
    expect((await gateway.listMailboxes(context, {})).items[0]?.id).toBe(DEMO_MAILBOX_ID)
    const threads = await gateway.listThreads(context, DEMO_MAILBOX_ID, {})
    expect(threads.items).toHaveLength(8)
    expect((await gateway.listThreads(context, DEMO_MAILBOX_ID, { filter: 'unread' })).items).toHaveLength(4)
    const detail = await gateway.getThread(context, CD_FIXTURE.threadId, DEMO_MAILBOX_ID, {})
    expect(detail.messages[0]?.body_text).toContain('Hi Alex,\n\n')
    expect(detail.messages[0]?.body_text).not.toContain(String.fromCharCode(92) + 'n')
    expect((await gateway.listDrafts(context, DEMO_MAILBOX_ID, {})).items).toHaveLength(2)
    const search = await gateway.searchMail(context, { q: 'Northstar', mailbox_id: DEMO_MAILBOX_ID })
    expect(search.items.length).toBeGreaterThan(0)
  })

  it('rejects cancellation and unavailable readers without network fallback', async () => {
    const gateway = createDemoGateway()
    const controller = new AbortController()
    controller.abort()
    await expect(gateway.getSession(controller.signal)).rejects.toMatchObject({ code: 'aborted' })
    await expect(gateway.getThread(context, '00000000-0000-4000-8000-000000000999', DEMO_MAILBOX_ID, {})).rejects.toMatchObject({ code: 'not_available' })
  })

  it('keeps mutations in one gateway and restores initial state on a fresh load', async () => {
    const gateway = createDemoGateway()
    await gateway.setThreadReadState(context, { csrfToken: 'synthetic' }, CD_FIXTURE.threadId, { mailbox_id: DEMO_MAILBOX_ID, read: true })
    expect((await gateway.getThread(context, CD_FIXTURE.threadId, DEMO_MAILBOX_ID, {})).thread.unread).toBe(false)
    expect((await createDemoGateway().getThread(context, CD_FIXTURE.threadId, DEMO_MAILBOX_ID, {})).thread.unread).toBe(true)
  })
})

// Simulated V2 People/Members and Personal Details ports used by the demo and fixture entries.
describe('simulated people and preference ports', () => {
  const proof = { csrfToken: 'csrf-token' }

  it('serve grants and a roster that pass the pages own projection checks', async () => {
    const identity = createDemoGateway()
    const session = await identity.getSession()
    const admin = createSimulatedAdministrationGateway(identity)
    const grants = await admin.listOrganizationGrants(session.organization.id, context)
    expect(grants.context_id).toBe(context.contextId)
    expect(validActorProjection(session.organization.id, session.actor.id, grants.actor)).toBe(true)
    expect(validGrantProjection(session.organization.id, grants.items)).toBe(true)
    expect(validRosterProjection((await admin.getOrganizationRoster(session.organization.id, context)).items)).toBe(true)
  })

  it('answers a stale grant revision with 409 and leaves the grant unchanged', async () => {
    const identity = createDemoGateway()
    const organizationId = (await identity.getSession()).organization.id
    const admin = createSimulatedAdministrationGateway(identity)
    const target = (await admin.listOrganizationGrants(organizationId, context)).items.find((grant) => grant.role === 'sales_member')!
    const changed = await admin.replaceOrganizationGrant(organizationId, target.user_id, { role: 'sales_lead', expected_revision: target.revision }, context, proof)
    expect(changed).toMatchObject({ role: 'sales_lead', revision: target.revision + 1 })
    await expect(admin.replaceOrganizationGrant(organizationId, target.user_id, { role: 'organization_member', expected_revision: target.revision }, context, proof))
      .rejects.toMatchObject({ kind: 'api', status: 409 })
    await expect(admin.listOrganizationGrants(organizationId, context, undefined, { cursor: 'forged' })).rejects.toMatchObject({ code: 'cursor_invalid' })
  })

  it('round-trips the display name and rejects a stale or cancelled update', async () => {
    const preferences = createSimulatedPreferencesGateway()
    const signal = new AbortController().signal
    const initial = await preferences.getUserDisplayPreference(context, signal)
    expect(initial).toMatchObject({ context_id: context.contextId, display_name: null, revision: 0 })
    await preferences.updateUserDisplayPreference({ display_name: 'Ada', expected_revision: 0 }, context, proof, signal)
    expect(await preferences.getUserDisplayPreference(context, signal)).toMatchObject({ display_name: 'Ada', revision: 1 })
    await expect(preferences.updateUserDisplayPreference({ display_name: 'Bea', expected_revision: 0 }, context, proof, signal)).rejects.toMatchObject({ status: 409 })
    await expect(preferences.getUserDisplayPreference(context, AbortSignal.abort())).rejects.toMatchObject({ code: 'aborted' })
  })
})
