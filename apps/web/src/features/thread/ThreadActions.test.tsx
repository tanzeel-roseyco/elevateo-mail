// Reader actions backed by BE-05 and the draft API: Reply all and Forward start drafts built by
// the pure domain module (own address excluded, truncated subject never reused, forward unthreaded);
// archive/snooze return to the list view the person came from only after the server confirms;
// the star is a server write reflected from the answer.
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { MailboxesProvider } from '@/app/mailboxes'
import { DraftIntentProvider } from '@/app/draftIntent'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import type { ThreadDetailPage } from '@/data/contract'
import type { MailroomGateway } from '@/data/gateway'
import { DraftEditorPage } from '@/features/drafts/DraftEditorPage'
import { ThreadPage } from './ThreadPage'

const OWN = 'team@example.test'

function Location() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

function page(overrides: Partial<ThreadDetailPage['thread']> = {}): ThreadDetailPage {
  return {
    context_id: 'context_A_0123456789',
    authorization_version: 'authz_A_0123456789',
    next_cursor: null,
    thread: { id: CD.threadId, mailbox_id: CD.mailboxId, subject: 'Project update', subject_truncated: false, unread: false, message_count: 1, folder: 'inbox', snoozed_until: null, starred: false, ...overrides },
    messages: [{
      id: '00000000-0000-4000-8000-000000000033',
      sender: { display_name: 'Ada', address: 'ada@example.test' },
      to: [{ display_name: 'Team', address: OWN }, { display_name: null, address: 'bob@example.test' }, { display_name: 'Ada again', address: 'ADA@example.test' }],
      sent_at: '2026-10-12T10:00:00Z',
      body_text: 'Hello from Ada',
      body_truncated: false,
      attachment_count: 0,
    }],
  }
}

function renderReader(detail: ThreadDetailPage, entry = `/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`) {
  const base = createFixtureGateway()
  const gateway: MailroomGateway = { ...base, getThread: async () => detail }
  const save = vi.spyOn(gateway, 'saveDraft')
  render(
    <SessionProvider gateway={gateway}>
      <DraftIntentProvider>
        <MailboxesProvider value={{ status: 'ready', mailboxes: [{ id: CD.mailboxId, display_name: 'Team', display_address: OWN, capabilities: { read: true, compose: true, approve_send: false, manage_members: false } }] }}>
          <MemoryRouter initialEntries={[entry]}>
            <Location />
            <Routes>
              <Route path="/mailboxes/:mailboxId" element={<p>List view</p>} />
              <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
              <Route path="/mailboxes/:mailboxId/drafts/:draftId" element={<DraftEditorPage />} />
            </Routes>
          </MemoryRouter>
        </MailboxesProvider>
      </DraftIntentProvider>
    </SessionProvider>,
  )
  return { gateway, save }
}

const location = () => screen.getByTestId('location').textContent ?? ''

afterEach(() => vi.restoreAllMocks())

describe('reply all and forward drafts', () => {
  it('reply all addresses the sender and recipients once each, without the mailbox address', async () => {
    const { save } = renderReader(page())
    fireEvent.click(await screen.findByRole('button', { name: 'Reply all as draft' }))
    await screen.findByRole('heading', { name: 'New draft' })
    const to = (screen.getByLabelText('To') as HTMLTextAreaElement).value
    expect(to).toContain('ada@example.test')
    expect(to).toContain('bob@example.test')
    expect(to).not.toContain(OWN)
    expect(to.match(/ada@example\.test/gi)).toHaveLength(1)
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Re: Project update')
    expect(location()).toContain(`reply_to=${CD.threadId}`)
    expect(save).not.toHaveBeenCalled()
  })

  it('forward quotes the message in plaintext, leaves recipients empty and is not threaded as a reply', async () => {
    renderReader(page())
    fireEvent.click(await screen.findByRole('button', { name: 'Forward as draft' }))
    await screen.findByRole('heading', { name: 'New draft' })
    expect((screen.getByLabelText('To') as HTMLTextAreaElement).value).toBe('')
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Fwd: Project update')
    const body = (screen.getByLabelText('Message') as HTMLTextAreaElement).value
    expect(body).toContain('---------- Forwarded message ----------')
    expect(body).toContain('From: Ada <ada@example.test>')
    expect(body).toContain('Hello from Ada')
    expect(location()).not.toContain('reply_to=')
  })

  it('a shortened subject is not reused by forward', async () => {
    renderReader(page({ subject_truncated: true }))
    fireEvent.click(await screen.findByRole('button', { name: 'Forward as draft' }))
    await screen.findByRole('heading', { name: 'New draft' })
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain('Subject: (no subject)')
  })
})

