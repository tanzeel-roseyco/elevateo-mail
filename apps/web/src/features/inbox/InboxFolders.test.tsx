// BE-05 folders in the list: archive/spam/delete/snooze/star are confirmed server writes against
// the fixture's collaboration state; a row leaves the view only after the server's answer no
// longer matches it; the other views then show it; bulk actions clear only the rows that
// succeeded; every view is reachable from the phone folder select; shortcuts act on the focused row.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { MailboxesProvider } from '@/app/mailboxes'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import type { MailroomGateway } from '@/data/gateway'
import { InboxPage } from './InboxPage'

const SUBJECT = 'Synthetic thread'

function Location() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function renderCd(gateway: MailroomGateway, entry = `/mailboxes/${CD.mailboxId}`) {
  return render(
    <SessionProvider gateway={gateway}>
      <MailboxesProvider value={{ status: 'ready', mailboxes: [{ id: CD.mailboxId, display_name: 'Team', display_address: null, capabilities: { read: true, compose: false, approve_send: false, manage_members: false } }] }}>
        <MemoryRouter initialEntries={[entry]}>
          <Location />
          <Routes>
            <Route path="/mailboxes/:mailboxId" element={<InboxPage />} />
          </Routes>
        </MemoryRouter>
      </MailboxesProvider>
    </SessionProvider>,
  )
}

const row = async () => screen.findByRole('link', { name: new RegExp(SUBJECT) })
const noRow = () => expect(screen.queryByRole('link', { name: new RegExp(SUBJECT) })).toBeNull()
/** Accessible names carry subject and sender; match on the verb and subject prefix. */
const named = (verb: string) => new RegExp(`^${verb.replace(/[!#]/g, '\\$&')} ${SUBJECT} from `)
const button = (verb: string) => screen.getByRole('button', { name: named(verb) })
const noButton = (verb: string) => expect(screen.queryByRole('button', { name: named(verb) })).toBeNull()
const location = () => screen.getByTestId('location').textContent

afterEach(() => vi.restoreAllMocks())

describe('folder moves', () => {
  it('archives a row only after the server confirms, then shows it in Archive', async () => {
    const gateway = createFixtureGateway()
    const write = vi.spyOn(gateway, 'setThreadFolder')
    const view = renderCd(gateway)
    await row()
    fireEvent.click(button('Archive'))
    await waitFor(() => noRow())
    expect(write).toHaveBeenCalledTimes(1)
    expect(write.mock.calls[0]?.[3]).toEqual({ mailbox_id: CD.mailboxId, folder: 'archive' })
    await screen.findByRole('heading', { name: 'No conversations' })
    view.unmount()
    renderCd(gateway, `/mailboxes/${CD.mailboxId}?filter=archive`)
    await row()
    // Archive offers a restore, never a second archive.
    expect(button('Move to inbox')).toBeTruthy()
    noButton('Archive')
  })

  it('keeps the row and reports the failure when the server rejects the move', async () => {
    const gateway = createFixtureGateway({ setThreadFolder: 'temporarily_unavailable' })
    renderCd(gateway)
    await row()
    fireEvent.click(button('Delete'))
    await screen.findByRole('alert')
    await row()
  })

  it('trash offers only a restore and no snooze', async () => {
    const gateway = createFixtureGateway()
    const view = renderCd(gateway)
    await row()
    fireEvent.click(button('Delete'))
    await waitFor(() => noRow())
    view.unmount()
    renderCd(gateway, `/mailboxes/${CD.mailboxId}?filter=trash`)
    const link = await row()
    const li = link.closest('li')!
    const SENDER = 'Fixture sender'
    expect(within(li).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      `Star ${SUBJECT} from ${SENDER}`, `Restore to inbox ${SUBJECT} from ${SENDER}`, `Mark ${SUBJECT} from ${SENDER} as read`, `Actions for ${SUBJECT} from ${SENDER}`,
    ])
  })

  it('a selected row that fails to move stays selected while confirmed rows are cleared', async () => {
    // Two rows: the fixture thread (succeeds) and a second one the server rejects.
    const OTHER = '00000000-0000-4000-8000-0000000000aa'
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      listThreads: async (...args) => {
        const result = await base.listThreads(...args)
        const first = result.items[0]
        return first === undefined ? result : { ...result, items: [first, { ...first, id: OTHER, subject: 'Other thread' }] }
      },
      // The second thread is unknown to the fixture state, so the server answers 404 for it alone.
    }
    renderCd(gateway)
    await row()
    await screen.findByRole('link', { name: /Other thread/ })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all conversations' }))
    expect(screen.getByText('2 selected')).toBeTruthy()
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Selection actions' })).getByRole('button', { name: 'Archive' }))
    await screen.findByRole('alert')
    await waitFor(() => noRow())
    expect(screen.getByRole('link', { name: /Other thread/ })).toBeTruthy()
    expect(screen.getByText('1 selected')).toBeTruthy()
    expect((screen.getByRole('checkbox', { name: /^Select Other thread/ }) as HTMLInputElement).checked).toBe(true)
  })

  it('a bulk archive clears the selection and empties the inbox view', async () => {
    const gateway = createFixtureGateway()
    renderCd(gateway)
    await row()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all conversations' }))
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Selection actions' })).getByRole('button', { name: 'Archive' }))
    await waitFor(() => noRow())
    expect(screen.queryByRole('toolbar', { name: 'Selection actions' })).toBeNull()
  })
})

