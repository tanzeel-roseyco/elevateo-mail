import { act, render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { draftIntentKey } from './draftIntent'
import { SendIntentProvider, useSendIntent, type SendAttempt } from './sendIntent'
import { SessionProvider, useSession, type SessionController } from './session'

const key = draftIntentKey({ actorId: CD.actorId, organizationId: CD.organizationId, mailboxId: CD.mailboxId, draftId: CD.draftId })
const binding: SendAttempt = { phase: 'uncertain', sendId: null, input: { mailbox_id: CD.mailboxId, operation_id: '00000000-0000-4000-8000-000000000099', expected_version: 1, review_digest: 'a'.repeat(64), correspondence_confirmed: true } }
function setup() {
  const a = createFixtureGateway(); const b = createFixtureGateway({ getSession: 'session_b' })
  let actor = a
  let current: { store: ReturnType<typeof useSendIntent>; session: SessionController } | undefined
  function Probe() { current = { store: useSendIntent(), session: useSession() }; return null }
  render(<SessionProvider gateway={{ ...a, getSession: (signal) => actor.getSession(signal) }}><SendIntentProvider><Probe /></SendIntentProvider></SessionProvider>)
  return { ready: async () => { await waitFor(() => expect(current?.session.state.status).toBe('ready')); if (!current) throw new Error('Missing probe'); return current }, switchActor: () => { actor = b } }
}
describe('BE03 approval binding ownership', () => {
  beforeEach(() => window.sessionStorage.clear())
  it('clears binding on logout and refuses late recreation', async () => {
    const h = setup(); const c = await h.ready()
    c.store.write(key, binding)
    expect(c.store.read(key)).toEqual(binding)
    await act(async () => { await c.session.signOut('local') })
    expect(c.store.read(key)).toBeNull()
    c.store.update(key, () => ({ ...binding, phase: 'approved', sendId: binding.input.operation_id }))
    expect(c.store.read(key)).toBeNull()
  })
  it('isolates mailbox keys and clears entries after actor/organization replacement', async () => {
    const h = setup(); const c = await h.ready(); c.store.write(key, binding)
    const other = draftIntentKey({ actorId: CD.actorId, organizationId: CD.organizationId, mailboxId: binding.input.operation_id, draftId: CD.draftId })
    expect(c.store.read(other)).toBeNull()
    h.switchActor()
    await act(async () => { c.session.refresh() }); await h.ready()
    expect(c.store.read(key)).toBeNull()
  })
})
