// BE-02 C/D shell wiring: capability-gated sub-links (Drafts for compose, Members for
// manage_members) appear under the active mailbox only, the search entry exists in the header
// form and the sidebar, and the footnote states that drafts and notes stay local.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
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
            <Route path="mailboxes/:mailboxId" element={<p>outlet-content</p>} />
            <Route path="mailboxes/:mailboxId/threads/:threadId" element={<p>outlet-content</p>} />
            <Route path="mailboxes/:mailboxId/drafts" element={<p>outlet-content</p>} />
            <Route path="mailboxes/:mailboxId/members" element={<p>outlet-content</p>} />
            <Route path="search" element={<p>outlet-content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('collaboration navigation', () => {
  it('shows Drafts and Members under the active C/D mailbox, plus the search entries', async () => {
    renderShellAt(`/mailboxes/${CD.mailboxId}`)
    const mailbox = await screen.findByRole('link', { name: 'C/D fixture mailbox' })
    expect(mailbox.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Drafts' }).getAttribute('href')).toBe(`/mailboxes/${CD.mailboxId}/drafts`)
    expect(screen.getByRole('link', { name: 'Members' }).getAttribute('href')).toBe(`/mailboxes/${CD.mailboxId}/members`)
    expect(screen.getByRole('link', { name: 'Search' }).getAttribute('href')).toBe('/search')
    expect(screen.getByRole('search')).toBeTruthy()
    expect(screen.getByText('Simulated local mail')).toBeTruthy()
    expect(screen.getByText('Simulation mode: no mail is sent or received. Drafts and notes are saved on the server.')).toBeTruthy()
  })

  it('hides the sub-links for a read-only mailbox and for inactive mailboxes', async () => {
    renderShellAt(`/mailboxes/${INBOX}`)
    const inbox = await screen.findByRole('link', { name: 'Fixture inbox' })
    expect(inbox.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'C/D fixture mailbox' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Drafts' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Members' })).toBeNull()
  })

  it('marks only Drafts current and keeps reader navigation ancestors unannounced', async () => {
    const drafts = renderShellAt(`/mailboxes/${CD.mailboxId}/drafts`)
    expect((await screen.findByRole('link', { name: 'Drafts' })).getAttribute('aria-current')).toBe('page')
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1)
    drafts.unmount()
    renderShellAt(`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`)
    const mailbox = await screen.findByRole('link', { name: 'C/D fixture mailbox' })
    expect(mailbox.className).toContain('bg-accent-soft')
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(0)
  })

  it('marks only the exact Members destination current and retains mailbox group styling', async () => {
    renderShellAt(`/mailboxes/${CD.mailboxId}/members`)
    const members = await screen.findByRole('link', { name: 'Members' })
    expect(members.getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('link', { name: 'Drafts' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('link', { name: 'C/D fixture mailbox' }).getAttribute('aria-current')).toBeNull()
    expect(screen.getByRole('link', { name: 'C/D fixture mailbox' }).className).toContain('bg-accent-soft')
    expect(document.querySelectorAll('nav [aria-current="page"]')).toHaveLength(1)
  })
})
