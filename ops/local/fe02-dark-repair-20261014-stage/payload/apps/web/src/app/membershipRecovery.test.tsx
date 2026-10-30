// BE-02 D §8 + D05/D06 through the full Shell: a membership write that rotates the actor's own
// authorization version re-bootstraps the session, the old request generation is invalidated
// BEFORE the bootstrap answers, the refreshed mailbox list (not the write's result) decides which
// capabilities the UI shows, and a delayed old success or error for the previous generation can
// neither repopulate nor break the recovered screen. Row removal keeps shared/private semantics:
// a private mailbox disappears with its explicit row, a shared one stays readable without compose
// or member administration.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import type { Mailbox, MailboxPage } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createCollaborationState, createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { MailroomGateway } from '@/data/gateway'
import { MembersPage } from '@/features/members/MembersPage'
import { SessionProvider, useSession, type SessionController } from './session'
import { Shell } from './Shell'

const MANAGER = { compose: true, approve_send: false, manage_members: true }
const api = (code: GatewayError['code'], status: number) => new GatewayError('api', code, 'synthetic', { status, requestId: 'r1' })
const row = (userId: string) => within(screen.getByText(userId).closest('li')!)

interface Held<T> {
  succeed(value: T): void
  fail(error: unknown): void
}

/**
 * Fixture gateway whose session and mailbox list are derived from the fixture roster, so a
 * self-affecting membership write really changes the actor's authorization version and the
 * capabilities the next bootstrap reports. Held replies ignore the abort signal on purpose.
 */
function harness(options: { shared: boolean }) {
  const state = createCollaborationState()
  const base = createFixtureGateway({}, { state })
  const h = {
    state,
    sessionReads: 0,
    mailboxLists: 0,
    holdMailboxLists: 0,
    heldMailboxLists: [] as Array<Held<MailboxPage>>,
    holdNextSession: false,
    heldSessions: [] as Array<{ release(): void }>,
    gateway: base,
  }
  const selfCapabilities = () => state.listMembers(CD.mailboxId).items.find((m) => m.user_id === CD.actorId)?.capabilities
  const cdMailbox = (): Mailbox | null => {
    const own = selfCapabilities()
    const template = { id: CD.mailboxId, display_name: 'C/D fixture mailbox', display_address: 'collaboration@example.test' }
    if (own) return { ...template, capabilities: { read: true, ...own } }
    // No explicit row: a shared mailbox stays readable with no flags; a private one is absent (D06).
    return options.shared ? { ...template, capabilities: { read: true, compose: false, approve_send: false, manage_members: false } } : null
  }
  h.gateway = {
    ...base,
    getSession: async (signal) => {
      h.sessionReads += 1
      const session = { ...(await base.getSession(signal)), authorization_version: state.authorizationVersion }
      if (!h.holdNextSession) return session
      h.holdNextSession = false
      return new Promise<typeof session>((resolve) => h.heldSessions.push({ release: () => resolve(session) }))
    },
    listMailboxes: async (ctx, query, signal) => {
      h.mailboxLists += 1
      const canonical = await base.listMailboxes(ctx, query, signal)
      const cd = cdMailbox()
      const page: MailboxPage = { ...canonical, authorization_version: state.authorizationVersion, items: [...canonical.items.filter((m) => m.id !== CD.mailboxId), ...(cd ? [cd] : [])] }
      if (h.holdMailboxLists === 0) return page
      h.holdMailboxLists -= 1
      return new Promise<MailboxPage>((resolve, reject) => h.heldMailboxLists.push({ succeed: resolve, fail: reject }))
    },
    listMailboxMembers: async (ctx, mailboxId, query, signal) => {
      // The server answers a generic 404 to someone who no longer manages the mailbox (D05).
      if (mailboxId === CD.mailboxId && !selfCapabilities()?.manage_members) throw api('not_available', 404)
      return base.listMailboxMembers(ctx, mailboxId, query, signal)
    },
  }
  return h
}

function Probe({ grab }: { grab: (controller: SessionController) => void }) {
  grab(useSession())
  return null
}

