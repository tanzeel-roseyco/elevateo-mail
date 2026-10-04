import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { createSeed } from '@/data/seed'
import { useData } from '@/data/store'
import { Toaster } from '@/ui/toast'
import { MailPage } from './MailPage'
import { mailboxLabel } from './MailRows'

const INVOICE = 'Invoice INV-2041 for the September retainer'
const AGREEMENT = 'Flood model data-sharing agreement'

function renderMail(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mail/:folder/:threadId?" element={<MailPage />} />
      </Routes>
      <Toaster />
    </MemoryRouter>,
  )
}

const folderOf = (subject: string) => useData.getState().threads.find((t) => t.subject === subject)!.folder

beforeEach(() => useData.getState().replaceAll(createSeed(Date.now())))

describe('MailPage', () => {
  it('archives the selected conversations and restores them with Undo', async () => {
    renderMail('/mail/inbox?campaign=none')
    await userEvent.click(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` }))
    await userEvent.click(screen.getByRole('checkbox', { name: `Select conversation: ${AGREEMENT}` }))
    await userEvent.click(within(screen.getByRole('toolbar', { name: 'Bulk actions' })).getByRole('button', { name: 'Archive' }))

    expect(folderOf(INVOICE)).toBe('archive')
    expect(folderOf(AGREEMENT)).toBe('archive')
    expect(screen.queryByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(folderOf(INVOICE)).toBe('inbox')
    expect(folderOf(AGREEMENT)).toBe('inbox')
  })

  it('does not show a conversation under a folder it is no longer in, and links to where it is', () => {
    const moved = useData.getState().threads.find((t) => t.subject === INVOICE)!
    useData.getState().patchThreads([moved.id], { folder: 'archive' })
    renderMail(`/mail/inbox/${moved.id}`)
    expect(screen.getByText('This conversation is not in Inbox')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: INVOICE })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open it in Archive' })).toHaveAttribute('href', `/mail/archive/${moved.id}`)
  })

  it('filters drafts when the search box is typed into and restores them when cleared', async () => {
    const base = { identityId: 'lachlan@boltloop.co', to: [], cc: [], bcc: [], body: '', attachments: [], campaignId: null, threadId: null, banner: false, updatedAt: new Date().toISOString() }
    useData.getState().upsertDraft({ ...base, id: 'd-a', subject: 'Zebra budget review' })
    useData.getState().upsertDraft({ ...base, id: 'd-b', subject: 'Holiday rota', to: ['quentin@zebra.example'] })
    useData.getState().upsertDraft({ ...base, id: 'd-c', subject: 'Unrelated note' })
    renderMail('/mail/drafts')
    const search = screen.getByRole('searchbox', { name: 'Search mail by sender, recipient, subject, or content' })
    await userEvent.type(search, 'zebra')
    expect(screen.getByText('Zebra budget review')).toBeInTheDocument()
    expect(screen.getByText('Holiday rota')).toBeInTheDocument()
    expect(screen.queryByText('Unrelated note')).not.toBeInTheDocument()
    await userEvent.clear(search)
    expect(screen.getByText('Unrelated note')).toBeInTheDocument()
  })

  it('shows an empty state, and no bulk actions, for an empty folder', () => {
    renderMail('/mail/trash')
    expect(screen.getByRole('heading', { name: 'Nothing in Trash' })).toBeInTheDocument()
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('switches mailbox from the rail, keeps that scope on folder links, and removes it with the chip', async () => {
    renderMail('/mail/inbox')
    await userEvent.click(within(screen.getByRole('navigation', { name: 'Mailboxes' })).getByRole('link', { name: /^flooda\.co/ }))

    expect(screen.getByRole('checkbox', { name: `Select conversation: ${AGREEMENT}` })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Mail folders' })).getByRole('link', { name: /^Sent/ })).toHaveAttribute('href', '/mail/sent?domain=flooda.co')

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Mailbox: flooda.co' }))
    expect(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).toBeInTheDocument()
  })

  it('counts folder badges inside the selected mailbox scope, matching what the folder link opens', () => {
    const { threads } = useData.getState()
    const unreadInbox = threads.filter((t) => t.folder === 'inbox' && t.unread)
    const inFlooda = unreadInbox.filter((t) => t.identityId.endsWith('@flooda.co')).length
    // The seed must make the scoped and unscoped numbers differ, or this test would prove nothing.
    expect(inFlooda).toBeLessThan(unreadInbox.length)

    renderMail('/mail/inbox?domain=flooda.co&q=ignored-by-badges')
    const folders = within(screen.getByRole('navigation', { name: 'Mail folders' }))
    expect(folders.getByRole('link', { name: /^Inbox/ })).toHaveTextContent(inFlooda > 0 ? new RegExp(`^Inbox${inFlooda} unread$`) : /^Inbox$/)
    // The only seeded draft belongs to an elevateoco.com address, so the flooda.co scope has none.
    expect(folders.getByRole('link', { name: /^Drafts/ })).toHaveTextContent(/^Drafts$/)
  })

  it('labels each row with a mailbox name that is distinct for every address, including two on one domain', () => {
    const { threads, identities } = useData.getState()
    expect(new Set(identities.map((i) => mailboxLabel(i.id))).size).toBe(identities.length)
    expect(mailboxLabel('lachlan@boltloop.co')).toBe('lachlan@boltloop')
    expect(mailboxLabel('l.macdonald@boltloop.co')).toBe('l.macdonald@boltloop')
    expect(mailboxLabel('not-an-address')).toBe('not-an-address')

    const invoice = threads.find((t) => t.subject === INVOICE)!
    renderMail('/mail/inbox?campaign=none')
    expect(screen.getByRole('link', { name: new RegExp(INVOICE) })).toHaveTextContent(mailboxLabel(invoice.identityId))
  })

  it('drops ticked rows when the mailbox changes, so they do not reappear selected once the filter is removed', async () => {
    renderMail('/mail/inbox')
    await userEvent.click(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` }))
    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toBeInTheDocument()

    await userEvent.click(within(screen.getByRole('navigation', { name: 'Mailboxes' })).getByRole('link', { name: /^flooda\.co/ }))
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter: Mailbox: flooda.co' }))
    expect(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).not.toBeChecked()
    expect(screen.queryByRole('toolbar', { name: 'Bulk actions' })).not.toBeInTheDocument()
  })

  it('keeps ticked rows while a conversation is opened and closed', async () => {
    const open = useData.getState().threads.find((t) => t.subject === AGREEMENT)!
    renderMail('/mail/inbox?campaign=none')
    await userEvent.click(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` }))
    await userEvent.click(screen.getByRole('link', { name: new RegExp(AGREEMENT) }))
    expect(screen.getByRole('heading', { name: open.subject })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to list' }))
    expect(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).toBeChecked()
  })

  it('links the open conversation to its older neighbour without dropping the list filters', () => {
    const open = useData.getState().threads.find((t) => t.subject === AGREEMENT)!
    const older = useData.getState().threads.find((t) => t.subject === INVOICE)!
    // AIDEV-NOTE: Deliberately control order so an arbitrary or self-referential neighbour link cannot pass.
    useData.setState({ threads: [open, older].map((thread, index) => ({
      ...thread,
      messages: thread.messages.map((message) => ({ ...message, at: index === 0 ? '2026-10-04T12:00:00.000Z' : '2026-10-03T12:00:00.000Z' })),
    })) })
    renderMail(`/mail/inbox/${open.id}?campaign=none`)
    expect(screen.getByRole('heading', { name: AGREEMENT })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Older conversation' })).toHaveAttribute('href', `/mail/inbox/${older.id}?campaign=none`)
  })

  it('hides the neighbour links when the open conversation is outside the filtered list', () => {
    const open = useData.getState().threads.find((t) => t.subject === AGREEMENT)!
    renderMail(`/mail/inbox/${open.id}?q=zzzz-no-such-message`)
    expect(screen.getByRole('heading', { name: AGREEMENT })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Older conversation' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Newer conversation' })).not.toBeInTheDocument()
  })

  it('offers Clear filters when a search matches nothing', async () => {
    renderMail('/mail/inbox?q=zzzz-no-such-message')
    expect(screen.getByRole('heading', { name: 'No conversations match' })).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0]!)
    expect(screen.getByRole('checkbox', { name: `Select conversation: ${INVOICE}` })).toBeInTheDocument()
  })
})
