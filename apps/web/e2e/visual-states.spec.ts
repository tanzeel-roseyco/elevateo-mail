// Authored, not executed: visual-evidence capture for the FE01 read-checkpoint states listed in
// docs/visual-qa-matrix.md. Runs against the served production artifact exactly like
// production.spec.ts (routed synthetic payloads only; no product source change) and saves one
// full-page screenshot per scenario × theme × project to e2e/.results/visual/ for the parent's
// human inspection. Assertions pin that each intended state is actually on screen before the
// capture, so a wrong screenshot fails rather than silently photographing the wrong state.
import { expect, test, type Page } from '@playwright/test'
import { openMailbox } from './support'

const PRODUCTION_URL = process.env['ELEVATEO_PRODUCTION_URL']

const SESSION = {
  context_id: 'context_vis_0123456789',
  authorization_version: 'authz_vis_0123456789',
  actor: { id: '00000000-0000-4000-8000-0000000000a1', display_name: 'Visual user' },
  organization: { id: '00000000-0000-4000-8000-0000000000b1', name: 'Visual organization' },
  simulation_mode: true,
  csrf_token: 'visual_token_0123456789',
}
const MAILBOX_ID = '00000000-0000-4000-8000-0000000000c1'
const THREAD_ID = '00000000-0000-4000-8000-000000000101'
const envelope = { context_id: SESSION.context_id, authorization_version: SESSION.authorization_version }
const MAILBOXES = {
  ...envelope,
  next_cursor: null,
  items: [{
    id: MAILBOX_ID,
    display_name: 'Visual mailbox',
    display_address: 'visual@example.test',
    capabilities: { read: true, compose: false, approve_send: false, manage_members: false },
  }],
}
const summary = (i: number) => ({
  id: `00000000-0000-4000-8000-0000000001${(16 + i).toString(16)}`,
  mailbox_id: MAILBOX_ID,
  subject: `Visual conversation ${i + 1}`,
  subject_truncated: false,
  sender: { address: `sender-${i}@example.test`, display_name: `Sender ${i + 1}` },
  preview_text: `Preview for visual conversation ${i + 1}`,
  last_message_at: '2026-10-12T00:00:00Z',
  unread: i % 2 === 0,
  message_count: 1,
})
const threadsPage = (count: number, cursor: string | null) => ({
  ...envelope,
  mailbox_id: MAILBOX_ID,
  next_cursor: cursor,
  items: Array.from({ length: count }, (_, i) => ({ ...summary(i), ...(i === 0 ? { id: THREAD_ID } : {}) })),
})
const readerMessage = (i: number, truncated = false) => ({
  id: `00000000-0000-4000-8000-0000000002${(16 + i).toString(16)}`,
  sender: { display_name: `Sender ${i + 1}`, address: `sender-${i}@example.test` },
  to: [{ display_name: 'Visual user', address: 'visual@example.test' }],
  sent_at: '2026-10-12T00:00:00Z',
  body_text: `Plain-text body of message ${i + 1}.`,
  body_truncated: truncated,
  attachment_count: i === 0 ? 2 : 0,
})
const threadDetail = (messages: unknown[], cursor: string | null, truncatedSubject = false) => ({
  ...envelope,
  next_cursor: cursor,
  thread: { id: THREAD_ID, mailbox_id: MAILBOX_ID, subject: 'Visual conversation 1', subject_truncated: truncatedSubject, unread: true, message_count: messages.length + (cursor === null ? 0 : 1) },
  messages,
})
const assignment = { ...envelope, thread_id: THREAD_ID, mailbox_id: MAILBOX_ID,
  assignee_id: null, assignment_version: 0, updated_at: null }
const notes = { ...envelope, thread_id: THREAD_ID, mailbox_id: MAILBOX_ID,
  next_cursor: null, items: [] }

