// AIDEV-NOTE: Exercise the shared dashboard through real fixture session and mailbox boundaries.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { SessionProvider } from './session'
import { MailboxesProvider } from './mailboxes'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import type { Mailbox } from '@/data/contract'
import { InboxWorkspace } from './InboxWorkspace'

const MB = '00000000-0000-4000-8000-000000000021'
const OTHER = '00000000-0000-4000-8000-000000000022'
const mailbox = (id: string, compose = true): Mailbox => ({ id, display_name: id === MB ? 'Primary inbox' : 'Second inbox', display_address: null, capabilities: { read: true, compose, approve_send: false, manage_members: false } })
function mount(path: string, mailboxes: Mailbox[]) {
  const gateway = createFixtureGateway()
  const list = vi.spyOn(gateway, 'listThreads')
  render(<SessionProvider gateway={gateway}><MailboxesProvider value={{ status: 'ready', mailboxes }}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<InboxWorkspace />} />
    <Route path="/mailboxes/:mailboxId" element={<InboxWorkspace />} />
    <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<InboxWorkspace><p>Selected conversation content</p></InboxWorkspace>} />
  </Routes></MemoryRouter></MailboxesProvider></SessionProvider>)
  return list
}
describe('unified inbox workspace', () => {
  it('opens the first visible inbox with marketing tools and keeps unread selection in mailbox navigation', async () => {
    const list = mount('/?filter=unread', [mailbox(MB), mailbox(OTHER)])
    await waitFor(() => expect(list).toHaveBeenCalled())
    expect((screen.getByRole('combobox', { name: 'Email account' }) as HTMLSelectElement).value).toBe(MB)
    expect(screen.getByRole('link', { name: '+ New campaign' }).getAttribute('href')).toBe('/outreach/campaigns/new')
    fireEvent.change(screen.getByRole('combobox', { name: 'Email account' }), { target: { value: OTHER } })
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.anything(), OTHER, expect.objectContaining({ filter: 'unread' }), expect.any(AbortSignal)))
  })
  it('does not read a different inbox for an explicit unavailable mailbox', () => {
    const list = mount('/mailboxes/unknown', [mailbox(MB)])
    expect(screen.getByText('This mailbox is unavailable. Choose an account you can access.')).toBeTruthy()
    expect(list).not.toHaveBeenCalled()
    expect(screen.queryByRole('link', { name: 'Open drafts' })).toBeNull()
  })
  it('handles no visible mailboxes without inventing an account or compose action', () => {
    const list = mount('/', [])
    expect(screen.getByText('No mailboxes are visible to you.')).toBeTruthy()
    expect(screen.queryByRole('link', { name: '+ Compose' })).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })
  it('keeps reading and marketing together without exposing drafts for a read-only mailbox', () => {
    mount(`/mailboxes/${MB}/threads/thread`, [mailbox(MB, false)])
    expect(screen.getByText('Selected conversation content')).toBeTruthy()
    expect(screen.getByRole('complementary', { name: 'Marketing workspace' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: '+ Compose' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open drafts' })).toBeNull()
  })
})
