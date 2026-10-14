import { describe, expect, it } from 'vitest'
import { createDemoGateway, DEMO_MAILBOX_ID } from './demoGateway'
import { CD_FIXTURE } from '@/data/fixtures/collaborationState'

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
    expect(detail.messages[0]?.body_text).toContain('Hi Alex')
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
