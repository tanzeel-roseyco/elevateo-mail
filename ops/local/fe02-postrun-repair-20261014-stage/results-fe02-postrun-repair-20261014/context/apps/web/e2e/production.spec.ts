// Authored, not executed: coordinator serves the actual production build artifact in Docker and
// runs this spec against it (V7, D01). It must be the real `vite build` output; adapter-level unit
// tests cannot stand in for this proof. Skips, visibly, when no artifact URL is provided.
import { expect, test } from '@playwright/test'
import { openMailbox } from './support'

const PRODUCTION_URL = process.env['ELEVATEO_PRODUCTION_URL']

// Strings that only exist in the fixture module/data; none may surface from the production artifact.
const FIXTURE_MARKERS = [
  'Development fixtures',
  'Synthetic organization A',
  'Synthetic organization B',
  'Fixture user A',
  'Fixture inbox',
  'fixture_token_a_0123456789',
]

// Canonical-shaped payloads defined here, deliberately distinct from contracts/v1/fixtures.json
// values, so any fixture-sourced text is detectable as a fallback.
const SESSION = {
  context_id: 'context_prod_0123456789',
  authorization_version: 'authz_prod_0123456789',
  actor: { id: '00000000-0000-4000-8000-0000000000a1', display_name: 'Routed user' },
  organization: { id: '00000000-0000-4000-8000-0000000000b1', name: 'Routed organization' },
  simulation_mode: true,
  csrf_token: 'routed_token_0123456789',
}
const MAILBOXES = {
  context_id: SESSION.context_id,
  authorization_version: SESSION.authorization_version,
  next_cursor: null,
  items: [
    {
      id: '00000000-0000-4000-8000-0000000000c1',
      display_name: 'Routed mailbox',
      display_address: 'routed@example.test',
      capabilities: { read: true, compose: false, approve_send: false, manage_members: false },
    },
  ],
}
const FIFTY_THREADS = {
  context_id: SESSION.context_id,
  authorization_version: SESSION.authorization_version,
  mailbox_id: MAILBOXES.items[0]!.id,
  next_cursor: null,
  items: Array.from({ length: 50 }, (_, i) => ({
    id: `00000000-0000-4000-8000-0000000000${(100 + i).toString(16)}`,
    mailbox_id: MAILBOXES.items[0]!.id,
    subject: `Routed conversation ${i + 1}`,
    subject_truncated: false,
    sender: { address: `sender-${i}@example.test`, display_name: `Sender ${i + 1}` },
    preview_text: `Preview text for routed conversation ${i + 1}`,
    last_message_at: '2026-10-12T00:00:00Z',
    unread: i % 2 === 0,
    message_count: 1,
  })),
}

// Hostile plaintext for the first conversation: a literal script tag and subresource URLs. The
// reader must show them as inert escaped text and never fetch them (contract-valid payload so the
// boundary validator cannot reject it before rendering).
const HOSTILE_BODY = [
  '<script>window.__pwned = 1</script>',
  '<img src="https://hostile.invalid/tracking-pixel.png">',
  'Visit https://hostile.invalid/prize to claim your reward.',
].join('\n')
const HOSTILE_THREAD = {
  context_id: SESSION.context_id,
  authorization_version: SESSION.authorization_version,
  next_cursor: null,
  thread: {
    id: FIFTY_THREADS.items[0]!.id,
    mailbox_id: MAILBOXES.items[0]!.id,
    subject: 'Routed conversation 1',
    subject_truncated: false,
    unread: true,
    message_count: 1,
  },
  messages: [
    {
      id: '00000000-0000-4000-8000-0000000000d1',
      sender: { display_name: 'Hostile sender', address: 'hostile-sender@example.test' },
      to: [{ display_name: 'Routed user', address: 'routed@example.test' }],
      sent_at: '2026-10-12T00:00:00Z',
      body_text: HOSTILE_BODY,
      body_truncated: false,
      attachment_count: 0,
    },
  ],
}

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

