// R5: hostile HTML/script/URL/CSS strings display inertly with no remote fetch. R4: zero-message
// conversations render, truncation is visible, and message continuation is a separate control.
// FE-R10/R11: a cursor reset replaces accumulated messages once per traversal, and the back link
// preserves the inbox filter the reader was entered with. D4: an empty page with a cursor is not
// terminal, and a deferred abort-ignoring old-thread response cannot replace the newer thread.
// D3 resource ownership: the first committed frame of a new thread is fresh loading state
// (layout-effect inspection), and a late old-thread failure spends no recovery allowance.
import { useLayoutEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { DraftIntentProvider } from '@/app/draftIntent'
import { MailboxesProvider } from '@/app/mailboxes'
import { DraftEditorPage } from '@/features/drafts/DraftEditorPage'
import { CD_FIXTURE as CD } from '@/data/fixtures/collaborationState'
import { createFixtureGateway, type FixtureScript } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { ThreadDetailPage } from '@/data/contract'
import type { MailroomGateway } from '@/data/gateway'
import { ThreadPage } from './ThreadPage'

const MB = '00000000-0000-4000-8000-000000000021'
const THREAD = '00000000-0000-4000-8000-000000000031'
const THREAD2 = '00000000-0000-4000-8000-000000000032'
const MESSAGE_A = '00000000-0000-4000-8000-000000000041'
const MESSAGE_B = '00000000-0000-4000-8000-000000000042'

function renderReader(script: FixtureScript = {}) {
  return renderReaderWith(createFixtureGateway(script))
}

function renderReaderWith(gateway: MailroomGateway, initialEntry = `/mailboxes/${MB}/threads/${THREAD}`) {
  return render(
    <SessionProvider gateway={gateway}>
      <DraftIntentProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
          <Route path="/mailboxes/:mailboxId/drafts/:draftId" element={<DraftEditorPage />} />
        </Routes>
      </MemoryRouter>
      </DraftIntentProvider>
    </SessionProvider>,
  )
}

const cursorInvalid = () => new GatewayError('api', 'cursor_invalid', 'synthetic', { status: 400, requestId: 'r1' })

function detailPage(bodies: string[], nextCursor: string | null): ThreadDetailPage {
  return {
    context_id: 'context_A_0123456789',
    authorization_version: 'authz_A_0123456789',
    next_cursor: nextCursor,
    thread: { id: THREAD, mailbox_id: MB, subject: 'Paged subject', subject_truncated: false, unread: false, message_count: bodies.length },
    messages: bodies.map((body) => ({
      // The body doubles as a stable id: equal bodies model the same message across pages.
      id: body,
      sender: null,
      to: [],
      sent_at: null,
      body_text: body,
      body_truncated: false,
      attachment_count: 0,
    })),
  }
}

/** Fixture gateway with a scripted getThread sequence; the last entry repeats. */
function pagedGateway(pages: Array<ThreadDetailPage | GatewayError>) {
  const queue = [...pages]
  let readCalls = 0
  const base = createFixtureGateway()
  const gateway: MailroomGateway = {
    ...base,
    getThread: async () => {
      readCalls += 1
      const entry = queue.length > 1 ? queue.shift()! : queue[0]!
      if (entry instanceof GatewayError) throw entry
      return entry
    },
  }
  return { gateway, readCalls: () => readCalls }
}

afterEach(() => vi.restoreAllMocks())

function renderReply(page: ThreadDetailPage, compose = true) {
  const base = createFixtureGateway()
  const gateway: MailroomGateway = { ...base, getThread: async () => page }
  const save = vi.spyOn(gateway, 'saveDraft')
  render(
    <SessionProvider gateway={gateway}>
      <DraftIntentProvider>
        <MailboxesProvider value={{ status: 'ready', mailboxes: [{ id: CD.mailboxId, display_name: 'Team', display_address: null, capabilities: { read: true, compose, approve_send: false, manage_members: false } }] }}>
          <MemoryRouter initialEntries={[`/mailboxes/${CD.mailboxId}/threads/${CD.threadId}`]}>
            <Routes>
              <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
              <Route path="/mailboxes/:mailboxId/drafts/:draftId" element={<DraftEditorPage />} />
            </Routes>
          </MemoryRouter>
        </MailboxesProvider>
      </DraftIntentProvider>
    </SessionProvider>,
  )
  return save
}

function replyPage(sender: ThreadDetailPage['messages'][number]['sender'], truncated = false): ThreadDetailPage {
  return {
    ...detailPage(['Hello'], null),
    thread: { id: CD.threadId, mailbox_id: CD.mailboxId, subject: 'Project update', subject_truncated: truncated, unread: false, message_count: 1 },
    messages: [{ id: '00000000-0000-4000-8000-000000000033', sender, to: [], sent_at: null, body_text: 'Hello', body_truncated: false, attachment_count: 0 }],
  }
}

describe('message reply draft', () => {
  it('prefills the selected sender and subject, then saves only on explicit action', async () => {
    const save = renderReply(replyPage({ display_name: 'Ada', address: 'ada@example.test' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Reply to this sender as draft' }))
    expect(await screen.findByRole('heading', { name: 'New draft' })).toBeTruthy()
    expect((screen.getByLabelText('To') as HTMLTextAreaElement).value).toBe('ada@example.test')
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('Re: Project update')
    expect(save).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByText('Saved version 1')
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]?.[3]).toMatchObject({ reply_to_thread_id: CD.threadId, subject: 'Re: Project update', to: [{ address: 'ada@example.test' }] })
  })

  it('does not offer sender reply without a usable address', async () => {
    renderReply(replyPage({ display_name: 'Unknown', address: null }))
    await screen.findByText('Hello')
    expect(screen.queryByRole('button', { name: 'Reply to this sender as draft' })).toBeNull()
  })

  it('does not turn a line-broken sender field into multiple recipients', async () => {
    renderReply(replyPage({ display_name: 'Untrusted', address: 'ada@example.test\nother@example.test' }))
    await screen.findByText('Hello')
    expect(screen.queryByRole('button', { name: 'Reply to this sender as draft' })).toBeNull()
  })

  it('does not offer sender reply when compose is denied', async () => {
    renderReply(replyPage({ display_name: 'Ada', address: 'ada@example.test' }), false)
    await screen.findByText('Hello')
    expect(screen.queryByRole('button', { name: 'Reply to this sender as draft' })).toBeNull()
  })

  it('does not copy a shortened subject into a new reply', async () => {
    renderReply(replyPage({ display_name: null, address: 'ada@example.test' }, true))
    fireEvent.click(await screen.findByRole('button', { name: 'Reply to this sender as draft' }))
    expect(await screen.findByRole('heading', { name: 'New draft' })).toBeTruthy()
    expect((screen.getByLabelText('Subject') as HTMLInputElement).value).toBe('')
  })
})

describe('plaintext reader', () => {
  it('renders hostile content inertly and performs no network request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const { container } = renderReader({ getThread: 'thread_hostile_plaintext' })
    await screen.findByText(/alert\(1\)/)
    // The script/img/link markup is visible text, not elements; nothing is autolinked or fetched.
    expect(container.querySelector('article script')).toBeNull()
    expect(container.querySelector('article img')).toBeNull()
    expect(container.querySelector('a[href*="example.invalid"]')).toBeNull()
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull()
    expect(screen.getByText('(no subject)')).toBeTruthy()
    expect(screen.getByText('Unknown sender')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('renders a zero-message conversation without indexing the last element', async () => {
    renderReader({ getThread: 'thread_empty' })
    await screen.findByText('No messages')
  })

  it('shows truncation honestly and a separate message continuation control', async () => {
    renderReader({ getThread: 'thread_truncated' })
    await screen.findByText('Message shortened by the server')
    expect(screen.getByRole('button', { name: 'Show more messages' })).toBeTruthy()
  })

  it('shows the same unavailable UI for absent or inaccessible conversations', async () => {
    renderReader({ getThread: 'not_available' })
    await screen.findByText('This conversation is unavailable')
  })
})

describe('individual message permalink', () => {
  it('opens a message link without losing the inbox filter', async () => {
    renderReaderWith(pagedGateway([detailPage([MESSAGE_A], null)]).gateway, `/mailboxes/${MB}/threads/${THREAD}?filter=unread`)
    fireEvent.click(await screen.findByRole('link', { name: 'Open this message' }))
    const selected = await screen.findByLabelText('Selected message')
    expect(selected.textContent).toContain(MESSAGE_A)
    expect(screen.getByRole('link', { name: /Back to conversations/ }).getAttribute('href')).toBe(`/mailboxes/${MB}?filter=unread`)
  })

  it('opens a direct message URL, focuses that message, and preserves the unread back filter', async () => {
    const gateway = pagedGateway([detailPage([MESSAGE_A], null)]).gateway
    renderReaderWith(gateway, `/mailboxes/${MB}/threads/${THREAD}?filter=unread&message=${MESSAGE_A}`)
    const selected = await screen.findByLabelText('Selected message')
    await waitFor(() => expect(document.activeElement).toBe(selected))
    expect(screen.getByRole('link', { name: 'Open this message' }).getAttribute('href')).toContain(`filter=unread&message=${MESSAGE_A}`)
    expect(screen.getByRole('link', { name: /Back to conversations/ }).getAttribute('href')).toBe(`/mailboxes/${MB}?filter=unread`)
  })

  it('keeps a selected later-page message pending until a deliberate bounded continuation', async () => {
    const gateway = pagedGateway([detailPage([MESSAGE_A], 'next'), detailPage([MESSAGE_B], null)]).gateway
    renderReaderWith(gateway, `/mailboxes/${MB}/threads/${THREAD}?message=${MESSAGE_B}`)
    await screen.findByText('This message is on a later page. Show more messages to find it.')
    expect(screen.queryByLabelText('Selected message')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show more messages' }))
    const selected = await screen.findByLabelText('Selected message')
    expect(selected.textContent).toContain(MESSAGE_B)
  })

  it('rejects a malformed message id before any gateway read', async () => {
    const gateway = createFixtureGateway()
    const read = vi.spyOn(gateway, 'getThread')
    renderReaderWith(gateway, `/mailboxes/${MB}/threads/${THREAD}?message=%3Cscript%3E`)
    await screen.findByText('This message is unavailable')
    expect(read).not.toHaveBeenCalled()
  })

  it('shows an unavailable message after the final page and never walks farther', async () => {
    const { gateway, readCalls } = pagedGateway([detailPage([MESSAGE_A], null)])
    renderReaderWith(gateway, `/mailboxes/${MB}/threads/${THREAD}?message=${MESSAGE_B}`)
    await screen.findByText('This message is unavailable in this conversation.')
    expect(readCalls()).toBe(1)
  })

  it('does not reveal message content when the conversation read is denied', async () => {
    renderReaderWith(createFixtureGateway({ getThread: 'not_available' }), `/mailboxes/${MB}/threads/${THREAD}?message=${MESSAGE_A}`)
    await screen.findByText('This conversation is unavailable')
    expect(screen.queryByLabelText('Selected message')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Open this message' })).toBeNull()
  })
})

describe('return filter (FE-R11)', () => {
  it('preserves the unread filter in the back link', async () => {
    renderReaderWith(createFixtureGateway(), `/mailboxes/${MB}/threads/${THREAD}?filter=unread`)
    const back = await screen.findByRole('link', { name: /Back to conversations/ })
    expect(back.getAttribute('href')).toContain(`/mailboxes/${MB}?filter=unread`)
  })

  it('returns to the unfiltered inbox when no filter was carried in', async () => {
    renderReader()
    const back = await screen.findByRole('link', { name: /Back to conversations/ })
    expect(back.getAttribute('href')).not.toContain('filter=')
  })
})

describe('message pagination reset (FE-R10)', () => {
  it('a reset replaces accumulated messages with the fresh first page', async () => {
    const { gateway, readCalls } = pagedGateway([
      detailPage(['Stale message'], 'c1'),
      cursorInvalid(),
      detailPage(['Fresh message'], null),
    ])
    renderReaderWith(gateway)
    await screen.findByText('Stale message')
    fireEvent.click(screen.getByRole('button', { name: 'Show more messages' }))
    await screen.findByText('Fresh message')
    expect(screen.queryByText('Stale message')).toBeNull()
    expect(readCalls()).toBe(3)
  })

  it('an empty message page with a cursor stays usable and is distinct from a terminal empty conversation (D4)', async () => {
    const { gateway } = pagedGateway([detailPage([], 'c1'), detailPage(['Late message'], null)])
    renderReaderWith(gateway)
    await screen.findByText('Nothing on this page')
    expect(screen.queryByText('No messages')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show more messages' }))
    await screen.findByText('Late message')
    expect(screen.queryByRole('button', { name: 'Show more messages' })).toBeNull()
  })

  it('a second invalid cursor needs explicit retry, which starts a fresh traversal', async () => {
    const { gateway, readCalls } = pagedGateway([
      detailPage(['Page one'], 'c1'),
      cursorInvalid(),
      detailPage(['Reset page'], 'c2'),
      cursorInvalid(), // budget spent earlier in this traversal: no automatic restart (V4)
      detailPage(['After retry'], null),
    ])
    renderReaderWith(gateway)
    await screen.findByText('Page one')
    fireEvent.click(screen.getByRole('button', { name: 'Show more messages' }))
    await screen.findByText('Reset page')
    expect(readCalls()).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Show more messages' }))
    await screen.findByText('The conversation could not be loaded')
    expect(readCalls()).toBe(4)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByText('After retry')
    expect(readCalls()).toBe(5)
  })
})

describe('cross-navigation stale success (D4)', () => {
  it('a deferred old-thread response that ignored abort cannot replace the newer thread', async () => {
    // The old thread's getThread stays test-controlled and ignores its abort signal; the thread
    // navigated to answers at once.
    let resolveOld: ((page: ThreadDetailPage) => void) | undefined
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      getThread: async (_context, threadId) =>
        threadId === THREAD
          ? new Promise<ThreadDetailPage>((resolve) => (resolveOld = resolve))
          : detailPage(['New thread message'], null),
    }
    render(
      <SessionProvider gateway={gateway}>
        <DraftIntentProvider>
        <MemoryRouter initialEntries={[`/mailboxes/${MB}/threads/${THREAD}`]}>
          <Link to={`/mailboxes/${MB}/threads/${THREAD2}`}>go to next thread</Link>
          <Routes>
            <Route path="/mailboxes/:mailboxId/threads/:threadId" element={<ThreadPage />} />
          </Routes>
        </MemoryRouter>
        </DraftIntentProvider>
      </SessionProvider>,
    )
    await waitFor(() => expect(resolveOld).toBeDefined()) // the old thread's request is pending
    fireEvent.click(screen.getByText('go to next thread'))
    await screen.findByText('New thread message')

    await act(async () => resolveOld!(detailPage(['Old thread message'], 'cOld')))
    // Without the success ownership guard, the old thread's late page would replace the newer
    // messages and its stale cursor would offer a continuation (P1 stale success).
    expect(screen.queryByText('Old thread message')).toBeNull()
    expect(screen.getByText('New thread message')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show more messages' })).toBeNull()
  })
})

describe('resource ownership (D3)', () => {
  interface Frame {
    threadId: string | undefined
    staleMessageVisible: boolean
    loadingVisible: boolean
  }

  /** Inspects every committed frame before paint: the DOM a passive-effect reset would miss. */
  function CommitProbe({ frames }: { frames: Frame[] }) {
    const { threadId } = useParams<{ threadId: string }>()
    useLayoutEffect(() => {
      frames.push({
        threadId,
        staleMessageVisible: screen.queryByText('Old thread message') !== null,
        loadingVisible: screen.queryByLabelText('Loading conversation') !== null,
      })
    })
    return null
  }

  function renderWithProbe(gateway: MailroomGateway, frames: Frame[]) {
    render(
      <SessionProvider gateway={gateway}>
        <DraftIntentProvider>
        <MemoryRouter initialEntries={[`/mailboxes/${MB}/threads/${THREAD}`]}>
          <Link to={`/mailboxes/${MB}/threads/${THREAD2}`}>go to next thread</Link>
          <Routes>
            <Route
              path="/mailboxes/:mailboxId/threads/:threadId"
              element={
                <>
                  <ThreadPage />
                  <CommitProbe frames={frames} />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
        </DraftIntentProvider>
      </SessionProvider>,
    )
  }

  it('the first committed frame of a new thread never shows the loaded previous conversation', async () => {
    let resolveNew: ((page: ThreadDetailPage) => void) | undefined
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      getThread: async (_context, threadId) =>
        threadId === THREAD
          ? detailPage(['Old thread message'], 'cOld')
          : new Promise<ThreadDetailPage>((resolve) => (resolveNew = resolve)),
    }
    const frames: Frame[] = []
    renderWithProbe(gateway, frames)
    await screen.findByText('Old thread message') // thread A is fully loaded, not merely pending
    fireEvent.click(screen.getByText('go to next thread'))
    const firstNew = frames.find((frame) => frame.threadId === THREAD2)
    // The very first frame committed under thread B's URL must already be fresh loading state:
    // A's subject/messages under B's URL is the P2 defect, and a passive-effect reset would only
    // clean up after this frame.
    expect(firstNew).toBeDefined()
    expect(firstNew!.staleMessageVisible).toBe(false)
    expect(firstNew!.loadingVisible).toBe(true)
    await waitFor(() => expect(resolveNew).toBeDefined())
    await act(async () => resolveNew!(detailPage(['New thread message'], null)))
    await screen.findByText('New thread message')
    // A's accumulated cursor did not survive into B's traversal.
    expect(screen.queryByRole('button', { name: 'Show more messages' })).toBeNull()
  })

  it('a late continuation failure from a loaded previous thread leaks no error and spends no recovery', async () => {
    let rejectOld: ((error: unknown) => void) | undefined
    let sessionReads = 0
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      getSession: async (signal) => {
        sessionReads += 1
        return base.getSession(signal)
      },
      getThread: async (_context, threadId, _mailboxId, query) => {
        if (threadId !== THREAD) return detailPage(['New thread message'], null)
        if (query.cursor === undefined) return detailPage(['Old thread message'], 'cOld')
        // The old thread's continuation stays test-controlled and ignores its abort signal.
        return new Promise<ThreadDetailPage>((_resolve, reject) => (rejectOld = reject))
      },
    }
    const frames: Frame[] = []
    renderWithProbe(gateway, frames)
    await screen.findByText('Old thread message')
    fireEvent.click(screen.getByRole('button', { name: 'Show more messages' }))
    await waitFor(() => expect(rejectOld).toBeDefined())
    fireEvent.click(screen.getByText('go to next thread'))
    await screen.findByText('New thread message')
    const sessionReadsBefore = sessionReads
    await act(async () => rejectOld!(new GatewayError('api', 'context_changed', 'synthetic', { status: 409, requestId: 'r1' })))
    // The stale 409 from the old thread must not start session recovery for the current context,
    // surface an error on the new thread, or clear its messages (D2 stale failure, D3 ownership).
    expect(sessionReads).toBe(sessionReadsBefore)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('New thread message')).toBeTruthy()
  })
})