describe('stars', () => {
  it('a star is a server write shown as pressed and listed under Starred', async () => {
    const gateway = createFixtureGateway()
    const write = vi.spyOn(gateway, 'setThreadStar')
    const view = renderCd(gateway)
    await row()
    fireEvent.click(button('Star'))
    await screen.findByRole('button', { name: named('Unstar'), pressed: true })
    expect(write.mock.calls[0]?.[3]).toEqual({ mailbox_id: CD.mailboxId, starred: true })
    view.unmount()
    renderCd(gateway, `/mailboxes/${CD.mailboxId}?filter=starred`)
    await row()
    // Unstarring in the Starred view removes the row once the server confirms.
    fireEvent.click(button('Unstar'))
    await waitFor(() => noRow())
  })

  it('the s shortcut stars the focused row', async () => {
    const gateway = createFixtureGateway()
    renderCd(gateway)
    const link = await row()
    act(() => link.focus())
    fireEvent.keyDown(link, { key: 's' })
    await screen.findByRole('button', { name: named('Unstar'), pressed: true })
  })
})

describe('snooze', () => {
  it('a preset snooze moves the row to Snoozed with its return time and offers Remove snooze', async () => {
    const gateway = createFixtureGateway()
    const write = vi.spyOn(gateway, 'setThreadSnooze')
    const view = renderCd(gateway)
    await row()
    fireEvent.click(button('Snooze'))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Tomorrow/ }))
    await waitFor(() => noRow())
    const input = write.mock.calls[0]?.[3]
    expect(input?.mailbox_id).toBe(CD.mailboxId)
    expect(Date.parse(input?.snoozed_until ?? '')).toBeGreaterThan(Date.now())
    view.unmount()
    renderCd(gateway, `/mailboxes/${CD.mailboxId}?filter=snoozed`)
    await row()
    fireEvent.click(button('Remove snooze'))
    await waitFor(() => noRow())
  })
})

describe('view reachability', () => {
  it('the folder select reaches every server view and the URL carries it', async () => {
    renderCd(createFixtureGateway())
    await row()
    const select = screen.getByRole('combobox', { name: 'Folder' }) as HTMLSelectElement
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['all', 'unread', 'starred', 'snoozed', 'archive', 'spam', 'trash'])
    fireEvent.change(select, { target: { value: 'spam' } })
    await screen.findByRole('heading', { name: 'No spam' })
    expect(location()).toBe(`/mailboxes/${CD.mailboxId}?filter=spam`)
  })

  it('the e shortcut archives the focused row, and Archive has no e shortcut', async () => {
    const gateway = createFixtureGateway()
    const view = renderCd(gateway)
    const link = await row()
    act(() => link.focus())
    fireEvent.keyDown(link, { key: 'e' })
    await waitFor(() => noRow())
    view.unmount()
    renderCd(gateway, `/mailboxes/${CD.mailboxId}?filter=archive`)
    const archived = await row()
    const write = vi.spyOn(gateway, 'setThreadFolder')
    act(() => archived.focus())
    fireEvent.keyDown(archived, { key: 'e' })
    await row()
    expect(write).not.toHaveBeenCalled()
  })

  it('the # shortcut does nothing in Trash', async () => {
    const gateway = createFixtureGateway()
    const view = renderCd(gateway)
    const link = await row()
    act(() => link.focus())
    fireEvent.keyDown(link, { key: '#' })
    await waitFor(() => noRow())
    view.unmount()
    renderCd(gateway, `/mailboxes/${CD.mailboxId}?filter=trash`)
    const trashed = await row()
    const write = vi.spyOn(gateway, 'setThreadFolder')
    act(() => trashed.focus())
    fireEvent.keyDown(trashed, { key: '#' })
    await row()
    expect(write).not.toHaveBeenCalled()
    expect(button('Restore to inbox')).toBeTruthy()
  })
})