// Hostile plaintext for the ready-reader capture, mirroring production.spec.ts: must render as
// inert escaped text (contract-valid payload so the boundary validator admits it).
const HOSTILE_BODY = ['<script>window.__pwned = 1</script>', 'Visit https://hostile.invalid/prize now.'].join('\n')

// One reply per matching request, in order; the last repeats. 'hold' leaves the request pending
// (unanswered until test teardown), freezing the transient state for the screenshot. A function
// reply chooses the body from the actual request URL (e.g. the unread filter query).
type Fulfilled = { body: unknown; status?: number }
type Reply = 'hold' | Fulfilled | ((url: URL) => Fulfilled)
const apiError = (code: string, status = 503): Reply => ({ status, body: { code, message: 'forced by visual QA', request_id: 'vq-1' } })
async function sequence(page: Page, matcher: (url: URL) => boolean, replies: Reply[]): Promise<void> {
  let call = 0
  await page.route(matcher, (route) => {
    const next = replies[Math.min(call, replies.length - 1)]!
    call += 1
    if (next === 'hold') return // deliberately unanswered: the state under capture is the pending one
    const reply = typeof next === 'function' ? next(new URL(route.request().url())) : next
    return route.fulfill({ status: reply.status ?? 200, contentType: 'application/json', body: JSON.stringify(reply.body) })
  })
}

// Regression for the invisible-skeleton defect: the bar must PAINT a fill distinct from the
// first opaque background behind it. A raw string comparison is not enough: rgba(0,0,0,0)
// differs textually from any opaque parent yet paints nothing, and toBeVisible does not prove a
// painted fill. The probe rejects fully transparent fills outright and otherwise compares the
// alpha-composited EFFECTIVE color against the backdrop.
const CONTRAST_PROBE = (el: Element) => {
  const parse = (c: string) => {
    const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/.exec(c)
    return m ? { r: +m[1]!, g: +m[2]!, b: +m[3]!, a: m[4] === undefined ? 1 : +m[4]! } : null
  }
  const bg = getComputedStyle(el).backgroundColor
  let node: HTMLElement | null = (el as HTMLElement).parentElement
  let behind = ''
  while (node) {
    const parsed = parse(getComputedStyle(node).backgroundColor)
    if (parsed && parsed.a > 0) { behind = getComputedStyle(node).backgroundColor; break }
    node = node.parentElement
  }
  if (behind === '') behind = getComputedStyle(document.body).backgroundColor
  const fill = parse(bg)
  const back = parse(behind)
  if (!fill || !back) return { ok: false, reason: `unparseable computed colors: '${bg}' over '${behind}'` }
  if (fill.a === 0) return { ok: false, reason: `skeleton fill is fully transparent: ${bg}` }
  const over = (f: number, b: number) => f * fill.a + b * (1 - fill.a)
  const delta = Math.abs(over(fill.r, back.r) - back.r) + Math.abs(over(fill.g, back.g) - back.g) + Math.abs(over(fill.b, back.b) - back.b)
  return { ok: delta > 0, reason: `effective fill ${bg} over ${behind} (channel delta ${delta.toFixed(2)})` }
}

async function assertSkeletonContrasts(page: Page, statusName: string): Promise<void> {
  const bar = page.getByRole('status', { name: statusName }).locator('div[aria-hidden] > div').first()
  await expect(bar).toBeVisible()
  const verdict = await bar.evaluate(CONTRAST_PROBE)
  expect(verdict.ok, verdict.reason).toBe(true)
}