function renderMembersInShell(gateway: MailroomGateway) {
  let latest: SessionController | undefined
  render(
    <SessionProvider gateway={gateway}>
      <Probe grab={(c) => (latest = c)} />
      <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/members`]}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<p>index</p>} />
            <Route path="mailboxes/:mailboxId" element={<p>inbox</p>} />
            <Route path="mailboxes/:mailboxId/drafts" element={<p>drafts</p>} />
            <Route path="mailboxes/:mailboxId/members" element={<MembersPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
  return { controller: () => latest! }
}

/** Seeds a second manager so the actor may leave, mounts the Shell and waits for roster and sidebar. */
async function openRosterWithSecondManager(h: ReturnType<typeof harness>) {
  h.state.putMember(CD.mailboxId, CD.readerId, 1, MANAGER)
  const view = renderMembersInShell(h.gateway)
  await screen.findByText('Roster revision 2')
  return view
}

describe('self-membership change through the Shell', () => {
  it('removing my own explicit row from a PRIVATE mailbox invalidates the old generation before the bootstrap answers; the refreshed list drops the mailbox and a late old list success changes nothing', async () => {
    const h = harness({ shared: false })
    // Hold the FIRST mailbox list: the old generation's success will arrive after the recovery.
    h.holdMailboxLists = 1
    const { controller } = await openRosterWithSecondManager(h)
    expect(screen.getByRole('status', { name: 'Loading mailboxes' })).toBeTruthy()
    expect(h.sessionReads).toBe(1)
    const oldGeneration = controller().scope.current()
    const oldContext = controller().context
    expect(oldContext?.authorizationVersion).toBe(CD.authorizationVersion)

    h.holdNextSession = true
    fireEvent.click(row(CD.actorId).getByRole('button', { name: 'Remove' }))
    // The write succeeded with a rotated authorization version: explicit re-bootstrap, old reads stale.
    await waitFor(() => expect(h.heldSessions).toHaveLength(1))
    expect(h.state.authorizationVersion).toBe(CD.rotatedAuthorizationVersion)
    expect(controller().scope.isCurrent(oldGeneration)).toBe(false)
    expect(controller().context).toBeNull()
    expect(screen.getByRole('status', { name: 'Loading session' })).toBeTruthy()
    expect(screen.queryByText(/Roster revision/)).toBeNull()
    expect(h.mailboxLists).toBe(1)

    act(() => h.heldSessions[0]!.release())
    // Fresh identity, fresh mailbox list from the server: the private mailbox is gone, Members with it.
    await screen.findByText('Members are unavailable')
    expect(h.sessionReads).toBe(2)
    expect(controller().context?.authorizationVersion).toBe(CD.rotatedAuthorizationVersion)
    await waitFor(() => expect(h.mailboxLists).toBe(2))
    expect(await screen.findByRole('link', { name: 'Fixture inbox' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'C/D fixture mailbox' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Drafts' })).toBeNull()
    expect(screen.queryByText(/Roster revision/)).toBeNull()

    // The OLD generation's list now succeeds with the full old capabilities: it must not reappear.
    const oldList: MailboxPage = {
      context_id: CD.contextId,
      authorization_version: CD.authorizationVersion,
      next_cursor: null,
      items: [{ id: CD.mailboxId, display_name: 'C/D fixture mailbox', display_address: 'collaboration@example.test', capabilities: { read: true, ...MANAGER } }],
    }
    act(() => h.heldMailboxLists[0]!.succeed(oldList))
    await act(async () => {})
    expect(screen.queryByRole('link', { name: 'C/D fixture mailbox' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Fixture inbox' })).toBeTruthy()
    expect(screen.getByText('Members are unavailable')).toBeTruthy()
    expect(h.sessionReads).toBe(2)
  })

  it('removing my own explicit row from a SHARED mailbox keeps it readable without compose or member links; a late old list error cannot break the recovered sidebar', async () => {
    const h = harness({ shared: true })
    h.holdMailboxLists = 1
    const { controller } = await openRosterWithSecondManager(h)
    const oldGeneration = controller().scope.current()

    fireEvent.click(row(CD.actorId).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(h.sessionReads).toBe(2))
    expect(controller().scope.isCurrent(oldGeneration)).toBe(false)
    expect(h.state.listMembers(CD.mailboxId).items.map((m) => m.user_id)).toEqual([CD.readerId])

    // Shared read access survives the row removal; the explicit-row capabilities do not.
    const mailboxLink = await screen.findByRole('link', { name: 'C/D fixture mailbox' })
    expect(mailboxLink.getAttribute('aria-current')).toBe('page')
    expect(screen.queryByRole('link', { name: 'Drafts' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
    expect(await screen.findByText('Members are unavailable')).toBeTruthy()
    expect(await screen.findByText('You cannot manage members of this mailbox')).toBeTruthy()
    expect(screen.queryByText(/Roster revision/)).toBeNull()
    expect(controller().context?.authorizationVersion).toBe(CD.rotatedAuthorizationVersion)

    // The OLD generation's list fails late: no error state, no retry button, nothing replaced.
    act(() => h.heldMailboxLists[0]!.fail(api('temporarily_unavailable', 503)))
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'C/D fixture mailbox' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
    expect(h.sessionReads).toBe(2)
  })
})
