// FE-805 production composition: the direct-message capability handed to App reaches Mira's
// ThreadPage on the real thread route. A message URL beyond the loaded first page is resolved by
// one bounded direct read (no cursor walk), a response bound to another mailbox is refused, and a
// revoked session from the direct read clears the protected content through the shared policy.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { ThreadDetailPage } from '@/data/contract'
import type { MailroomGateway } from '@/data/gateway'
import type { DirectMessageRead } from '@/features/thread/ThreadPage'
import { App } from './App'

const MB = '00000000-0000-4000-8000-000000000021'
const OTHER_MB = '00000000-0000-4000-8000-000000000022'
const THREAD = '00000000-0000-4000-8000-000000000031'
const MESSAGE_A = '00000000-0000-4000-8000-000000000041'
const MESSAGE_B = '00000000-0000-4000-8000-000000000042'

function firstPage(): ThreadDetailPage {
  return {
    context_id: 'context_A_0123456789',
    authorization_version: 'authz_A_0123456789',
    next_cursor: 'cursor_next',
    thread: { id: THREAD, mailbox_id: MB, subject: 'Paged subject', subject_truncated: false, unread: false, message_count: 2 },
    messages: [{ id: MESSAGE_A, sender: null, to: [], sent_at: null, body_text: 'First page plaintext', body_truncated: false, attachment_count: 0 }],
  }
}

function directPage(mailboxId = MB) {
  return {
    context_id: 'context_A_0123456789', authorization_version: 'authz_A_0123456789', mailbox_id: mailboxId, thread_id: THREAD,
    message: { id: MESSAGE_B, sender: null, to: [], sent_at: null, body_text: 'Direct plaintext', body_truncated: false, attachment_count: 0 },
  }
}

/** Fixture gateway whose getThread always answers the first page and counts every read. */
function pagedGateway() {
  let readCalls = 0
  const gateway: MailroomGateway = {
    ...createFixtureGateway(),
    getThread: async () => { readCalls += 1; return firstPage() },
  }
  return { gateway, readCalls: () => readCalls }
}

function renderApp(gateway: MailroomGateway, readDirectMessage: DirectMessageRead) {
  // App owns a HashRouter; the deep link is the hash the production host would receive.
  window.location.hash = `#/mailboxes/${MB}/threads/${THREAD}?message=${MESSAGE_B}`
  return render(<App gateway={gateway} featureGateways={{ readDirectMessage }} />)
}

// jsdom has no matchMedia; the Shell drawer breakpoint listener needs this stub.
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, addEventListener: () => {}, removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  window.location.hash = ''
  vi.restoreAllMocks()
})

describe('direct message binding on the thread route (FE-805)', () => {
  it('resolves a message URL beyond the first page with one bounded direct read and no cursor walk (happy path)', async () => {
    const { gateway, readCalls } = pagedGateway()
    const direct = vi.fn<DirectMessageRead>(async () => directPage())
    renderApp(gateway, direct)
    // The full App (session, mailboxes, shell, thread page, direct read) takes ~1.3s on the shared
    // fleet runner; the default 1s wait made this pass/fail with machine load (R6 PASS, R7 FAIL).
    const selected = await screen.findByLabelText('Selected message', {}, { timeout: 5000 })
    expect(selected.textContent).toContain('Direct plaintext')
    expect(direct).toHaveBeenCalledTimes(1)
    expect(direct).toHaveBeenCalledWith(expect.objectContaining({ contextId: expect.any(String) }), MB, THREAD, MESSAGE_B, expect.any(AbortSignal))
    expect(readCalls()).toBe(1)
  })

  it('refuses a direct answer bound to another mailbox and shows the generic unavailable state', async () => {
    const { gateway } = pagedGateway()
    renderApp(gateway, async () => directPage(OTHER_MB))
    await screen.findByText('This message is unavailable in this conversation.')
    expect(screen.queryByText('Direct plaintext')).toBeNull()
  })

  it('a revoked session from the direct read clears the protected content through the shared policy', async () => {
    const { gateway } = pagedGateway()
    const direct = vi.fn<DirectMessageRead>(async () => { throw new GatewayError('api', 'unauthenticated', 'Session ended', { status: 401, requestId: 'r1' }) })
    renderApp(gateway, direct)
    await waitFor(() => expect(direct).toHaveBeenCalledTimes(1))
    // The fixture refresh answers 401, so the single bounded refresh ends at the sign-in form.
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByText('Paged subject')).toBeNull()
    expect(screen.queryByText('First page plaintext')).toBeNull()
    expect(screen.queryByText('Direct plaintext')).toBeNull()
  })
})
