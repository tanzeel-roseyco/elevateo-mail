// Unified inbox over several mailboxes: rows come from the organization-wide server list in server
// order, carry the mailbox name and open in their own mailbox's reader; writes name the row's
// mailbox; continuation follows next_cursor with the shared one-reset cursor policy; a failed read
// is an explicit error with retry; one mailbox redirects. The page never fans out per mailbox.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { MailboxesProvider } from '@/app/mailboxes'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { Mailbox, OrganizationThreadPage, ThreadSummary } from '@/data/contract'
import { GatewayError } from '@/data/errors'
import type { MailroomGateway } from '@/data/gateway'
import { UnifiedInboxPage } from './UnifiedInboxPage'

const M1 = '00000000-0000-4000-8000-000000000a01'
const M2 = '00000000-0000-4000-8000-000000000a02'

function mailbox(id: string, name: string): Mailbox {
  return { id, display_name: name, display_address: `${name.toLowerCase()}@example.test`, capabilities: { read: true, compose: true, approve_send: false, manage_members: false } }
}

function row(id: string, mailboxId: string, subject: string, at: string): ThreadSummary {
  return {
    id: `00000000-0000-4000-8000-0000000000${id}`,
    mailbox_id: mailboxId,
    subject,
    subject_truncated: false,
    sender: { display_name: 'Sender', address: 'sender@example.test' },
    preview_text: '',
    last_message_at: at,
    unread: true,
    message_count: 1,
    folder: 'inbox',
    snoozed_until: null,
    starred: false,
  }
}

const page = (items: ThreadSummary[], next: string | null = null): OrganizationThreadPage => ({ context_id: 'ctx', authorization_version: 'v1', items, next_cursor: next })

