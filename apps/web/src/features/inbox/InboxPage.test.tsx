// FE-R08/R09/R11 and V4: a reset replaces accumulated rows; continuation follows next_cursor, not
// row count; an empty page with a cursor stays usable and distinct from a terminal empty mailbox;
// the unread filter travels into conversation links; duplicates deduplicate; no second automatic
// reset after the traversal's budget is spent; deferred abort-ignoring responses from a previous
// mailbox apply neither success nor failure after navigation (caller-owned post-await ownership).
// D3 resource ownership: the first committed frame of a new mailbox/filter is fresh loading state
// (layout-effect inspection), and a late old-resource failure spends no recovery allowance.
import { useLayoutEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useParams, useSearchParams } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionProvider } from '@/app/session'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { ThreadPage } from '@/data/contract'
import type { MailroomGateway } from '@/data/gateway'
import { InboxPage } from './InboxPage'

const MB = '00000000-0000-4000-8000-000000000021'
const MB2 = '00000000-0000-4000-8000-000000000022'

const cursorInvalid = () => new GatewayError('api', 'cursor_invalid', 'synthetic', { status: 400, requestId: 'r1' })

function threadPage(subjects: string[], nextCursor: string | null): ThreadPage {
  return {
    context_id: 'context_A_0123456789',
    authorization_version: 'authz_A_0123456789',
    mailbox_id: MB,
    next_cursor: nextCursor,
    items: subjects.map((subject) => ({
      // The subject doubles as a stable id: equal subjects model the same thread across pages.
      id: subject,
      mailbox_id: MB,
      subject,
      subject_truncated: false,
      sender: null,
      preview_text: `${subject} preview`,
      last_message_at: '2026-10-12T00:00:00Z',
      unread: false,
      message_count: 1,
    })),
  }
}

/** Fixture gateway with a scripted listThreads sequence; the last entry repeats. */
function pagedGateway(pages: Array<ThreadPage | GatewayError>) {
  const queue = [...pages]
  let readCalls = 0
  const base = createFixtureGateway()
  const gateway: MailroomGateway = {
    ...base,
    listThreads: async () => {
      readCalls += 1
      const entry = queue.length > 1 ? queue.shift()! : queue[0]!
      if (entry instanceof GatewayError) throw entry
      return entry
    },
  }
  return { gateway, readCalls: () => readCalls }
}

