// FE-R05/R06/R07 and V3/V4: the keyed protected subtree starts a replaced identity with no old
// content in its first committed render (layout-effect evidence, not eventual DOM); the mailbox
// loop holds one reset for the entire traversal; the drawer is a real dialog that closes on route
// selection, Escape and growth past the md breakpoint. Playwright covers real key traversal.
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFixtureGateway } from '@/data/fixtures/fixtureGateway'
import { GatewayError } from '@/data/errors'
import type { MailboxPage } from '@/data/contract'
import type { MailroomGateway } from '@/data/gateway'
import { SESSION_FRESHNESS_INTERVAL_MS, SessionProvider } from './session'
import { Shell } from './Shell'

const contextChanged = () => new GatewayError('api', 'context_changed', 'synthetic', { status: 409, requestId: 'r1' })
const cursorInvalid = () => new GatewayError('api', 'cursor_invalid', 'synthetic', { status: 400, requestId: 'r1' })

function mailboxPage(names: string[], nextCursor: string | null): MailboxPage {
  return {
    context_id: 'context_A_0123456789',
    authorization_version: 'authz_A_0123456789',
    next_cursor: nextCursor,
    items: names.map((name, index) => ({
      id: `00000000-0000-4000-8000-00000000006${index + 1}`,
      display_name: name,
      display_address: `${name.toLowerCase().replaceAll(' ', '-')}@example.test`,
      capabilities: { read: true, compose: false, approve_send: false, manage_members: false },
    })),
  }
}

/** Fixture gateway with a scripted listMailboxes sequence; the last entry repeats. */
function pagedGateway(pages: Array<MailboxPage | GatewayError>) {
  const queue = [...pages]
  let readCalls = 0
  const base = createFixtureGateway()
  const gateway: MailroomGateway = {
    ...base,
    listMailboxes: async () => {
      readCalls += 1
      const entry = queue.length > 1 ? queue.shift()! : queue[0]!
      if (entry instanceof GatewayError) throw entry
      return entry
    },
  }
  return { gateway, readCalls: () => readCalls }
}

function renderShell(gateway: MailroomGateway, outlet = <p>outlet-content</p>) {
  return render(
    <SessionProvider gateway={gateway}>
      <MemoryRouter>
        <Routes>
          <Route element={<Shell />}>
            <Route index element={outlet} />
          </Route>
        </Routes>
      </MemoryRouter>
    </SessionProvider>,
  )
}

// jsdom has no matchMedia; the stub below drives the drawer's breakpoint close (FE-R06).
let mediaMatches = false
let mediaListeners: Array<(event: { matches: boolean }) => void> = []
beforeEach(() => {
  mediaMatches = false
  mediaListeners = []
  window.matchMedia = ((query: string) => ({
    matches: mediaMatches,
    media: query,
    addEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      mediaListeners.push(listener)
    },
    removeEventListener: (_type: string, listener: (event: { matches: boolean }) => void) => {
      mediaListeners = mediaListeners.filter((l) => l !== listener)
    },
  })) as unknown as typeof window.matchMedia
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('session gate', () => {
  it('shows the ready shell with the fixture mailboxes and outlet content', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    await screen.findByRole('link', { name: 'Fixture inbox' })
    expect(screen.getByText('outlet-content')).toBeTruthy()
    expect(screen.getByText('Simulated local mail')).toBeTruthy()
  })

  it('hides protected content and shows a recovery status while the one recovery runs', async () => {
    let release!: () => void
    let sessionCalls = 0
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...pagedGateway([contextChanged(), mailboxPage(['Recovered inbox'], null)]).gateway,
      getSession: async (signal) => {
        sessionCalls += 1
        if (sessionCalls > 1) await new Promise<void>((resolve) => (release = resolve))
        return base.getSession(signal)
      },
    }
    renderShell(gateway)
    // The mailbox loop's canonical 409 consumes the allowance and starts recovery.
    await screen.findByRole('status', { name: 'Restoring session' })
    expect(screen.queryByText('Synthetic organization A')).toBeNull()
    expect(screen.queryByText('outlet-content')).toBeNull()
    act(() => release())
    await screen.findByRole('link', { name: 'Recovered inbox' })
  })

  it('a second context change blocks in retry_required until the explicit retry', async () => {
    let sessionCalls = 0
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...createFixtureGateway(),
      getSession: (signal) => {
        sessionCalls += 1
        return base.getSession(signal)
      },
      listMailboxes: async () => {
        throw contextChanged() // every traversal 409s: bootstrap, recovery, and after retry
      },
    }
    renderShell(gateway)
    await screen.findByText('Your access changed again')
    expect(sessionCalls).toBe(2) // bootstrap + exactly one recovery
    expect(screen.queryByText('outlet-content')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(sessionCalls).toBe(3)) // explicit retry starts a new attempt
  })
})

