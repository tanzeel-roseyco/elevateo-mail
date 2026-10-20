// Inbox frame shortcuts (INBOX-SPEC §7): c opens a new draft, / focuses the header search, u
// returns from a thread to the list, and none of them fire while typing in a field.
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { describe, expect, it } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { SessionProvider } from '@/app/session'
import { Shell } from '@/app/Shell'
import { InboxLayout } from './InboxLayout'

function Probe({ label }: { label: string }) {
  const { pathname, search } = useLocation()
  return <p data-testid="probe">{label}:{pathname}{search}</p>
}

function renderAt(entry: string) {
  return render(
    <SessionProvider gateway={createFixtureGateway()}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<Shell />}>
            <Route path="mailboxes/:mailboxId" element={<InboxLayout />}>
              <Route index element={<Probe label="list" />} />
              <Route path="threads/:threadId" element={<Probe label="thread" />} />
              <Route path="drafts/:draftId" element={<Probe label="draft" />} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

describe('inbox layout shortcuts', () => {
  it('u returns from a thread to the list, keeping the folder filter', async () => {
    renderAt(`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}?filter=unread`)
    expect((await screen.findByTestId('probe')).textContent).toContain('thread:')
    await screen.findByRole('navigation', { name: 'Folders' })
    fireEvent.keyDown(document.body, { key: 'u' })
    expect(screen.getByTestId('probe').textContent).toBe(`list:/mailboxes/${CD.mailboxId}?filter=unread`)
  })

  it('c starts a new draft in a composable mailbox and / focuses the search field', async () => {
    renderAt(`/mailboxes/${CD.mailboxId}`)
    await screen.findByRole('navigation', { name: 'Folders' })
    fireEvent.keyDown(document.body, { key: '/' })
    const search = screen.getByRole('searchbox', { name: /Search/ })
    expect(document.activeElement).toBe(search)
    // Typing in the field must not trigger shortcuts.
    fireEvent.keyDown(search, { key: 'c' })
    expect(screen.getByTestId('probe').textContent).toContain('list:')
    search.blur()
    fireEvent.keyDown(document.body, { key: 'c' })
    expect(screen.getByTestId('probe').textContent).toMatch(new RegExp(`^draft:/mailboxes/${CD.mailboxId}/drafts/[^?]+\\?new=1$`))
  })

  it('ignores c in a mailbox without the compose capability', async () => {
    const INBOX = '00000000-0000-4000-8000-000000000021'
    renderAt(`/mailboxes/${INBOX}`)
    await screen.findByRole('navigation', { name: 'Folders' })
    expect(screen.getByRole('button', { name: 'Compose' }).hasAttribute('disabled')).toBe(true)
    fireEvent.keyDown(document.body, { key: 'c' })
    expect(screen.getByTestId('probe').textContent).toBe(`list:/mailboxes/${INBOX}`)
  })
})
