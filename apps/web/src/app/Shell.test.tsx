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
import { DashboardPage } from './DashboardPage'
import { featureRoutes } from './features'
import { FeatureGatewaysProvider, type FeatureGateways } from './featureGateways'
import type { OutreachGateway } from '@/features/outreach/contract'

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
            <Route path="search" element={outlet} />
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

  it('the workspace switcher lists memberships and an explicit switch replaces the identity', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    expect(screen.getByRole('button', { name: 'Account and sign-out' }).textContent).toContain('Fixture user A')
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: Synthetic organization A' }))
    const listbox = await screen.findByRole('listbox', { name: 'Workspaces' })
    const current = await within(listbox).findByRole('option', { name: /Synthetic organization A/ })
    expect(current.getAttribute('aria-selected')).toBe('true')
    fireEvent.click(within(listbox).getByRole('option', { name: /Synthetic organization B/ }))
    // The replaced identity remounts the protected subtree: new switcher label, list closed.
    await screen.findByRole('button', { name: 'Workspace: Synthetic organization B' })
    await waitFor(() => expect(screen.queryByRole('listbox', { name: 'Workspaces' })).toBeNull())
    expect(screen.getByText('outlet-content')).toBeTruthy()
  })

  it('a failed switch reports in the sheet and keeps the current organization', async () => {
    const gateway: MailroomGateway = {
      ...createFixtureGateway(),
      switchOrganization: async () => { throw new GatewayError('api', 'not_available', 'synthetic', { status: 404, requestId: 'r1' }) },
    }
    renderShell(gateway)
    await screen.findByText('Synthetic organization A')
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: Synthetic organization A' }))
    const listbox = await screen.findByRole('listbox', { name: 'Workspaces' })
    fireEvent.click(await within(listbox).findByRole('option', { name: /Synthetic organization B/ }))
    await screen.findByRole('alert')
    // Session A survives: the switcher still names organization A, the routed outlet is still
    // mounted, and no no-organization or sign-in screen replaced the protected subtree.
    expect(screen.getByRole('button', { name: 'Workspace: Synthetic organization A' })).toBeTruthy()
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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
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
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
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
    const trigger = screen.getByRole('button', { name: 'Open navigation' })

    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Navigation' })
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
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull())

    fireEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Navigation' })
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull())
    // Dismissal restores focus to the trigger (D6); real-browser proof lives in e2e/read.spec.ts.
    await waitFor(() => expect(document.activeElement).toBe(trigger))
  })

  it('growing past the md breakpoint closes an open drawer', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog', { name: 'Navigation' })
    act(() => {
      mediaMatches = true
      mediaListeners.forEach((listener) => listener({ matches: true }))
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull())
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

describe('dashboard guidance (Mira R16, EmailGuard replica dashboard)', () => {
  it('offers access guidance for a completed zero-visible-mailbox list', async () => {
    const { gateway, readCalls } = pagedGateway([mailboxPage([], null)])
    renderShell(gateway, <DashboardPage />)
    await screen.findByRole('heading', { name: 'No visible mailboxes', level: 2 })
    expect(screen.getByText('If you expected a mailbox here, ask your organization administrator to check your access.')).toBeTruthy()
    expect(screen.getByText('No mailboxes are visible to you.')).toBeTruthy()
    expect(screen.queryByRole('region', { name: 'Workspace summary' })).toBeNull()
    expect(readCalls()).toBe(1)
  })

  it('shows the dashboard summary with a link to each visible mailbox', async () => {
    const { gateway } = pagedGateway([mailboxPage(['Team inbox'], null)])
    renderShell(gateway, <DashboardPage />)
    await screen.findByRole('heading', { name: 'Dashboard', level: 1 })
    expect(await screen.findByRole('region', { name: 'Workspace summary' })).toBeTruthy()
    // The rail links the inbox, and the dashboard's mailbox section links it again.
    const rail = within(screen.getByRole('navigation', { name: 'Mail' })).getByRole('link', { name: 'Team inbox' })
    expect(rail.getAttribute('href')).toBe(`/mailboxes/${mailboxIdFor('Team inbox')}`)
    expect(screen.getAllByRole('link', { name: /Team inbox/ }).length).toBeGreaterThan(1)
    expect(screen.queryByText('No visible mailboxes')).toBeNull()
  })

  it('does not infer an empty list while an empty first page has a pending continuation', async () => {
    let resolvePage!: (page: MailboxPage) => void
    const continuation = new Promise<MailboxPage>((resolve) => { resolvePage = resolve })
    const base = createFixtureGateway()
    const listMailboxes = vi.fn<MailroomGateway['listMailboxes']>().mockResolvedValueOnce(mailboxPage([], 'next')).mockReturnValueOnce(continuation)
    renderShell({ ...base, listMailboxes }, <DashboardPage />)
    await waitFor(() => expect(listMailboxes).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('status', { name: 'Loading mailbox selection' })).toBeTruthy()
    expect(screen.queryByText('No visible mailboxes')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Workspace summary' })).toBeNull()
    await act(async () => resolvePage(mailboxPage(['Later inbox'], null)))
    await screen.findByRole('region', { name: 'Workspace summary' })
    expect(screen.getAllByRole('link', { name: 'Later inbox' }).length).toBeGreaterThan(0)
  })

  it('shows a load failure without claiming an empty or accessible mailbox list, then allows retry', async () => {
    const { gateway, readCalls } = pagedGateway([
      new GatewayError('transport', 'network', 'Mailboxes unavailable'),
      mailboxPage([], null),
    ])
    renderShell(gateway, <DashboardPage />)
    await screen.findByRole('heading', { name: 'Mailboxes could not be loaded', level: 2 })
    expect(screen.getByText('Use Try again in the navigation, or reload the page.')).toBeTruthy()
    expect(screen.queryByText('No visible mailboxes')).toBeNull()
    expect(screen.queryByRole('region', { name: 'Workspace summary' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'No visible mailboxes', level: 2 })
    expect(readCalls()).toBe(2)
  })

  it('a failed count never reads as zero or as "caught up"', async () => {
    const { gateway } = pagedGateway([mailboxPage(['Team inbox'], null)])
    const failing: MailroomGateway = {
      ...gateway,
      listThreads: async () => { throw new GatewayError('transport', 'network', 'Threads unavailable') },
    }
    renderShell(failing, <DashboardPage />)
    const summary = await screen.findByRole('region', { name: 'Workspace summary' })
    await screen.findByRole('heading', { name: 'Recent conversations could not be loaded', level: 2 })
    // The unread card shows a dash, not 0: nothing could be counted.
    const unreadLabel = within(summary).getByText('Unread replies')
    await waitFor(() => expect(unreadLabel.nextElementSibling?.textContent).toBe('—'))
    expect(screen.queryByText('No unread conversations')).toBeNull()
  })
})

describe('registered feature routes (FE-805)', () => {
  it("an Outreach link in the rail reaches Celeste's real page, which reports the missing Outreach API", async () => {
    render(
      <SessionProvider gateway={createFixtureGateway()}>
        <MemoryRouter initialEntries={['/outreach/campaigns']}>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<DashboardPage />} />
              {featureRoutes.map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}
            </Route>
          </Routes>
        </MemoryRouter>
      </SessionProvider>,
    )
    await screen.findByText('Synthetic organization A')
    expect(await screen.findByRole('heading', { name: 'Campaigns' })).toBeTruthy()
    // AIDEV-NOTE: The lazy page heading mounts before its separate API request settles.
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Outreach API unavailable for this account.'))
    expect(screen.getByRole('navigation', { name: 'Outreach' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Campaigns' }).getAttribute('aria-current')).toBe('page')
    expect(within(screen.getByRole('navigation', { name: 'Contacts' })).getByRole('link', { name: 'People' })).toBeTruthy()
    expect(screen.getByText('Simulated local mail')).toBeTruthy()
  })
})

describe('online-only shell hygiene (FE-805)', () => {
  it('a route change scrolls main to the top and only rescues focus stranded on body', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    const main = document.getElementById('main') as HTMLElement
    const inbox = screen.getByRole('link', { name: 'Fixture inbox' })
    inbox.focus()
    fireEvent.click(inbox)
    await screen.findByText('outlet-content')
    // Focus stayed on the rail link (not stranded), so the shell leaves it alone.
    expect(document.activeElement).toBe(inbox)
    ;(document.activeElement as HTMLElement).blur()
    fireEvent.click(screen.getByRole('link', { name: 'Search' }))
    await waitFor(() => expect(document.activeElement).toBe(main))
  })

  it('an offline drop shows the notice inside the shell and a return offers reload', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    act(() => { window.dispatchEvent(new Event('offline')) })
    expect(screen.getByRole('status').textContent).toMatch(/Your device reports a connection problem/)
    expect(screen.getByText('outlet-content')).toBeTruthy()
    act(() => { window.dispatchEvent(new Event('online')) })
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByText(/Your device reports a restored connection/)).toBeNull())
    await screen.findByText('Synthetic organization A')
  })
})

describe('simulation labelling derives from the session (ADV033)', () => {
  it('shows the transport-only simulation footnote and badge for a simulated session, without any local-only storage claim', async () => {
    renderShell(createFixtureGateway())
    await screen.findByText('Synthetic organization A')
    expect(screen.getByText('Simulated local mail')).toBeTruthy()
    expect(await screen.findByText('Simulation mode: no mail is sent or received. Drafts and notes are saved on the server.')).toBeTruthy()
    expect(screen.queryByText(/stay on this installation/)).toBeNull()
  })
})

// FE-805 central session policy for Outreach: Celeste's pages call the gateway directly, so the
// registered route polices every operation through SessionProvider.handleError. A 401 from a
// write therefore clears the whole protected subtree (not only the local form), one context
// change recovers the session, and an ordinary failure stays on Celeste's page.
describe('Outreach operations under the central session policy (FE-805)', () => {
  const unauthenticated = () => new GatewayError('api', 'unauthenticated', 'synthetic', { status: 401, requestId: 'r1' })
  const unused = vi.fn(async () => { throw new Error('not expected in this test') })
  const campaignId = '1a40d184-987d-4b50-98d2-f674e41842f9'
  function outreachWith(overrides: Partial<OutreachGateway>): OutreachGateway {
    return {
      listCampaigns: async () => ({ items: [{ id: campaignId, name: 'Pilot', status: 'paused', version: 1 }], next_cursor: null }),
      getCampaign: unused, createCampaign: unused, updateCampaign: unused, listLeads: unused,
      addLead: unused, updateLead: unused, listAccounts: unused, getAccount: unused, listAnalytics: unused,
      ...overrides,
    }
  }
  function renderOutreach(gateway: MailroomGateway, path: string, featureGateways: FeatureGateways) {
    return render(
      <SessionProvider gateway={gateway}>
        <FeatureGatewaysProvider value={featureGateways}>
          <MemoryRouter initialEntries={[path]}>
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<DashboardPage />} />
                {featureRoutes.map((route) => (
                  <Route key={route.path} path={route.path} element={route.element} />
                ))}
              </Route>
            </Routes>
          </MemoryRouter>
        </FeatureGatewaysProvider>
      </SessionProvider>,
    )
  }

  it('a 401 from a campaign write clears the protected shell and restores access centrally (happy path)', async () => {
    let finishRefresh: (() => Promise<void>) | undefined
    const base = createFixtureGateway({ refreshSession: 'lifecycle_a' })
    const gateway: MailroomGateway = {
      ...base,
      refreshSession: (proof, signal) => new Promise((resolve, reject) => {
        finishRefresh = () => base.refreshSession(proof, signal).then(resolve, reject)
      }),
    }
    const createCampaign = vi.fn(async () => { throw unauthenticated() })
    renderOutreach(gateway, '/outreach/campaigns/new', { outreach: outreachWith({ createCampaign }) })
    await screen.findByText('Synthetic organization A')
    fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'Pilot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    // The whole protected subtree is gone while the single bounded refresh runs: no form, no rail.
    await screen.findByRole('status', { name: 'Restoring access' })
    expect(screen.queryByLabelText('Campaign name')).toBeNull()
    expect(screen.queryByRole('navigation', { name: 'Outreach' })).toBeNull()
    expect(createCampaign).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(finishRefresh).toBeDefined())
    // AIDEV-NOTE: the refresh settles inside an awaited act; an un-awaited act leaves its scope open
    // and React queues every later update into it (fleet 8eb840d: stuck "Restoring access", empty roots).
    await act(async () => { await finishRefresh!() })
    await screen.findByText('Synthetic organization A')
    expect(await screen.findByLabelText('Campaign name')).toBeTruthy()
  })

  it('one context change from a campaign read recovers the session and the list reloads with the new epoch', async () => {
    let calls = 0
    const listCampaigns = vi.fn(async () => {
      calls += 1
      if (calls === 1) throw contextChanged()
      return { items: [{ id: campaignId, name: 'Pilot', status: 'paused' as const, version: 1 }], next_cursor: null }
    })
    renderOutreach(createFixtureGateway(), '/outreach/campaigns', { outreach: outreachWith({ listCampaigns }) })
    await screen.findByText('Synthetic organization A')
    // Recovery replaces the protected subtree; the remounted page re-reads under the new epoch.
    expect(await screen.findByRole('link', { name: 'Pilot' })).toBeTruthy()
    expect(listCampaigns).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('status', { name: 'Restoring session' })).toBeNull()
  })

  it('a stale 401 from a request started under the previous identity cannot mark the replacement context (REV866)', async () => {
    // First read is held open; an explicit organization switch replaces the identity while it is
    // pending; only then does the old request fail with 401. The policy sees a stale generation and
    // consumes it; the rethrow reaches a page whose controller was aborted at unmount, so nothing
    // is committed: no alert, no "Restoring access", and the single bounded refresh is not spent.
    let failFirst: ((error: unknown) => void) | undefined
    const listCampaigns = vi.fn<OutreachGateway['listCampaigns']>()
      .mockImplementationOnce(() => new Promise<never>((_resolve, reject) => { failFirst = reject }))
      .mockImplementation(async () => ({ items: [{ id: campaignId, name: 'Pilot', status: 'paused' as const, version: 1 }], next_cursor: null }))
    const base = createFixtureGateway()
    const refreshSession = vi.spyOn(base, 'refreshSession')
    renderOutreach(base, '/outreach/campaigns', { outreach: outreachWith({ listCampaigns }) })
    await screen.findByText('Synthetic organization A')
    await waitFor(() => expect(failFirst).toBeDefined())
    fireEvent.click(screen.getByRole('button', { name: 'Workspace: Synthetic organization A' }))
    const listbox = await screen.findByRole('listbox', { name: 'Workspaces' })
    fireEvent.click(await within(listbox).findByRole('option', { name: /Synthetic organization B/ }))
    await screen.findByRole('button', { name: 'Workspace: Synthetic organization B' })
    await act(async () => { failFirst!(unauthenticated()) })
    expect(await screen.findByRole('link', { name: 'Pilot' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('status', { name: 'Restoring access' })).toBeNull()
    expect(screen.getByText('Synthetic organization B')).toBeTruthy()
    expect(refreshSession).not.toHaveBeenCalled()
    expect(listCampaigns).toHaveBeenCalledTimes(2)
  })

  it("an ordinary failure stays on Celeste's page as her own alert without any session transition", async () => {
    const createCampaign = vi.fn(async () => { throw new GatewayError('api', 'request_invalid', 'synthetic', { status: 422, requestId: 'r2' }) })
    renderOutreach(createFixtureGateway(), '/outreach/campaigns/new', { outreach: outreachWith({ createCampaign }) })
    await screen.findByText('Synthetic organization A')
    fireEvent.change(await screen.findByLabelText('Campaign name'), { target: { value: 'Pilot' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Campaign name')).toBeTruthy()
    expect(screen.getByRole('navigation', { name: 'Outreach' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Restoring access' })).toBeNull()
    expect(screen.queryByRole('status', { name: 'Restoring session' })).toBeNull()
  })
})
