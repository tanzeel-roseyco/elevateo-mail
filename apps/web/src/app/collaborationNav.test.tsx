// BE-02 C/D shell wiring in the Gmail-structured inbox: capability-gated folders (Drafts for
// compose, Members for manage_members) appear in the mailbox folder column only, the search form
// sits in the inbox header, and the footnote states that drafts and notes are saved on the server.
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { InboxLayout } from '@/features/inbox/InboxLayout'
import { SessionProvider } from './session'
import { Shell } from './Shell'

const INBOX = '00000000-0000-4000-8000-000000000021'

function renderShellAt(entry: string) {
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={<p>outlet-content</p>} />
            <Route path="mailboxes/:mailboxId" element={<InboxLayout />}>
              <Route index element={<p>outlet-content</p>} />
              <Route path="threads/:threadId" element={<p>outlet-content</p>} />
              <Route path="drafts" element={<p>outlet-content</p>} />
            </Route>
            <Route path="mailboxes/:mailboxId/members" element={<p>outlet-content</p>} />
            <Route path="search" element={<p>outlet-content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('collaboration navigation', () => {
  it('shows Drafts and Members folders for the C/D mailbox, plus the search entries', async () => {
    renderShellAt(`/mailboxes/${CD.mailboxId}`)
    const mailbox = await screen.findByRole('link', { name: 'C/D fixture mailbox' })
    expect(mailbox.getAttribute('aria-current')).toBe('page')
    const folders = await screen.findByRole('navigation', { name: 'Folders' })
    expect(within(folders).getByRole('link', { name: 'Inbox' }).getAttribute('aria-current')).toBe('page')
    expect(within(folders).getByRole('link', { name: 'Drafts' }).getAttribute('href')).toBe(`/mailboxes/${CD.mailboxId}/drafts`)
    expect(within(folders).getByRole('link', { name: 'Members' }).getAttribute('href')).toBe(`/mailboxes/${CD.mailboxId}/members`)
    expect(within(screen.getByRole('navigation', { name: 'Mail' })).getByRole('link', { name: 'Search' }).getAttribute('href')).toBe('/search')
    expect(screen.getByRole('search', { name: 'Search mail' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Compose' }).hasAttribute('disabled')).toBe(false)
    expect(screen.getByText('Simulated local mail')).toBeTruthy()
    expect(screen.getByText('Simulation mode: no mail is sent or received. Drafts and notes are saved on the server.')).toBeTruthy()
    expect(screen.getByText('outlet-content')).toBeTruthy()
  })

  it('hides the gated folders and disables Compose for a read-only mailbox', async () => {
    renderShellAt(`/mailboxes/${INBOX}`)
    const inbox = await screen.findByRole('link', { name: 'Fixture inbox' })
    expect(inbox.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'C/D fixture mailbox' })).toBeTruthy()
    const folders = await screen.findByRole('navigation', { name: 'Folders' })
    expect(within(folders).queryByRole('link', { name: 'Drafts' })).toBeNull()
    expect(within(folders).queryByRole('link', { name: 'Members' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Compose' }).hasAttribute('disabled')).toBe(true)
  })

  it('marks only Drafts current and keeps reader navigation ancestors highlighted but unannounced', async () => {
    const drafts = renderShellAt(`/mailboxes/${CD.mailboxId}/drafts`)
    const folders = await screen.findByRole('navigation', { name: 'Folders' })
    expect(within(folders).getByRole('link', { name: 'Drafts' }).getAttribute('aria-current')).toBe('page')
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'C/D fixture mailbox' }).getAttribute('data-current')).toBe('true')
    drafts.unmount()
    renderShellAt(`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`)
    const mailbox = await screen.findByRole('link', { name: 'C/D fixture mailbox' })
    expect(mailbox.getAttribute('data-current')).toBe('true')
    const threadFolders = await screen.findByRole('navigation', { name: 'Folders' })
    expect(within(threadFolders).getByRole('link', { name: 'Inbox' }).getAttribute('data-current')).toBe('true')
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(0)
  })

  it('keeps the mailbox highlighted on the standalone Members page without any folder column', async () => {
    renderShellAt(`/mailboxes/${CD.mailboxId}/members`)
    const mailbox = await screen.findByRole('link', { name: 'C/D fixture mailbox' })
    expect(mailbox.getAttribute('aria-current')).toBeNull()
    expect(mailbox.getAttribute('data-current')).toBe('true')
    expect(screen.queryByRole('navigation', { name: 'Folders' })).toBeNull()
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(0)
  })
})