test.describe('production artifact', () => {
  test.skip(PRODUCTION_URL === undefined, 'ELEVATEO_PRODUCTION_URL not set; coordinator must serve the built artifact')
  test.use({ baseURL: PRODUCTION_URL })

  test('a failing API produces an honest error with no fixture fallback or markers', async ({ page }) => {
    await page.route('**/v1/**', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'temporarily_unavailable', message: 'forced by test', request_id: 'e2e-1' }) }))
    await page.goto('/')
    await expect(page.getByText('The session could not be loaded')).toBeVisible()
    const text = (await page.locator('body').textContent()) ?? ''
    for (const marker of FIXTURE_MARKERS) expect(text, `fixture marker leaked: ${marker}`).not.toContain(marker)
    await page.screenshot({ path: 'e2e/.results/production-api-failure.png', fullPage: true })
  })

  test('a hard network failure also stays on the deliberate error, never fixtures', async ({ page }) => {
    await page.route('**/v1/**', (route) => route.abort('connectionrefused'))
    await page.goto('/')
    await expect(page.getByText('The session could not be loaded')).toBeVisible()
    const text = (await page.locator('body').textContent()) ?? ''
    for (const marker of FIXTURE_MARKERS) expect(text, `fixture marker leaked: ${marker}`).not.toContain(marker)
  })

  test('hostile plaintext renders as inert escaped text in the reader; every request stays on the artifact origin', async ({ page }) => {
    const origin = new URL(PRODUCTION_URL!).origin
    const offOrigin: string[] = []
    const hostileRequests: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== origin) offOrigin.push(request.url())
      if (request.url().includes('hostile.invalid')) hostileRequests.push(request.url())
    })
    await page.route('**/v1/session', (route) => route.fulfill(json(SESSION)))
    await page.route('**/v1/mailboxes', (route) => route.fulfill(json(MAILBOXES)))
    await page.route('**/v1/mailboxes/*/threads**', (route) => route.fulfill(json(FIFTY_THREADS)))
    await page.route('**/v1/threads/**', (route) => route.fulfill(json(HOSTILE_THREAD)))
    await page.goto('/')
    await openMailbox(page, 'Routed mailbox')
    // Exact intended row: the full sender-and-subject line of row 1, so rows 10-19 cannot match.
    await expect(page.getByText(/^Sender 1 — Routed conversation 1$/)).toBeVisible()
    await page.locator('a[data-thread]').first().click()
    // The literal tag and URLs are visible as escaped inert text; nothing became live markup.
    await expect(page.getByText('<script>window.__pwned = 1</script>', { exact: false })).toBeVisible()
    await expect(page.getByText('https://hostile.invalid/tracking-pixel.png', { exact: false })).toBeVisible()
    expect(await page.locator('article script, article img, article iframe').count()).toBe(0)
    expect(await page.evaluate(() => '__pwned' in window)).toBe(false)
    // No subresource was fetched for the hostile content, and nothing left the artifact origin.
    expect(hostileRequests).toEqual([])
    expect(offOrigin).toEqual([])
  })

  test('50-row interaction and long-task baseline', async ({ page }, testInfo) => {
    await page.route('**/v1/session', (route) => route.fulfill(json(SESSION)))
    await page.route('**/v1/mailboxes', (route) => route.fulfill(json(MAILBOXES)))
    await page.route('**/v1/mailboxes/*/threads**', (route) => route.fulfill(json(FIFTY_THREADS)))
    await page.goto('/')
    await page.evaluate(() => {
      const w = window as typeof window & { __longTasks: number[] }
      w.__longTasks = []
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) w.__longTasks.push(entry.duration)
      }).observe({ type: 'longtask', buffered: true })
    })
    await openMailbox(page, 'Routed mailbox')
    // Row-link name: a bare getByText would match both the subject span and the preview span.
    await expect(page.getByRole('link', { name: /Routed conversation 50/ })).toBeVisible()

    const started = Date.now()
    // exact filter-pill names: a substring 'Unread' also matches rows carrying the Unread badge.
    await page.getByRole('link', { name: 'Unread', exact: true }).click()
    await expect(page.getByRole('link', { name: 'Unread', exact: true })).toHaveAttribute('aria-current', 'page')
    await page.getByRole('link', { name: 'All', exact: true }).click()
    await expect(page.getByRole('link', { name: 'All', exact: true })).toHaveAttribute('aria-current', 'page')
    const interactionMs = Date.now() - started

    const longTasks = await page.evaluate(() => (window as typeof window & { __longTasks: number[] }).__longTasks)
    // Baseline record, not an unmeasured Web Vitals claim: method and environment are attached and
    // the coordinator records the executed numbers alongside the container/browser versions (D7).
    await testInfo.attach('method-and-environment', {
      contentType: 'application/json',
      body: JSON.stringify(
        {
          method:
            'PerformanceObserver longtask (buffered) across initial 50-row render and two filter toggles; wall-clock of the toggles via Date.now around awaited aria-current assertions.',
          rows: 50,
          interactionMs,
          longTaskCount: longTasks.length,
          longTaskDurationsMs: longTasks,
          userAgent: await page.evaluate(() => navigator.userAgent),
          viewport: page.viewportSize(),
        },
        null,
        2,
      ),
    })
    expect(longTasks.every((duration) => duration < 200), `long tasks observed: ${longTasks.join(', ')}`).toBe(true)
  })
})