describe('mailbox traversal', () => {
  it('one invalid continuation cursor resets the whole loop and replaces accumulated mailboxes', async () => {
    const { gateway, readCalls } = pagedGateway([
      mailboxPage(['Stale first page'], 'c1'),
      cursorInvalid(),
      mailboxPage(['Fresh first page'], 'c2'),
      mailboxPage(['Fresh second page'], null),
    ])
    renderShell(gateway)
    await screen.findByRole('link', { name: 'Fresh first page' })
    expect(screen.getByRole('link', { name: 'Fresh second page' })).toBeTruthy()
    // The page accumulated before the reset was discarded, not merged (D4).
    expect(screen.queryByRole('link', { name: 'Stale first page' })).toBeNull()
    expect(readCalls()).toBe(4)
  })

  it('a second invalid cursor surfaces manual retry, and retrying starts a fresh traversal', async () => {
    const { gateway, readCalls } = pagedGateway([
      mailboxPage(['Page one'], 'c1'),
      cursorInvalid(),
      mailboxPage(['Reset page one'], 'c2'),
      cursorInvalid(), // the loop's only reset is spent: no second automatic restart (V4)
      mailboxPage(['After manual retry'], null),
    ])
    renderShell(gateway)
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(readCalls()).toBe(4)
    fireEvent.click(retry) // explicit retry owns a fresh one-reset budget
    await screen.findByRole('link', { name: 'After manual retry' })
    expect(readCalls()).toBe(5)
  })
})

describe('mobile drawer', () => {
  it('opens as a named dialog, closes on route selection, Escape restores trigger focus', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    const trigger = screen.getByRole('button', { name: 'Open mailbox menu' })

    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Mailboxes' })
    // While the modal is open only the drawer copy is accessible; the desktop rail copy sits in
    // the aria-hidden background and must not surface in accessible queries.
    const drawerLink = within(dialog).getByRole('link', { name: 'Fixture inbox' })
    const accessibleLinks = screen.getAllByRole('link', { name: 'Fixture inbox' })
    expect(accessibleLinks).toHaveLength(1)
    expect(accessibleLinks[0]).toBe(drawerLink)
    // The DOM deliberately keeps both copies (desktop rail plus drawer): hidden: true counts them.
    expect(screen.getAllByRole('link', { name: 'Fixture inbox', hidden: true }).length).toBeGreaterThan(1)

    // Route selection inside the drawer closes it (D6).
    fireEvent.click(drawerLink)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mailboxes' })).toBeNull())

    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Mailboxes' })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mailboxes' })).toBeNull())
    // Dismissal restores focus to the trigger (D6); real-browser proof lives in e2e/read.spec.ts.
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('growing past the md breakpoint closes an open drawer', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    fireEvent.click(screen.getByRole('button', { name: 'Open mailbox menu' }))
    await screen.findByRole('dialog', { name: 'Mailboxes' })
    act(() => {
      mediaMatches = true
      mediaListeners.forEach((listener) => listener({ matches: true }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mailboxes' })).toBeNull())
  })
})

describe('identity replacement privacy (V3)', () => {
  it('the first committed render of a replaced identity contains no previous-identity content', async () => {
    vi.useFakeTimers()
    const commits: string[] = []
    function CommitProbe() {
      // Snapshot the committed DOM at layout time: eventual-DOM assertions cannot prove what the
      // first frame of the new identity showed (dispatch V3 requirement).
      useLayoutEffect(() => {
        commits.push(document.body.textContent ?? '')
      })
      return <p>outlet-content</p>
    }
    let sessionCalls = 0
    const gateway: MailroomGateway = {
      ...createFixtureGateway(),
      getSession: (signal) => {
        sessionCalls += 1
        const name = sessionCalls === 1 ? 'session_a' : 'session_b'
        return createFixtureGateway({ getSession: name }).getSession(signal)
      },
    }
    renderShell(gateway, <CommitProbe />)
    await act(async () => {})
    expect(screen.getByText('Synthetic organization A')).toBeTruthy()
    await act(async () => {})
    expect(screen.getByText('Fixture inbox')).toBeTruthy()

    await act(async () => {
      vi.advanceTimersByTime(SESSION_FRESHNESS_INTERVAL_MS) // freshness returns session B
    })
    await act(async () => {})
    expect(screen.getByText('Synthetic organization B')).toBeTruthy()

    const firstB = commits.findIndex((text) => text.includes('Synthetic organization B'))
    expect(firstB).toBeGreaterThan(0)
    // No committed frame ever mixed both identities, and A never reappears after B commits.
    for (const text of commits.slice(firstB)) {
      expect(text).not.toContain('Synthetic organization A')
      expect(text).not.toContain('Fixture user A')
    }
    // The replacement's first frame starts from fresh mailbox state, not A's loaded rail.
    expect(commits[firstB]).not.toContain('Fixture inbox')
  })
})
