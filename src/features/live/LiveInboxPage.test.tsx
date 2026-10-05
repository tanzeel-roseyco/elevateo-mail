import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { LiveInboxPage } from './LiveInboxPage'
import { messageDetail, toMessageBody } from '@/data/http/contract'

// AIDEV-NOTE: Exercise the real reader and boundary while replacing network actions with an isolated account snapshot.
const fixture = vi.hoisted(() => ({ incomplete: false, connected: true, openBody: vi.fn() }))
vi.mock('./MailboxHistoryControls', () => ({ MailboxHistoryControls: () => null }))
vi.mock('./InboxNotifications', () => ({ InboxNotifications: () => null }))
vi.mock('@/data/http/instance', () => ({
  useLive: (select: (state: unknown) => unknown) => select({
    mailboxes: [{ id: 'box', address: 'alice@example.com', connected: fixture.connected, sendEnabled: true }],
    list: null,
    bodies: [{ key: 'box/msg', body: { status: 'ready', data: {
      id: 'msg', mailboxId: 'box', threadId: 'thread', sender: 'bob@example.com', subject: 'Saved subject',
      at: '2026-01-01T00:00:00.000Z', body: 'Saved content', incomplete: fixture.incomplete,
    } } }],
  }),
  live: { openBody: fixture.openBody, openList: vi.fn(), ensureMailbox: vi.fn().mockResolvedValue(undefined) },
}))
beforeEach(() => { fixture.incomplete = false; fixture.connected = true; vi.clearAllMocks() })
function show() {
  return render(<MemoryRouter initialEntries={['/mail/box/msg']}><Routes>
    <Route path="/mail/:mailboxId/:messageId" element={<LiveInboxPage />} />
  </Routes></MemoryRouter>)
}
describe('incomplete imported message', () => {
  it('warns and blocks reply while retaining readable saved text', () => {
    fixture.incomplete = true
    show()
    expect(screen.getByRole('alert')).toHaveTextContent('Saved text may be out of date')
    expect(screen.getByText('Saved content')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled()
  })
  it('allows complete messages to be replied to but retains mailbox permission gates', () => {
    const view = show()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reply' })).toBeEnabled()
    fixture.connected = false
    view.rerender(<MemoryRouter initialEntries={['/mail/box/msg']}><Routes>
      <Route path="/mail/:mailboxId/:messageId" element={<LiveInboxPage />} />
    </Routes></MemoryRouter>)
    expect(screen.getByRole('button', { name: 'Reply' })).toBeDisabled()
  })
  it('defaults older responses to complete and preserves the explicit warning through the adapter', () => {
    const payload = { message: { id: 'msg', mailbox_id: 'box', thread_id: 'thread', sender: 'bob@example.com',
      subject: '', body: '', at: 0 }, contentType: 'text/plain', trust: 'untrusted-email' }
    expect(toMessageBody(messageDetail.parse(payload)).incomplete).toBe(false)
    expect(toMessageBody(messageDetail.parse({ ...payload, incomplete: true })).incomplete).toBe(true)
    expect(messageDetail.safeParse({ ...payload, incomplete: 'true' }).success).toBe(false)
  })
})
