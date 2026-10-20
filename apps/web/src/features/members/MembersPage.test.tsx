// BE-02 D §8 membership administration: every write carries the roster revision on screen, a
// stale revision or the last-manager guard is refused with a reload path, a self-affecting change
// whose result carries a different authorization version forces an explicit session re-bootstrap,
// and permission loss shows an unavailable state instead of an empty roster.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { SessionProvider } from '@/app/session'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createCollaborationState, createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import type { MailroomGateway } from '@/data/gateway'
import { MembersPage } from './MembersPage'

const MANAGER = { compose: true, approve_send: false, manage_members: true }
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const row = (userId: string) => within(screen.getByText(userId).closest('li')!)
const addForm = () => within(document.querySelector('form')!)

function harness(script: FixtureScript = {}) {
  const state = createCollaborationState()
  const base = createFixtureGateway(script, { state })
  const h = { state, sessionReads: 0, gateway: base }
  h.gateway = {
    ...base,
    getSession: async (signal) => {
      h.sessionReads += 1
      return base.getSession(signal)
    },
  }
  return h
}

function renderMembers(gateway: MailroomGateway) {
  return render(
    <SessionProvider gateway={gateway}>
      <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/members`]}>
        <Routes>
          <Route path="/mailboxes/:mailboxId/members" element={<MembersPage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('roster', () => {
  it('shows the explicit members, the revision and the actor badge, with no user directory', async () => {
    const h = harness()
    renderMembers(h.gateway)
    expect(await screen.findByText('Roster revision 1')).toBeTruthy()
    expect(screen.getByText(CD.actorId)).toBeTruthy()
    expect(row(CD.actorId).getByText('You')).toBeTruthy()
    expect((row(CD.actorId).getByLabelText('Manage members') as HTMLInputElement).checked).toBe(true)
    expect(row(CD.actorId).getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', true)
    expect(screen.getByText(/this build has no user directory/)).toBeTruthy()
  })

  it('adds a member at the current revision and shows the new revision', async () => {
    const h = harness()
    renderMembers(h.gateway)
    await screen.findByText('Roster revision 1')
    fireEvent.change(screen.getByLabelText('User id'), { target: { value: 'not-an-id' } })
    fireEvent.click(button('Save member'))
    expect(screen.getByText('Enter the user id in UUID form.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('User id'), { target: { value: CD.readerId } })
    fireEvent.click(addForm().getByLabelText('Compose'))
    fireEvent.click(button('Save member'))
    expect(await screen.findByText('Roster revision 2')).toBeTruthy()
    expect(screen.getByText(CD.readerId)).toBeTruthy()
    expect((row(CD.readerId).getByLabelText('Compose') as HTMLInputElement).checked).toBe(true)
    expect((row(CD.readerId).getByLabelText('Manage members') as HTMLInputElement).checked).toBe(false)
    expect(h.state.listMembers(CD.mailboxId)).toMatchObject({ version: 2, items: [{ user_id: CD.actorId }, { user_id: CD.readerId, capabilities: { compose: true, approve_send: false, manage_members: false } }] })
    expect((screen.getByLabelText('User id') as HTMLInputElement).value).toBe('')
  })

  it('a stale revision is refused and the reload shows the roster the server holds', async () => {
    const h = harness()
    renderMembers(h.gateway)
    await screen.findByText('Roster revision 1')
    // Another manager added the reader after this page loaded revision 1.
    h.state.putMember(CD.mailboxId, CD.readerId, 1, { compose: false, approve_send: false, manage_members: false })
    fireEvent.change(screen.getByLabelText('User id'), { target: { value: CD.readerId } })
    fireEvent.click(button('Save member'))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('changed elsewhere')
    expect(screen.getByText('Roster revision 1')).toBeTruthy()
    // The refused id stays in the field for the retry after reload.
    expect((screen.getByLabelText('User id') as HTMLInputElement).value).toBe(CD.readerId)
    fireEvent.click(button('Reload members'))
    expect(await screen.findByText('Roster revision 2')).toBeTruthy()
    expect(screen.getByText(CD.readerId)).toBeTruthy()
  })

  it('the last manager cannot be demoted or removed; the roster is unchanged', async () => {
    const h = harness()
    renderMembers(h.gateway)
    await screen.findByText('Roster revision 1')
    fireEvent.click(row(CD.actorId).getByLabelText('Manage members'))
    // AIDEV-NOTE: A reset must not silently erase the edit before the guarded write is attempted.
    expect(row(CD.actorId).getByLabelText('Manage members')).toHaveProperty('checked', false)
    expect(row(CD.actorId).getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', false)
    fireEvent.click(row(CD.actorId).getByRole('button', { name: 'Apply' }))
    let alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('without a manager')
    expect(h.state.listMembers(CD.mailboxId)).toMatchObject({ version: 1 })
    fireEvent.click(row(CD.actorId).getByRole('button', { name: 'Remove' }))
    alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('without a manager')
    expect(screen.getByText(CD.actorId)).toBeTruthy()
    expect(h.state.listMembers(CD.mailboxId)).toMatchObject({ version: 1 })
    expect(h.sessionReads).toBe(1)
  })

  it('keeps another row draft while a successful member write replaces its own server copy', async () => {
    const h = harness()
    h.state.putMember(CD.mailboxId, CD.readerId, 1, MANAGER)
    renderMembers(h.gateway)
    await screen.findByText('Roster revision 2')
    fireEvent.click(row(CD.actorId).getByLabelText('Approve send'))
    fireEvent.click(row(CD.readerId).getByLabelText('Compose'))
    fireEvent.click(row(CD.readerId).getByRole('button', { name: 'Apply' }))
    await screen.findByText('Roster revision 3')
    expect(row(CD.readerId).getByLabelText('Compose')).toHaveProperty('checked', false)
    expect(row(CD.readerId).getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', true)
    expect(row(CD.actorId).getByLabelText('Approve send')).toHaveProperty('checked', true)
    expect(row(CD.actorId).getByRole('button', { name: 'Apply' })).toHaveProperty('disabled', false)
    expect(h.state.listMembers(CD.mailboxId).items.find((member) => member.user_id === CD.actorId)?.capabilities.approve_send).toBe(false)
  })

  it('a self-affecting change with a rotated authorization version re-bootstraps the session', async () => {
    const h = harness()
    h.state.putMember(CD.mailboxId, CD.readerId, 1, MANAGER)
    renderMembers(h.gateway)
    await screen.findByText('Roster revision 2')
    expect(h.sessionReads).toBe(1)
    fireEvent.click(row(CD.actorId).getByLabelText('Manage members'))
    fireEvent.click(row(CD.actorId).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(h.sessionReads).toBeGreaterThanOrEqual(2))
    expect(h.state.authorizationVersion).toBe(CD.rotatedAuthorizationVersion)
    expect(h.state.listMembers(CD.mailboxId)).toMatchObject({ version: 3, items: [{ user_id: CD.actorId, capabilities: { ...MANAGER, manage_members: false } }, { user_id: CD.readerId }] })
    // The re-read roster is the server's: the actor row no longer manages.
    await waitFor(() => expect((row(CD.actorId).getByLabelText('Manage members') as HTMLInputElement).checked).toBe(false))
    expect(screen.getByText('Roster revision 3')).toBeTruthy()
  })

  it('removes another member and shows the result revision', async () => {
    const h = harness()
    h.state.putMember(CD.mailboxId, CD.readerId, 1, { compose: false, approve_send: false, manage_members: false })
    renderMembers(h.gateway)
    await screen.findByText('Roster revision 2')
    fireEvent.click(row(CD.readerId).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText('Roster revision 3')).toBeTruthy()
    expect(screen.queryByText(CD.readerId)).toBeNull()
    expect(h.state.listMembers(CD.mailboxId).items.map((m) => m.user_id)).toEqual([CD.actorId])
    expect(h.sessionReads).toBe(1)
  })

  it('permission loss shows the unavailable state and no editing form', async () => {
    const h = harness({ listMailboxMembers: 'not_available' })
    renderMembers(h.gateway)
    expect(await screen.findByText('Members are unavailable')).toBeTruthy()
    expect(screen.queryByLabelText('User id')).toBeNull()
    expect(screen.queryByText(/Roster revision/)).toBeNull()
  })

  it('a 503 on load offers a retry', async () => {
    const h = harness()
    let failOnce = true
    const gateway: MailroomGateway = {
      ...h.gateway,
      listMailboxMembers: async (ctx, mailboxId, query, signal) => {
        if (failOnce) {
          failOnce = false
          throw new GatewayError('api', 'temporarily_unavailable', 'synthetic', { status: 503, requestId: 'r1' })
        }
        return h.gateway.listMailboxMembers(ctx, mailboxId, query, signal)
      },
    }
    renderMembers(gateway)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Members could not be loaded')
    fireEvent.click(button('Try again'))
    expect(await screen.findByText('Roster revision 1')).toBeTruthy()
  })
})
