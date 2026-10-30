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

// A stable id per distinct name: equal names model the same mailbox across pages, while distinct
// names never collide across pages (a per-page index would alias them and dedup would drop rows).
const mailboxIdByName = new Map<string, string>()
function mailboxIdFor(name: string): string {
  let id = mailboxIdByName.get(name)
  if (id === undefined) {
    id = `00000000-0000-4000-8000-${String(mailboxIdByName.size + 61).padStart(12, '0')}`
    mailboxIdByName.set(name, id)
  }
  return id
}

function mailboxPage(names: string[], nextCursor: string | null): MailboxPage {
  return {
    context_id: 'context_A_0123456789',
    authorization_version: 'authz_A_0123456789',
    next_cursor: nextCursor,
    items: names.map((name) => ({
      id: mailboxIdFor(name),
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
            {/* Sidebar/drawer links target mailbox routes; without this route a drawer selection
                would leave the Shell's route tree and unmount the whole shell under test. */}
            <Route path="mailboxes/:mailboxId" element={outlet} />
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

describe('BE-02A session controls', () => {
  it('a signed-out session shows the sign-in form instead of a terminal screen', async () => {
    renderShell(createFixtureGateway({ getSession: 'unauthenticated' }))
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.queryByText('Simulated local mail')).toBeNull()
    expect(screen.queryByText('outlet-content')).toBeNull()
  })

  it('signing in from the form reaches the protected shell', async () => {
    renderShell(createFixtureGateway({ getSession: 'unauthenticated' }))
    fireEvent.change(await screen.findByLabelText('Email address'), { target: { value: 'a@example.test' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText('Synthetic organization A')
    expect(screen.getByText('outlet-content')).toBeTruthy()
  })

  it('a valid identity without an organization is an explicit state with sign-out', async () => {
    renderShell(createFixtureGateway({ getSession: 'not_available' }))
    await screen.findByText('No organization is available')
    expect(screen.queryByText('outlet-content')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('heading', { name: 'Sign in' })
  })

  it('the account sheet lists memberships and an explicit switch replaces the identity', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    fireEvent.click(screen.getByRole('button', { name: 'Account and sign-out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Account' })
    expect(within(dialog).getByText('Fixture user A')).toBeTruthy()
    const current = await within(dialog).findByRole('button', { name: /Synthetic organization A/ })
    expect(current.getAttribute('aria-current')).toBe('true')
    expect((current as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: /Synthetic organization B/ }))
    // The replaced identity remounts the protected subtree: new header, sheet closed.
    await screen.findByText('Synthetic organization B')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Account' })).toBeNull())
    expect(screen.getByText('outlet-content')).toBeTruthy()
  })

  it('a failed switch reports in the sheet and keeps the current organization', async () => {
    const gateway: MailroomGateway = {
      ...createFixtureGateway(),
      switchOrganization: async () => { throw new GatewayError('api', 'not_available', 'synthetic', { status: 404, requestId: 'r1' }) },
    }
    renderShell(gateway)
    await screen.findByText('Synthetic organization A')
    fireEvent.click(screen.getByRole('button', { name: 'Account and sign-out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Account' })
    fireEvent.click(await within(dialog).findByRole('button', { name: /Synthetic organization B/ }))
    await within(dialog).findByRole('alert')
    // Session A survives: the shell header (banner; aria-hidden while the Radix dialog is open)
    // still names organization A, the routed outlet is still mounted, and no no-organization or
    // sign-in screen replaced the protected subtree. The sheet repeats the name, so scope to the header.
    expect(screen.getByRole('banner', { hidden: true }).textContent).toContain('Synthetic organization A')
    expect(screen.getByText('outlet-content')).toBeTruthy()
    expect(screen.queryByText('No organization is available')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Sign in' })).toBeNull()
  })

  it('sign-out hides the mail at once and ends on the sign-in form with the sign-out notice', async () => {
    let release!: () => void
    const base = createFixtureGateway()
    const gateway: MailroomGateway = {
      ...base,
      logout: async (proof, input, signal) => {
        await new Promise<void>((resolve) => (release = resolve))
        return base.logout(proof, input, signal)
      },
    }
    renderShell(gateway)
    await screen.findByText('Synthetic organization A')
    fireEvent.click(screen.getByRole('button', { name: 'Account and sign-out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Account' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await screen.findByRole('status', { name: 'Signing out' })
    expect(screen.queryByText('Synthetic organization A')).toBeNull()
    expect(screen.queryByText('outlet-content')).toBeNull()
    act(() => release())
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(screen.getByRole('status').textContent).toContain('signed out')
  })

  it('an unconfirmed sign-out keeps the mail hidden and offers to retry or return', async () => {
    const gateway: MailroomGateway = {
      ...createFixtureGateway(),
      logout: async () => { throw new GatewayError('api', 'temporarily_unavailable', 'synthetic', { status: 503, requestId: 'r1' }) },
    }
    renderShell(gateway)
    await screen.findByText('Synthetic organization A')
    fireEvent.click(screen.getByRole('button', { name: 'Account and sign-out' }))
    const dialog = await screen.findByRole('dialog', { name: 'Account' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sign out' }))
    await screen.findByText('Sign-out was not confirmed')
    expect(screen.queryByText('outlet-content')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Return to mail' }))
    await screen.findByText('Synthetic organization A')
  })
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
    // The header search form lists the same display name as an <option>; the loaded rail is the link.
    expect(screen.getByRole('link', { name: 'Fixture inbox' })).toBeTruthy()

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