function Location() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function renderUnified(gateway: MailroomGateway, mailboxes: Mailbox[], entry = '/inbox') {
  return render(
    <SessionProvider gateway={gateway}>
      <MailboxesProvider value={{ status: 'ready', mailboxes }}>
        <MemoryRouter initialEntries={[entry]}>
          <Location />
          <Routes>
            <Route path="/inbox" element={<UnifiedInboxPage />} />
            <Route path="/mailboxes/:mailboxId" element={<p>mailbox page</p>} />
          </Routes>
        </MemoryRouter>
      </MailboxesProvider>
    </SessionProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('unified inbox', () => {
  it('reads the organization list once, labels each row with its mailbox and links it into that mailbox', async () => {
    const gateway = createFixtureGateway()
    const list = vi.spyOn(gateway, 'listOrganizationThreads').mockResolvedValue(
      page([row('11', M1, 'Sales newest', '2026-10-23T10:00:00Z'), row('21', M2, 'Support middle', '2026-10-22T10:00:00Z'), row('12', M1, 'Sales oldest', '2026-10-21T10:00:00Z')]),
    )
    const perMailbox = vi.spyOn(gateway, 'listThreads')
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')])
    const ul = await screen.findByRole('list', { name: 'Conversation list' })
    const links = within(ul).getAllByRole('link')
    expect(links.map((l) => l.textContent)).toEqual([expect.stringContaining('Sales newest'), expect.stringContaining('Support middle'), expect.stringContaining('Sales oldest')])
    expect(links[1]!.textContent).toContain('· Support')
    expect(links[1]!.getAttribute('href')).toBe(`/mailboxes/${M2}/threads/${row('21', M2, '', '').id}`)
    expect(list).toHaveBeenCalledTimes(1)
    expect(list.mock.calls[0]?.[1]).toEqual({ filter: 'all' })
    // The server list is the only read: no per-mailbox fan-out, whatever the mailbox count.
    expect(perMailbox).not.toHaveBeenCalled()
    expect(screen.getByText('1–3 of 3')).toBeTruthy()
    expect(screen.getByText(/Across/).textContent).toBe('Across 2 mailboxes')
  })

  it('passes the filter to the server and shows the per-view empty state', async () => {
    const gateway = createFixtureGateway()
    const list = vi.spyOn(gateway, 'listOrganizationThreads').mockResolvedValue(page([]))
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')], '/inbox?filter=starred')
    await screen.findByRole('heading', { name: 'No starred conversations' })
    expect(list.mock.calls[0]?.[1]).toEqual({ filter: 'starred' })
  })

  it('continues with next_cursor on Show more and appends without duplicates', async () => {
    const gateway = createFixtureGateway()
    const list = vi.spyOn(gateway, 'listOrganizationThreads').mockImplementation(async (_ctx, query) =>
      query.cursor === undefined
        ? page([row('11', M1, 'First', '2026-10-23T10:00:00Z'), row('21', M2, 'Second', '2026-10-22T10:00:00Z')], 'cursor-2')
        : page([row('21', M2, 'Second', '2026-10-22T10:00:00Z'), row('12', M1, 'Third', '2026-10-21T10:00:00Z')]),
    )
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')])
    const ul = await screen.findByRole('list', { name: 'Conversation list' })
    expect(screen.getByText('1–2+ of 2+')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show more conversations' }))
    await waitFor(() => expect(within(ul).getAllByRole('link')).toHaveLength(3))
    expect(list.mock.calls[1]?.[1]).toEqual({ filter: 'all', cursor: 'cursor-2' })
    expect(within(ul).getAllByRole('link').map((l) => l.textContent)).toEqual([expect.stringContaining('First'), expect.stringContaining('Second'), expect.stringContaining('Third')])
    expect(screen.queryByRole('button', { name: 'Show more conversations' })).toBeNull()
  })

  it('restarts from the first page once when a continuation cursor is rejected', async () => {
    const gateway = createFixtureGateway()
    let reads = 0
    vi.spyOn(gateway, 'listOrganizationThreads').mockImplementation(async (_ctx, query) => {
      reads += 1
      if (query.cursor === 'stale') throw new GatewayError('api', 'cursor_invalid', 'cursor expired', { status: 400 })
      return reads === 1 ? page([row('11', M1, 'Old first page', '2026-10-23T10:00:00Z')], 'stale') : page([row('13', M1, 'Fresh first page', '2026-10-23T11:00:00Z')])
    })
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')])
    fireEvent.click(await screen.findByRole('button', { name: 'Show more conversations' }))
    await screen.findByRole('link', { name: /Fresh first page/ })
    // The reset replaced the accumulated rows instead of appending to them.
    expect(screen.queryByRole('link', { name: /Old first page/ })).toBeNull()
    expect(reads).toBe(3)
  })

  it('stars a row with the row’s own mailbox id and keeps it when the server confirms', async () => {
    const gateway = createFixtureGateway()
    vi.spyOn(gateway, 'listOrganizationThreads').mockResolvedValue(page([row('21', M2, 'Support thread', '2026-10-22T10:00:00Z')]))
    const star = vi.spyOn(gateway, 'setThreadStar').mockResolvedValue({ context_id: 'ctx', authorization_version: 'v1', thread_id: row('21', M2, '', '').id, mailbox_id: M2, starred: true, star_version: 1, updated_at: '2026-10-23T10:00:00Z' })
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')])
    fireEvent.click(await screen.findByRole('button', { name: /^Star Support thread/ }))
    await screen.findByRole('button', { name: /^Unstar Support thread/ })
    expect(star.mock.calls[0]?.[3]).toEqual({ mailbox_id: M2, starred: true })
  })

  it('keeps a star confirmed during "Show more" when the page read finishes afterwards', async () => {
    const gateway = createFixtureGateway()
    let releaseSecondPage: (() => void) | null = null
    vi.spyOn(gateway, 'listOrganizationThreads').mockImplementation(async (_ctx, query) => {
      if (query.cursor === undefined) return page([row('21', M2, 'Support thread', '2026-10-23T10:00:00Z')], 'cursor-2')
      await new Promise<void>((resolve) => {
        releaseSecondPage = resolve
      })
      return page([row('22', M2, 'Older support thread', '2026-10-20T10:00:00Z')])
    })
    vi.spyOn(gateway, 'setThreadStar').mockResolvedValue({ context_id: 'ctx', authorization_version: 'v1', thread_id: '21', mailbox_id: M2, starred: true, star_version: 1, updated_at: '2026-10-23T10:00:00Z' })
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')])
    fireEvent.click(await screen.findByRole('button', { name: 'Show more conversations' }))
    await waitFor(() => expect(releaseSecondPage).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: /^Star Support thread/ }))
    await screen.findByRole('button', { name: /^Unstar Support thread/ })
    releaseSecondPage!()
    await screen.findByRole('link', { name: /Older support thread/ })
    expect(screen.getByRole('button', { name: /^Unstar Support thread/ })).toBeTruthy()
  })

  it('shows an explicit error with retry when the server list fails, and recovers on Try again', async () => {
    const gateway = createFixtureGateway()
    const list = vi
      .spyOn(gateway, 'listOrganizationThreads')
      .mockRejectedValueOnce(new GatewayError('api', 'temporarily_unavailable', 'The list is unavailable.', { status: 503 }))
      .mockResolvedValue(page([row('11', M1, 'Sales thread', '2026-10-23T10:00:00Z')]))
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')])
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('Conversations could not be loaded')
    expect(alert.textContent).toContain('The list is unavailable.')
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: /Sales thread/ })
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('redirects to the mailbox page when only one mailbox is visible', async () => {
    const gateway = createFixtureGateway()
    const list = vi.spyOn(gateway, 'listOrganizationThreads')
    renderUnified(gateway, [mailbox(M1, 'Sales')], '/inbox?filter=starred')
    await screen.findByText('mailbox page')
    expect(screen.getByTestId('location').textContent).toBe(`/mailboxes/${M1}?filter=starred`)
    expect(list).not.toHaveBeenCalled()
  })

  it('moves keyboard focus to a neighbour when a confirmed unstar removes the focused row from Starred', async () => {
    const gateway = createFixtureGateway()
    const first = { ...row('1', M1, 'Keep me', '2026-10-21T10:00:00Z'), starred: true }
    const second = { ...row('2', M2, 'Unstar me', '2026-10-20T10:00:00Z'), starred: true }
    vi.spyOn(gateway, 'listOrganizationThreads').mockResolvedValue(page([first, second]))
    const setStar = vi.spyOn(gateway, 'setThreadStar').mockResolvedValue({ context_id: 'ctx', authorization_version: 'v1', thread_id: '2', mailbox_id: M2, starred: false, star_version: 2, updated_at: '2026-10-23T10:00:00Z' })
    renderUnified(gateway, [mailbox(M1, 'Sales'), mailbox(M2, 'Support')], '/inbox?filter=starred')
    const target = await screen.findByRole('link', { name: /Unstar me/ })
    target.focus()
    fireEvent.keyDown(target, { key: 's' })
    await waitFor(() => expect(screen.queryByRole('link', { name: /Unstar me/ })).toBeNull())
    expect(setStar.mock.calls[0]?.[3]).toEqual({ mailbox_id: M2, starred: false })
    expect(document.activeElement).toBe(screen.getByRole('link', { name: /Keep me/ }))
  })
})