function renderInbox(gateway: MailroomGateway, initialEntry = `/mailboxes/${MB}`) {
  return render(
    <SessionProvider gateway={gateway}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/mailboxes/:mailboxId" element={<InboxPage />} />
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

afterEach(() => vi.restoreAllMocks())

describe('URL filter (FE-R11)', () => {
  it('carries the unread filter into conversation links', async () => {
    renderInbox(createFixtureGateway(), `/mailboxes/${MB}?filter=unread`)
    const link = await screen.findByRole('link', { name: /Unknown sender/ })
    expect(link.getAttribute('href')).toContain('?filter=unread')
  })

  it('leaves the default all filter out of conversation links', async () => {
    renderInbox(createFixtureGateway())
    const link = await screen.findByRole('link', { name: /Unknown sender/ })
    expect(link.getAttribute('href')).not.toContain('filter=')
  })
})

describe('denied mailbox navigation', () => {
  it('removes mailbox filter destinations after a gateway denial without another read', async () => {
    const { gateway, readCalls } = pagedGateway([
      new GatewayError('api', 'not_available', 'Mailbox unavailable', { status: 404, requestId: 'r1' }),
    ])
    renderInbox(gateway)
    await screen.findByRole('heading', { name: 'This mailbox is unavailable', level: 2 })
    expect(screen.queryByRole('navigation', { name: 'Filter' })).toBeNull()
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(readCalls()).toBe(1)
  })
})

describe('continuation and reset (FE-R08/R09)', () => {
  it('an empty page with a cursor stays usable and is distinct from a terminal empty mailbox', async () => {
    const { gateway } = pagedGateway([threadPage([], 'c1'), threadPage(['Late arrival'], null)])
    renderInbox(gateway)
    await screen.findByText('Nothing on this page')
    const more = screen.getByRole('button', { name: 'Show more conversations' })
    fireEvent.click(more)
    // Row queries target the link's accessible name: a bare subject regex would also match the
    // "<subject> preview" span and make the text query ambiguous.
    await screen.findByRole('link', { name: /Late arrival/ })
    expect(screen.queryByRole('button', { name: 'Show more conversations' })).toBeNull()
  })

  it('a terminal empty mailbox offers no continuation', async () => {
    renderInbox(createFixtureGateway({ listThreads: 'threads_empty' }))
    await screen.findByText('No conversations')
    expect(screen.queryByRole('button', { name: 'Show more conversations' })).toBeNull()
    expect(screen.getByRole('link', { name: 'All', exact: true }).getAttribute('href')).toBe(`/mailboxes/${MB}`)
    expect(screen.getByRole('link', { name: 'Unread', exact: true }).getAttribute('href')).toBe(`/mailboxes/${MB}?filter=unread`)
  })

  it('a reset replaces accumulated rows with the fresh first page', async () => {
    const { gateway, readCalls } = pagedGateway([
      threadPage(['Stale row'], 'c1'),
      cursorInvalid(),
      threadPage(['Fresh row'], null),
    ])
    renderInbox(gateway)
    await screen.findByRole('link', { name: /Stale row/ })
    fireEvent.click(screen.getByRole('button', { name: 'Show more conversations' }))
    await screen.findByRole('link', { name: /Fresh row/ })
    // The pre-reset accumulation was discarded, not merged under the fresh page (FE-R08): neither
    // its subject nor its preview text remains anywhere.
    expect(screen.queryAllByText(/Stale row/)).toHaveLength(0)
    expect(readCalls()).toBe(3)
  })

  it('a second invalid cursor is not retried automatically; explicit retry starts a new traversal', async () => {
    const { gateway, readCalls } = pagedGateway([
      threadPage(['Page one'], 'c1'),
      cursorInvalid(),
      threadPage(['Reset page'], 'c2'),
      cursorInvalid(), // budget already spent: surfaced as an error, no automatic restart (V4)
      threadPage(['After retry'], null),
    ])
    renderInbox(gateway)
    await screen.findByRole('link', { name: /Page one/ })
    fireEvent.click(screen.getByRole('button', { name: 'Show more conversations' }))
    await screen.findByRole('link', { name: /Reset page/ })
    expect(readCalls()).toBe(3)
    fireEvent.click(screen.getByRole('button', { name: 'Show more conversations' }))
    await screen.findByText('Conversations could not be loaded')
    expect(readCalls()).toBe(4)
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('link', { name: /After retry/ })
    expect(readCalls()).toBe(5)
  })

  it('duplicate summaries across pages are deduplicated by thread id', async () => {
    // 'Repeat' shares its id across both pages, as a concurrently reordered summary would.
    const { gateway } = pagedGateway([threadPage(['Repeat'], 'c1'), threadPage(['Repeat', 'Second'], null)])
    renderInbox(gateway)
    await screen.findByRole('link', { name: /Repeat/ })
    fireEvent.click(screen.getByRole('button', { name: 'Show more conversations' }))
    await screen.findByRole('link', { name: /Second/ })
    await waitFor(() => expect(screen.getAllByText(/Repeat preview/).length).toBe(1))
  })

  it('shows the unavailable state for an absent or inaccessible mailbox', async () => {
    renderInbox(createFixtureGateway({ listThreads: 'not_available' }))
    await screen.findByRole('heading', { name: 'This mailbox is unavailable', level: 2 })
    expect(screen.queryAllByRole('link').filter((link) => link.hasAttribute('data-thread'))).toHaveLength(0)
  })
})

describe('cross-navigation stale outcomes (D4)', () => {
  /** Mailbox A's listThreads stays test-controlled and ignores its abort signal; B answers at once. */
  function renderAThenB(onMailboxA: () => Promise<ThreadPage>, pageB: ThreadPage) {
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      listThreads: async (_context, mailboxId) => (mailboxId === MB ? onMailboxA() : pageB),
    }
    render(
      <SessionProvider gateway={gateway}>
        <MemoryRouter initialEntries={[`/mailboxes/${MB}`]}>
          <Link to={`/mailboxes/${MB2}`}>go to B</Link>
          <Routes>
            <Route path="/mailboxes/:mailboxId" element={<InboxPage />} />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    )
  }

  it('a deferred mailbox-A success that ignored abort cannot replace mailbox-B rows', async () => {
    let resolveA: ((page: ThreadPage) => void) | undefined
    renderAThenB(() => new Promise<ThreadPage>((resolve) => (resolveA = resolve)), threadPage(['B row'], null))
    await waitFor(() => expect(resolveA).toBeDefined()) // A's request is actually pending
    fireEvent.click(screen.getByText('go to B'))
    await screen.findByRole('link', { name: /B row/ })

    await act(async () => resolveA!(threadPage(['A stale row'], 'cA')))
    // Without the success ownership guard, A's late page would replace B's rows and its stale
    // cursor would offer a continuation, while row links point at mailbox B (P1 stale success).
    expect(screen.queryAllByText(/A stale row/)).toHaveLength(0)
    expect(screen.getByRole('link', { name: /B row/ })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Show more conversations' })).toBeNull()
    expect(screen.getByRole('link', { name: /B row/ }).getAttribute('href')).toContain(MB2)
  })

  it('a deferred mailbox-A failure that ignored abort cannot surface an error on mailbox B', async () => {
    let rejectA: ((error: unknown) => void) | undefined
    renderAThenB(() => new Promise<ThreadPage>((_resolve, reject) => (rejectA = reject)), threadPage(['B row'], null))
    await waitFor(() => expect(rejectA).toBeDefined())
    fireEvent.click(screen.getByText('go to B'))
    await screen.findByRole('link', { name: /B row/ })

    await act(async () => rejectA!(new GatewayError('api', 'not_available', 'synthetic', { status: 404, requestId: 'r1' })))
    expect(screen.queryByText('This mailbox is unavailable')).toBeNull()
    expect(screen.queryByText('Conversations could not be loaded')).toBeNull()
    expect(screen.getByRole('link', { name: /B row/ })).toBeTruthy()
  })
})

describe('resource ownership (D3)', () => {
  interface Frame {
    mailboxId: string | undefined
    filter: string | null
    staleRowVisible: boolean
    loadingVisible: boolean
  }

  /** Inspects every committed frame before paint: the DOM a passive-effect reset would miss. */
  function CommitProbe({ frames, staleText }: { frames: Frame[]; staleText: RegExp }) {
    const { mailboxId } = useParams<{ mailboxId: string }>()
    const [searchParams] = useSearchParams()
    useLayoutEffect(() => {
      frames.push({
        mailboxId,
        filter: searchParams.get('filter'),
        // queryAll: the stale subject regex also matches its "<subject> preview" span, and a
        // single-match query would throw inside this layout effect on multiple matches.
        staleRowVisible: screen.queryAllByText(staleText).length > 0,
        loadingVisible: screen.queryByLabelText('Loading conversations') !== null,
      })
    })
    return null
  }

  function renderWithProbe(gateway: MailroomGateway, frames: Frame[], staleText: RegExp, linkTo: string, initialEntry = `/mailboxes/${MB}`) {
    render(
      <SessionProvider gateway={gateway}>
        <MemoryRouter initialEntries={[initialEntry]}>
          <Link to={linkTo}>navigate</Link>
          <Routes>
            <Route
              path="/mailboxes/:mailboxId"
              element={
                <>
                  <InboxPage />
                  <CommitProbe frames={frames} staleText={staleText} />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    )
  }

  it('the first committed frame of a new mailbox never shows loaded previous-mailbox rows', async () => {
    let resolveB: ((page: ThreadPage) => void) | undefined
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      listThreads: async (_context, mailboxId) =>
        mailboxId === MB ? threadPage(['A row'], 'cA') : new Promise<ThreadPage>((resolve) => (resolveB = resolve)),
    }
    const frames: Frame[] = []
    renderWithProbe(gateway, frames, /A row/, `/mailboxes/${MB2}`)
    await screen.findByRole('link', { name: /A row/ }) // mailbox A is fully loaded, not merely pending
    fireEvent.click(screen.getByText('navigate'))
    const firstB = frames.find((frame) => frame.mailboxId === MB2)
    // The very first frame committed under mailbox B's URL must already be fresh loading state:
    // loaded A rows under B's URL (with B-addressed links) is the P2 defect, and a passive-effect
    // reset would only clean up after this frame.
    expect(firstB).toBeDefined()
    expect(firstB!.staleRowVisible).toBe(false)
    expect(firstB!.loadingVisible).toBe(true)
    await waitFor(() => expect(resolveB).toBeDefined())
    await act(async () => resolveB!(threadPage(['B row'], null)))
    await screen.findByRole('link', { name: /B row/ })
    // A's accumulated cursor did not survive into B's traversal.
    expect(screen.queryByRole('button', { name: 'Show more conversations' })).toBeNull()
  })

  it('the first committed frame of a changed filter never shows the previous filter rows', async () => {
    let resolveUnread: ((page: ThreadPage) => void) | undefined
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      listThreads: async (_context, _mailboxId, query) =>
        query.filter === 'unread' ? new Promise<ThreadPage>((resolve) => (resolveUnread = resolve)) : threadPage(['All row'], 'cAll'),
    }
    const frames: Frame[] = []
    renderWithProbe(gateway, frames, /All row/, `/mailboxes/${MB}?filter=unread`)
    await screen.findByRole('link', { name: /All row/ })
    fireEvent.click(screen.getByText('navigate'))
    const firstUnread = frames.find((frame) => frame.filter === 'unread')
    expect(firstUnread).toBeDefined()
    expect(firstUnread!.staleRowVisible).toBe(false)
    expect(firstUnread!.loadingVisible).toBe(true)
    await waitFor(() => expect(resolveUnread).toBeDefined())
    await act(async () => resolveUnread!(threadPage(['Unread row'], null)))
    await screen.findByRole('link', { name: /Unread row/ })
    expect(screen.queryAllByText(/All row/)).toHaveLength(0)
  })

  it('a late continuation failure from a loaded previous mailbox leaks no error and spends no recovery', async () => {
    let rejectA: ((error: unknown) => void) | undefined
    let sessionReads = 0
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      getSession: async (signal) => {
        sessionReads += 1
        return base.getSession(signal)
      },
      listThreads: async (_context, mailboxId, query) => {
        if (mailboxId !== MB) return threadPage(['B row'], null)
        if (query.cursor === undefined) return threadPage(['A row'], 'cA')
        // A's continuation stays test-controlled and ignores its abort signal.
        return new Promise<ThreadPage>((_resolve, reject) => (rejectA = reject))
      },
    }
    const frames: Frame[] = []
    renderWithProbe(gateway, frames, /A row/, `/mailboxes/${MB2}`)
    await screen.findByRole('link', { name: /A row/ })
    fireEvent.click(screen.getByRole('button', { name: 'Show more conversations' }))
    await waitFor(() => expect(rejectA).toBeDefined())
    fireEvent.click(screen.getByText('navigate'))
    await screen.findByRole('link', { name: /B row/ })
    const sessionReadsBefore = sessionReads
    await act(async () => rejectA!(new GatewayError('api', 'context_changed', 'synthetic', { status: 409, requestId: 'r1' })))
    // The stale 409 from A's traversal must not start session recovery for the current context,
    // surface an error on B, or clear B's rows (D2 stale failure, D3 ownership).
    expect(sessionReads).toBe(sessionReadsBefore)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('link', { name: /B row/ })).toBeTruthy()
  })
})