describe('reply all and forward without a usable sender', () => {
  const senderless = (): ThreadDetailPage => {
    const detail = page()
    return { ...detail, messages: [{ ...detail.messages[0]!, sender: null }] }
  }

  it('forward acts on the newest message even when it has no sender', async () => {
    renderReader(senderless())
    fireEvent.click(await screen.findByRole('button', { name: 'Forward as draft' }))
    await screen.findByRole('heading', { name: 'New draft' })
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toContain('Hello from Ada')
  })

  it('reply all uses the recipient list when the sender is unusable; plain reply stays disabled', async () => {
    renderReader(senderless())
    await screen.findByText('Hello from Ada')
    expect((screen.getByRole('button', { name: 'Reply as draft' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Reply all as draft' }))
    await screen.findByRole('heading', { name: 'New draft' })
    const to = (screen.getByLabelText('To') as HTMLTextAreaElement).value
    expect(to).toContain('bob@example.test')
    expect(to).not.toContain(OWN)
  })
})

describe('folder, snooze and star from the reader', () => {
  it('stays on the reader while the move is pending and leaves only once the server confirms', async () => {
    const base = createFixtureGateway()
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => { release = resolve })
    const gateway: MailroomGateway = {
      ...base,
      getThread: async () => page(),
      setThreadFolder: async (...args) => { await gate; return base.setThreadFolder(...args) },
    }
    render(
      <SessionProvider gateway={gateway}>
        <DraftIntentProvider>
          <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}?filter=unread`]}>
            <Location />
            <Routes>
              <Route path="/mailboxes/:mailboxId" element={<p>List view</p>} />
              <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
            </Routes>
          </MemoryRouter>
        </DraftIntentProvider>
      </SessionProvider>,
    )
    await screen.findByText('Hello from Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    // Pending: nothing optimistic happened.
    await waitFor(() => expect((screen.getByRole('button', { name: 'Archive' }) as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText('Hello from Ada')).toBeTruthy()
    expect(location()).toBe(`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}?filter=unread`)
    release()
    await screen.findByText('List view')
    expect(location()).toBe(`/mailboxes/${CD.mailboxId}?filter=unread`)
  })

  it('a deep link to a trashed thread offers only a restore even without ?filter=trash', async () => {
    renderReader(page({ folder: 'trash' }))
    await screen.findByText('Hello from Ada')
    expect(screen.getByRole('button', { name: 'Restore to inbox' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Snooze' })).toBeNull()
  })

  it('archive returns to the list view the person came from after the server confirms', async () => {
    const { gateway } = renderReader(page(), `/mailboxes/${CD.mailboxId}/threads/${CD.threadId}?filter=unread`)
    const write = vi.spyOn(gateway, 'setThreadFolder')
    await screen.findByText('Hello from Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    await screen.findByText('List view')
    expect(location()).toBe(`/mailboxes/${CD.mailboxId}?filter=unread`)
    expect(write.mock.calls[0]?.[3]).toEqual({ mailbox_id: CD.mailboxId, folder: 'archive' })
  })

  it('a rejected move keeps the reader open and reports the failure', async () => {
    const base = createFixtureGateway({ setThreadFolder: 'temporarily_unavailable' })
    const gateway: MailroomGateway = { ...base, getThread: async () => page() }
    render(
      <SessionProvider gateway={gateway}>
        <DraftIntentProvider>
          <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`]}>
            <Routes>
              <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
            </Routes>
          </MemoryRouter>
        </DraftIntentProvider>
      </SessionProvider>,
    )
    await screen.findByText('Hello from Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByRole('alert')
    expect(screen.getByText('Hello from Ada')).toBeTruthy()
  })

  it('trash offers restore only, and the star reflects the server answer', async () => {
    renderReader(page({ folder: 'trash' }), `/mailboxes/${CD.mailboxId}/threads/${CD.threadId}?filter=trash`)
    await screen.findByText('Hello from Ada')
    expect(screen.getByRole('button', { name: 'Restore to inbox' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Snooze' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Star' }))
    await screen.findByRole('button', { name: 'Unstar', pressed: true })
  })

  it('a snooze preset returns to the list after the server confirms', async () => {
    const { gateway } = renderReader(page())
    const write = vi.spyOn(gateway, 'setThreadSnooze')
    await screen.findByText('Hello from Ada')
    fireEvent.click(screen.getByRole('button', { name: 'Snooze' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: /^Tomorrow/ }))
    await waitFor(() => expect(location()).toBe(`/mailboxes/${CD.mailboxId}`))
    expect(Date.parse(write.mock.calls[0]?.[3]?.snoozed_until ?? '')).toBeGreaterThan(Date.now())
  })
})