interface Scenario {
  name: string
  routes: Partial<Record<'session' | 'mailboxes' | 'threads' | 'thread' | 'assignment' | 'notes' | 'challenge' | 'refresh' | 'login' | 'logout' | 'organizations', Reply[]>>
  /** none: stay on the shell; mailbox: open 'Visual mailbox'; thread: then open the first row. */
  nav: 'none' | 'mailbox' | 'thread'
  /** Open the drawer first below md so sidebar-only states are visible for the capture. */
  revealSidebar?: boolean
  act?: (page: Page) => Promise<void>
  /** Visible proof the intended state is on screen (text, or role:status/alert with that name). */
  expectVisible: { text?: string; status?: string }
  /** Extra state proof beyond one visible string (e.g. absence of sibling states). */
  assert?: (page: Page) => Promise<void>
  /** Prove this request was actually issued before the capture (registered before navigation). */
  awaitRequest?: string
  /** Capture exists only below the md breakpoint (e.g. the drawer presentation). */
  mobileOnly?: boolean
}

const SCENARIOS: Scenario[] = [
  // Ready matrix rows (unsampled theme/viewport cells of states the r7 PNGs sampled elsewhere).
  { name: 'shell-ready', routes: {}, nav: 'none', expectVisible: { text: 'Select a mailbox' } },
  { name: 'inbox-ready', routes: {}, nav: 'mailbox', expectVisible: { text: 'Visual conversation 1' } },
  {
    name: 'inbox-unread-filter-active',
    // The unread request must carry filter=unread and receive an unread-only payload, so the
    // capture proves read rows are gone — not the same mixed list under a highlighted pill.
    routes: {
      threads: [(url) => {
        const page = threadsPage(3, null)
        return url.searchParams.get('filter') === 'unread' ? { body: { ...page, items: page.items.filter((t) => t.unread) } } : { body: page }
      }],
    },
    nav: 'mailbox',
    awaitRequest: 'filter=unread',
    act: async (page) => page.getByRole('link', { name: 'Unread', exact: true }).click(),
    expectVisible: { text: 'Visual conversation 1' }, // unread (index 0)
    assert: async (page) => {
      await expect(page.getByRole('link', { name: 'Unread', exact: true })).toHaveAttribute('aria-current', 'page')
      await expect(page.getByRole('link', { name: /Visual conversation 3/ })).toBeVisible() // unread (index 2)
      await expect(page.getByRole('link', { name: /Visual conversation 2/ })).toHaveCount(0) // read row excluded
    },
  },
  {
    // Populated drawer open OVER ready inbox content (matrix row 'drawer open over content'),
    // including the dark×390 cell; only loading/error/empty drawer states existed before.
    name: 'drawer-open-populated',
    routes: {},
    nav: 'mailbox',
    mobileOnly: true,
    revealSidebar: true,
    // The dialog-scoped text expectation must name DIALOG content ('Visual mailbox'); the ready
    // inbox row behind the overlay lives outside the dialog, so it is proven page-scoped in the
    // assert instead (r9 failure: scoping the behind-content row to the dialog found nothing).
    expectVisible: { text: 'Visual mailbox' },
    assert: async (page) => {
      await expect(page.getByRole('dialog', { name: 'Mailboxes' }).getByRole('link', { name: 'Visual mailbox' })).toBeVisible()
      // Radix marks background content aria-hidden while modal, so role queries cannot see the
      // row; the rendered text itself proves the populated inbox is painted behind the overlay.
      await expect(page.getByText('Visual conversation 1').first()).toBeVisible()
    },
  },
  {
    name: 'reader-ready-hostile',
    routes: { thread: [{ body: threadDetail([{ ...readerMessage(0), body_text: HOSTILE_BODY }], null) }] },
    nav: 'thread',
    expectVisible: { text: '<script>window.__pwned = 1</script>' },
    assert: async (page) => {
      expect(await page.locator('article script, article img, article iframe').count()).toBe(0)
      await expect(page.getByRole('region', { name: 'Assignment' }).getByText('Unassigned')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Internal notes' }).getByText('No notes yet.')).toBeVisible()
      await expect(page.getByRole('region', { name: 'Assignment' }).getByRole('alert')).toHaveCount(0)
      await expect(page.getByRole('region', { name: 'Internal notes' }).getByRole('alert')).toHaveCount(0)
      await expect(page.getByText('1 message in this conversation')).toBeVisible()
    },
  },
  { name: 'session-loading', routes: { session: ['hold'] }, nav: 'none', expectVisible: { status: 'Loading session' }, assert: (page) => assertSkeletonContrasts(page, 'Loading session') },
  // A 401 session performs exactly one challenge+refresh (answered 401 by default) and then shows the sign-in form.
  { name: 'session-unauthenticated', routes: { session: [apiError('unauthenticated', 401)] }, nav: 'none', awaitRequest: '/v1/auth/refresh', expectVisible: { text: 'Sign in' }, assert: async (page) => {
    await expect(page.getByLabel('Email address')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  } },
  // A held refresh freezes the fenced 'Restoring access' skeleton; no protected content exists yet.
  { name: 'session-refreshing', routes: { session: [apiError('unauthenticated', 401)], refresh: ['hold'] }, nav: 'none', awaitRequest: '/v1/auth/refresh', expectVisible: { status: 'Restoring access' }, assert: (page) => assertSkeletonContrasts(page, 'Restoring access') },
  // A refresh that succeeds reaches the shell without a second session read.
  { name: 'session-refreshed', routes: { session: [apiError('unauthenticated', 401)], refresh: [{ body: { session: SESSION, access_expires_at: '2026-10-13T01:00:00Z' } }] }, nav: 'none', expectVisible: { text: 'Select a mailbox' } },
  { name: 'session-no-organization', routes: { session: [apiError('not_available', 404)] }, nav: 'none', expectVisible: { text: 'No organization is available' } },
  {
    name: 'sign-in-rejected',
    routes: { session: [apiError('unauthenticated', 401)], login: [apiError('unauthenticated', 401)] },
    nav: 'none',
    act: async (page) => {
      await page.getByLabel('Email address').fill('visual@example.test')
      await page.getByLabel('Password').fill('wrong-password')
      await page.getByRole('button', { name: 'Sign in' }).click()
    },
    expectVisible: { text: 'Sign-in was not accepted' },
    assert: async (page) => expect(await page.getByLabel('Password').inputValue()).toBe(''),
  },
  {
    name: 'sign-in-unavailable-keeps-entries',
    routes: { session: [apiError('unauthenticated', 401)], login: [apiError('temporarily_unavailable', 503)] },
    nav: 'none',
    act: async (page) => {
      await page.getByLabel('Email address').fill('visual@example.test')
      await page.getByLabel('Password').fill('kept-password')
      await page.getByRole('button', { name: 'Sign in' }).click()
    },
    expectVisible: { text: 'temporarily unavailable' },
    assert: async (page) => expect(await page.getByLabel('Password').inputValue()).toBe('kept-password'),
  },
  {
    name: 'sign-in-rate-limited-hold',
    routes: { session: [apiError('unauthenticated', 401)], login: [{ status: 429, body: { code: 'rate_limited', message: 'forced by visual QA', request_id: 'vq-1' } }] },
    nav: 'none',
    act: async (page) => {
      await page.getByLabel('Email address').fill('visual@example.test')
      await page.getByLabel('Password').fill('any-password')
      await page.getByRole('button', { name: 'Sign in' }).click()
    },
    expectVisible: { text: 'Too many attempts' },
  },
  {
    name: 'sign-in-succeeds-into-shell',
    routes: { session: [apiError('unauthenticated', 401), { body: SESSION }] },
    nav: 'none',
    act: async (page) => {
      await page.getByLabel('Email address').fill('visual@example.test')
      await page.getByLabel('Password').fill('right-password')
      await page.getByRole('button', { name: 'Sign in' }).click()
    },
    expectVisible: { text: 'Select a mailbox' },
  },
  {
    name: 'recovery-form',
    routes: { session: [apiError('unauthenticated', 401)] },
    nav: 'none',
    act: async (page) => page.getByRole('button', { name: 'Forgot your password?' }).click(),
    expectVisible: { text: 'Recover access' },
  },
  {
    name: 'account-sheet-open',
    routes: {},
    nav: 'none',
    act: async (page) => page.getByRole('button', { name: 'Account and sign-out' }).click(),
    expectVisible: { text: 'Second organization' },
    assert: async (page) => {
      const dialog = page.getByRole('dialog', { name: 'Account' })
      await expect(dialog.getByRole('button', { name: /Visual organization/ })).toHaveAttribute('aria-current', 'true')
      await expect(dialog.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible()
    },
  },
  {
    name: 'signed-out-notice',
    routes: {},
    nav: 'none',
    act: async (page) => {
      await page.getByRole('button', { name: 'Account and sign-out' }).click()
      await page.getByRole('dialog', { name: 'Account' }).getByRole('button', { name: 'Sign out', exact: true }).click()
    },
    expectVisible: { text: 'still pending' },
    assert: async (page) => {
      await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      await expect(page.getByText('Visual organization')).toHaveCount(0)
    },
  },
  {
    name: 'sign-out-unconfirmed',
    routes: { logout: [apiError('temporarily_unavailable')] },
    nav: 'none',
    act: async (page) => {
      await page.getByRole('button', { name: 'Account and sign-out' }).click()
      await page.getByRole('dialog', { name: 'Account' }).getByRole('button', { name: 'Sign out', exact: true }).click()
    },
    expectVisible: { text: 'Sign-out was not confirmed' },
    assert: async (page) => expect(page.getByText('Select a mailbox')).toHaveCount(0),
  },
  { name: 'session-error', routes: { session: [apiError('internal_error', 500)] }, nav: 'none', expectVisible: { text: 'The session could not be loaded' } },
  // context_changed on the mailbox list consumes the one recovery; a held session refetch freezes 'recovering'.
  { name: 'session-recovering', routes: { session: [{ body: SESSION }, 'hold'], mailboxes: [apiError('context_changed', 409)] }, nav: 'none', expectVisible: { status: 'Restoring session' } },
  // context_changed again after a successful recovery exhausts the allowance (D2).
  { name: 'session-retry-required', routes: { mailboxes: [apiError('context_changed', 409)] }, nav: 'none', expectVisible: { text: 'Your access changed again' } },
  // Canvas (session/inbox/reader) and panel (mailboxes sidebar) skeletons both prove computed-
  // color contrast, so the token stays distinct from BOTH backgrounds in both themes.
  { name: 'mailboxes-loading', routes: { mailboxes: ['hold'] }, nav: 'none', revealSidebar: true, expectVisible: { status: 'Loading mailboxes' }, assert: (page) => assertSkeletonContrasts(page, 'Loading mailboxes') },
  // The shell auto-follows mailbox cursors: a held second page is still the loading skeleton.
  // awaitRequest proves the continuation request was actually issued (and therefore held) before
  // the capture, so the screenshot cannot race ahead of the first page's response.
  { name: 'mailboxes-paginated-loading', routes: { mailboxes: [{ body: { ...MAILBOXES, next_cursor: 'cursor_visual_page_2' } }, 'hold'] }, nav: 'none', revealSidebar: true, awaitRequest: 'cursor_visual_page_2', expectVisible: { status: 'Loading mailboxes' } },
  { name: 'mailboxes-error', routes: { mailboxes: [apiError('temporarily_unavailable')] }, nav: 'none', revealSidebar: true, expectVisible: { text: 'Try again' } },
  {
    name: 'mailboxes-empty',
    routes: { mailboxes: [{ body: { ...MAILBOXES, items: [] } }] },
    nav: 'none',
    revealSidebar: true,
    // The LOADED empty sidebar, proven directly: the empty copy inside the mailbox navigation,
    // zero mailbox links while registered static Personal routes remain available, and the
    // loading/error presentations absent.
    expectVisible: { text: 'No mailboxes are visible to you.' },
    assert: async (page) => {
      const nav = page.getByRole('navigation', { name: 'Mailboxes' })
      await expect(nav).toBeVisible()
      await expect(nav.locator('a[href*="/mailboxes/"]')).toHaveCount(0)
      await expect(nav.getByRole('link', { name: 'Search' })).toHaveAttribute('href', '#/search')
      await expect(nav.getByRole('link', { name: 'People' })).toHaveAttribute('href', '#/people')
      await expect(nav.getByRole('link', { name: 'Personal settings' })).toHaveAttribute('href', '#/settings/personal')
      await expect(nav.getByRole('link', { name: 'Organization settings' })).toHaveAttribute('href', '#/settings/organization')
      await expect(page.getByRole('status', { name: 'Loading mailboxes' })).toHaveCount(0)
      await expect(page.getByRole('alert')).toHaveCount(0)
    },
  },
  { name: 'inbox-loading', routes: { threads: ['hold'] }, nav: 'mailbox', expectVisible: { status: 'Loading conversations' }, assert: (page) => assertSkeletonContrasts(page, 'Loading conversations') },
  { name: 'inbox-empty', routes: { threads: [{ body: threadsPage(0, null) }] }, nav: 'mailbox', expectVisible: { text: 'No conversations' } },
  { name: 'inbox-empty-page-with-cursor', routes: { threads: [{ body: threadsPage(0, 'cursor_visual_more') }] }, nav: 'mailbox', expectVisible: { text: 'Nothing on this page' } },
  { name: 'inbox-unavailable', routes: { threads: [apiError('not_available', 404)] }, nav: 'mailbox', expectVisible: { text: 'This mailbox is unavailable' } },
  { name: 'inbox-error', routes: { threads: [apiError('internal_error', 500)] }, nav: 'mailbox', expectVisible: { text: 'Conversations could not be loaded' } },
  {
    name: 'inbox-loading-more',
    routes: { threads: [{ body: threadsPage(3, 'cursor_visual_more') }, 'hold'] },
    nav: 'mailbox',
    act: async (page) => page.getByRole('button', { name: 'Show more conversations' }).click(),
    expectVisible: { text: 'Loading…' },
  },
  { name: 'reader-loading', routes: { thread: ['hold'] }, nav: 'thread', expectVisible: { status: 'Loading conversation' }, assert: (page) => assertSkeletonContrasts(page, 'Loading conversation') },
  {
    name: 'reader-truncated-badges',
    routes: { thread: [{ body: threadDetail([readerMessage(0, true)], null, true) }] },
    nav: 'thread',
    expectVisible: { text: 'Subject shortened' },
    // Geometry regression: both footer badges must fit the viewport (they overflowed 390px
    // before flex-wrap; a class assertion could not have caught the overflow).
    assert: async (page) => {
      const width = page.viewportSize()?.width ?? 1280
      for (const badge of [page.getByText('Message shortened by the server'), page.getByText(/2 attachments/)]) {
        await expect(badge).toBeVisible()
        const box = await badge.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.x, 'badge starts inside the viewport').toBeGreaterThanOrEqual(0)
        expect(box!.x + box!.width, 'badge must not overflow the viewport').toBeLessThanOrEqual(width + 0.5)
      }
    },
  },
  { name: 'reader-unavailable', routes: { thread: [apiError('not_available', 404)] }, nav: 'thread', expectVisible: { text: 'This conversation is unavailable' } },
  { name: 'reader-error', routes: { thread: [apiError('internal_error', 500)] }, nav: 'thread', expectVisible: { text: 'The conversation could not be loaded' } },
  { name: 'reader-empty', routes: { thread: [{ body: threadDetail([], null) }] }, nav: 'thread', expectVisible: { text: 'No messages' } },
  { name: 'reader-empty-page-with-cursor', routes: { thread: [{ body: threadDetail([], 'cursor_visual_more') }] }, nav: 'thread', expectVisible: { text: 'Nothing on this page' } },
  {
    name: 'reader-loading-more',
    routes: { thread: [{ body: threadDetail([readerMessage(0)], 'cursor_visual_more') }, 'hold'] },
    nav: 'thread',
    act: async (page) => page.getByRole('button', { name: 'Show more messages' }).click(),
    expectVisible: { text: 'Loading…' },
  },
]

// Under the reduced-motion project only the matrix's representative rows run (layout, not motion,
// is what differs; the full sweep belongs to desktop and narrow-390).
const REPRESENTATIVE = new Set(['shell-ready', 'inbox-loading', 'reader-ready-hostile'])

// URL predicates on the pathname, not globs: a glob ending in 'mailboxes' would NOT match the
// continuation request '/v1/mailboxes?cursor=…', silently un-routing the second page.
const ROUTE_MATCHERS = {
  session: (url: URL) => url.pathname.endsWith('/v1/session'),
  mailboxes: (url: URL) => url.pathname.endsWith('/v1/mailboxes'),
  threads: (url: URL) => /\/v1\/mailboxes\/[^/]+\/threads$/.test(url.pathname),
  thread: (url: URL) => /\/v1\/threads\/[^/]+$/.test(url.pathname),
  assignment: (url: URL) => /\/v1\/threads\/[^/]+\/assignment$/.test(url.pathname),
  notes: (url: URL) => /\/v1\/threads\/[^/]+\/notes$/.test(url.pathname),
  // BE-02A lifecycle routes (challenge + refresh run once after any 401 before sign-in shows).
  challenge: (url: URL) => url.pathname.endsWith('/v1/auth/login-challenge'),
  refresh: (url: URL) => url.pathname.endsWith('/v1/auth/refresh'),
  login: (url: URL) => url.pathname.endsWith('/v1/auth/login'),
  logout: (url: URL) => url.pathname.endsWith('/v1/auth/logout'),
  organizations: (url: URL) => url.pathname.endsWith('/v1/organizations'),
} as const
const CHALLENGE = { csrf_token: 'visual_challenge_0123456789', expires_at: '2026-10-13T00:05:00Z' }
const ORGANIZATIONS = { ...envelope, next_cursor: null, items: [SESSION.organization, { id: '00000000-0000-4000-8000-0000000000b2', name: 'Second organization' }] }

test.describe('read-checkpoint visual states (capture for human inspection)', () => {
  test.skip(PRODUCTION_URL === undefined, 'ELEVATEO_PRODUCTION_URL not set; coordinator must serve the built artifact')
  test.use({ baseURL: PRODUCTION_URL })

  // In-spec oracle regression (review P2): the probe itself must reject a fully transparent fill
  // and a composite that lands exactly on the backdrop, and accept a genuinely distinct fill.
  test('contrast probe rejects transparent and no-op fills', async ({ page }) => {
    await page.setContent(
      '<div style="background:#ffffff">' +
        '<div id="transparent" style="background:rgba(0,0,0,0)"></div>' +
        '<div id="noop" style="background:rgba(255,255,255,0.5)"></div>' +
        '<div id="distinct" style="background:#e4e4e7"></div>' +
      '</div>',
    )
    expect((await page.locator('#transparent').evaluate(CONTRAST_PROBE)).ok, 'transparent fill must fail').toBe(false)
    expect((await page.locator('#noop').evaluate(CONTRAST_PROBE)).ok, 'composite equal to backdrop must fail').toBe(false)
    expect((await page.locator('#distinct').evaluate(CONTRAST_PROBE)).ok, 'distinct opaque fill must pass').toBe(true)
  })

  for (const theme of ['light', 'dark'] as const) {
    for (const scenario of SCENARIOS) {
      test(`${scenario.name} (${theme})`, async ({ page }, testInfo) => {
        test.skip(testInfo.project.name.includes('reduced-motion') && !REPRESENTATIVE.has(scenario.name), 'representative rows only under reduced motion')
        test.skip(scenario.mobileOnly === true && (page.viewportSize()?.width ?? 1280) >= 768, 'drawer presentation exists only below md')
        await page.emulateMedia({ colorScheme: theme })
        // Registered before navigation so an early request cannot be missed; awaited before capture.
        const issued = scenario.awaitRequest === undefined ? null : page.waitForRequest((request) => request.url().includes(scenario.awaitRequest!))
        for (const key of Object.keys(ROUTE_MATCHERS) as (keyof typeof ROUTE_MATCHERS)[]) {
          const defaults: Record<keyof typeof ROUTE_MATCHERS, Reply[]> = {
            session: [{ body: SESSION }],
            mailboxes: [{ body: MAILBOXES }],
            threads: [{ body: threadsPage(3, null) }],
            thread: [{ body: threadDetail([readerMessage(0), readerMessage(1)], null) }],
            assignment: [{ body: assignment }],
            notes: [{ body: notes }],
            challenge: [{ body: CHALLENGE }],
            refresh: [apiError('unauthenticated', 401)],
            login: [{ body: { session: SESSION, access_expires_at: '2026-10-13T01:00:00Z' } }],
            logout: [{ body: { local_revoked: true, upstream_status: 'pending' } }],
            organizations: [{ body: ORGANIZATIONS }],
          }
          await sequence(page, ROUTE_MATCHERS[key], scenario.routes[key] ?? defaults[key])
        }
        await page.goto('/')
        if (scenario.nav !== 'none') {
          await openMailbox(page, 'Visual mailbox')
          if (scenario.nav === 'thread') {
            await expect(page.getByRole('link', { name: /Visual conversation 1/ })).toBeVisible()
            await page.locator('a[data-thread]').first().click()
          }
        }
        if (scenario.revealSidebar) {
          // Sidebar-only states live in the drawer below md. Await shell readiness FIRST — an
          // immediate isVisible() can race the session fetch, see no trigger yet, and silently
          // skip the drawer forever — then decide by the project's known viewport and prove the
          // dialog actually opened.
          await expect(page.getByText('Simulated local mail')).toBeVisible()
          if ((page.viewportSize()?.width ?? 1280) < 768) {
            await page.getByRole('button', { name: 'Open mailbox menu' }).click()
            await expect(page.getByRole('dialog', { name: 'Mailboxes' })).toBeVisible()
          }
        }
        if (scenario.act) await scenario.act(page)
        // Shell.tsx permanently renders the desktop sidebar (hidden md:block) BEFORE the drawer's
        // copy, so below md a page-global getByText(...).first() selects the display:none aside
        // duplicate and fails toBeVisible even though the open drawer shows the text (r8 failure,
        // corroborated by the parent's inspection of the failure screenshot: drawer open, text
        // rendered). Scope sidebar-state text expectations to the open Mailboxes dialog on narrow
        // viewports; role-based locators are unaffected (display:none drops the aside from the
        // accessibility tree). toBeVisible stays strict.
        const textScope = scenario.revealSidebar && (page.viewportSize()?.width ?? 1280) < 768 ? page.getByRole('dialog', { name: 'Mailboxes' }) : page
        if (scenario.expectVisible.status !== undefined) await expect(page.getByRole('status', { name: scenario.expectVisible.status })).toBeVisible()
        if (scenario.expectVisible.text !== undefined) await expect(textScope.getByText(scenario.expectVisible.text).first()).toBeVisible()
        if (scenario.assert) await scenario.assert(page)
        if (issued) await issued
        await page.screenshot({ path: `e2e/.results/visual/${testInfo.project.name}-${theme}-${scenario.name}.png`, fullPage: true })
      })
    }
  }
})
