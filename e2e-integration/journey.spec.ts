import { expect, test } from '@playwright/test'
import { composeAndSubmit, control, intents, reset, shot, signIn, status, type Sessions } from './support'

// AIDEV-NOTE: Critical journeys against the real server (workerd + D1 + durable fake provider). Nothing is mocked,
// except one test that drops a single answer on its way back, after the server has already handled the request.

let sessions: Sessions
test.beforeEach(async () => {
  sessions = await reset()
})

test('browse pages, open a lazily loaded body, reply, approve and track to acceptance', async ({ page }, info) => {
  const bodyRequests: string[] = []
  page.on('request', (r) => {
    if (/\/v1\/messages\/[^?]+\/[^?]+$/.test(new URL(r.url()).pathname)) bodyRequests.push(r.url())
  })
  await signIn(page, sessions.alice)

  // Server-issued mailbox id in the URL, one bounded page of summaries, no bodies fetched yet.
  await expect(page).toHaveURL(/\/mail\/alice-main$/)
  const rows = page.getByRole('list', { name: 'Messages in alice@pilot.example' }).getByRole('listitem')
  await expect(rows).toHaveCount(50)
  await expect(rows.first()).toContainText('Quarterly invoice query')
  expect(bodyRequests).toEqual([])

  await page.getByRole('button', { name: 'Older messages' }).click()
  await expect(page.getByText('Page 2')).toBeVisible()
  await expect(rows).toHaveCount(50)
  await expect(rows.first()).toContainText('Synthetic subject 69')
  // The page position is in the address, so a reload reopens the same page rather than the newest one.
  await expect(page).toHaveURL(/\/mail\/alice-main\?before=\d+&beforeId=[\w-]+$/)
  await page.reload()
  await expect(page.getByText('Page 2')).toBeVisible()
  await expect(rows.first()).toContainText('Synthetic subject 69')
  await page.getByRole('button', { name: 'Older messages' }).click()
  await expect(page.getByText('Page 3')).toBeVisible()
  await expect(rows).toHaveCount(20)
  await page.getByRole('button', { name: 'Newer messages' }).click()
  await page.getByRole('button', { name: 'Newer messages' }).click()
  await expect(page.getByText('Page 1')).toBeVisible()

  // The server offers no search, so the page offers none.
  await expect(page.getByText('Search is not available yet.')).toBeVisible()
  await expect(page.getByRole('searchbox')).toHaveCount(0)

  await rows.first().getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Quarterly invoice query', level: 2 })).toBeVisible()
  expect(bodyRequests).toHaveLength(1)
  // Hostile markup is shown as text and does nothing.
  await expect(page.getByText('<script>document.title="INJECTED"</script>')).toBeVisible()
  await expect(page).not.toHaveTitle(/INJECTED/)
  expect(await page.locator('article img, article script').count()).toBe(0)
  await shot(page, info, 'inbox-message')

  await page.getByRole('button', { name: 'Reply' }).click()
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('sender0@partner.example')
  await expect(page.getByLabel('Subject')).toHaveValue('Re: Quarterly invoice query')
  await page.getByLabel('Message', { exact: true }).fill('Thanks, the invoice is attached to our records.')
  await shot(page, info, 'compose')
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Review before submitting' })).toBeVisible()
  await expect(page.getByText('this mailbox 30 of 30 available')).toBeVisible()
  // Nothing has reached the server before the person submits.
  expect(await intents('alice')).toEqual([])
  await shot(page, info, 'review')
  await page.getByRole('button', { name: 'Submit for approval' }).click()

  await expect(status(page)).toContainText('Awaiting approval')
  await expect(status(page)).toContainText('Nothing is sent until you approve it')
  expect((await intents('alice')).map((i) => i.status)).toEqual(['draft'])
  await shot(page, info, 'awaiting-approval')

  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
  await expect(status(page)).toContainText('Acceptance is not delivery')
  await expect(status(page)).toContainText('Simulated provider · no real email')
  await expect(page.getByRole('button', { name: 'Approve this version' })).toHaveCount(0)
  expect((await intents('alice')).map((i) => i.status)).toEqual(['accepted'])
  await shot(page, info, 'accepted')

  // Capacity comes from the server: one recipient used, with no countdown.
  await page.goto('/connections/mailboxes')
  const main = page.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()
  await expect(main).toContainText('29 of 30 available · 1 accepted · 0 held')
  await expect(page.getByText(/resets? in|countdown/i)).toHaveCount(0)
  await expect(page.getByText('2 of 10 mailboxes connected')).toBeVisible()
  await shot(page, info, 'connections-mailboxes')
})

test('a queued request can be cancelled and edited only as a new request needing new approval', async ({ page }) => {
  await signIn(page, sessions.alice)
  // With dispatch paused on the server, an approved request stays queued.
  await control({ do: 'pause', on: true })
  await composeAndSubmit(page, { to: 'first@partner.example', subject: 'Original wording', body: 'First version.' })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  await expect(status(page)).toContainText('Approval is not sending')

  await page.getByRole('button', { name: 'Cancel and edit' }).click()
  await page.getByRole('button', { name: 'Cancel and edit' }).last().click()
  await expect(page).toHaveURL(/\/compose\?draft=/)
  await expect(page.getByLabel('Subject')).toHaveValue('Original wording')
  await page.getByLabel('Subject').fill('Corrected wording')
  await page.getByRole('button', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  // The edited version is a different request and has not been approved.
  await expect(status(page)).toContainText('Awaiting approval')
  await expect(page.getByRole('button', { name: 'Approve this version' })).toBeVisible()
  const rows = await intents('alice')
  expect(rows.map((i) => i.status).sort()).toEqual(['cancelled', 'draft'])
  expect(new Set(rows.map((i) => i.idempotency_key)).size).toBe(2)
})

test('the server refuses approval beyond the mailbox limit and the request stays unapproved', async ({ page }, info) => {
  await signIn(page, sessions.alice)
  const thirty = Array.from({ length: 30 }, (_, i) => `person${i}@partner.example`).join(', ')
  await composeAndSubmit(page, { to: thirty, subject: 'Thirty recipients', body: 'Uses the whole allowance.' })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })

  await composeAndSubmit(page, { to: 'one.more@partner.example', subject: 'One too many', body: 'Should be refused.' })
  await expect(page.getByText('this mailbox 0 of 30 available · 30 accepted · 0 held')).toBeVisible()
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.getByText('does not have enough remaining capacity')).toBeVisible()
  await expect(status(page)).toContainText('Awaiting approval')
  const rows = await intents('alice')
  expect(rows.map((i) => i.status).sort()).toEqual(['accepted', 'draft'])
  await shot(page, info, 'quota-refused')

  await page.goto('/connections/mailboxes')
  const main = page.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()
  await expect(main).toContainText('0 of 30 available · 30 accepted · 0 held')
  await expect(main).toContainText('No capacity')
  await expect(main).toContainText('frees part of the capacity, not all of it')
  await shot(page, info, 'connections-no-capacity')
})

test('an unknown outcome is shown as unknown, is not polled, and offers no way to send again', async ({ page }, info) => {
  await signIn(page, sessions.alice)
  await control({ do: 'pause', on: true })
  await composeAndSubmit(page, { to: 'unknown@partner.example', subject: 'Interrupted send', body: 'The worker stops mid-send.' })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  const [intent] = await intents('alice')
  // A Worker claims the request and dies before recording an outcome; the server's own recovery marks it unknown.
  await control({ do: 'pause', on: false })
  await control({ do: 'crash-claim', owner: 'alice', id: intent!.id })
  await control({ do: 'tick' })

  await page.getByRole('button', { name: 'Check status' }).click()
  await expect(status(page)).toContainText('Outcome unknown')
  await expect(status(page)).toContainText('Do not send it again')
  await expect(status(page)).toContainText('Reference for support')
  for (const name of ['Approve this version', 'Cancel and edit', 'Cancel request', 'Remove from list']) await expect(page.getByRole('button', { name })).toHaveCount(0)
  await expect(page.getByText('1 held')).toBeVisible()
  await expect(page.getByText('Held requests have no known release time.')).toBeVisible()
  await shot(page, info, 'unknown')

  // No automatic checking of an unknown outcome.
  let checks = 0
  page.on('request', (r) => {
    if (r.url().includes(`/v1/send-intents/${intent!.id}`)) checks++
  })
  await page.waitForTimeout(6_000)
  expect(checks).toBe(0)
  expect((await intents('alice')).map((i) => i.status)).toEqual(['unknown'])
})

test('a provider refusal is shown as rejected, with nothing claimed as sent', async ({ page }, info) => {
  await signIn(page, sessions.alice)
  await control({ do: 'pause', on: true })
  await composeAndSubmit(page, { to: 'refused@partner.example', subject: 'Provider refuses', body: 'The provider says no.' })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  const [intent] = await intents('alice')
  await control({ do: 'pause', on: false })
  await control({ do: 'dispatch', owner: 'alice', id: intent!.id, scenario: 'reject' })
  await page.getByRole('button', { name: 'Check status' }).click()
  await expect(status(page)).toContainText('Rejected')
  await expect(status(page)).toContainText('It was not sent')
  await expect(status(page)).toContainText('provider rejected')
  await shot(page, info, 'rejected')
})

test('a lost answer is recovered after reload as the same request, never a second one', async ({ page }) => {
  await signIn(page, sessions.alice)
  // The server receives and saves the request; only its answer is dropped on the way back.
  await page.route('**/v1/send-intents', async (route) => {
    await route.fetch()
    await route.abort('connectionreset')
  })
  await composeAndSubmit(page, { to: 'lost@partner.example', subject: 'Answer lost', body: 'The reply never arrives.' })
  await expect(status(page)).toContainText('Not confirmed')
  await expect(page.getByText('It is not known whether the server saved this request')).toBeVisible()
  expect(await intents('alice')).toHaveLength(1)
  await page.unroute('**/v1/send-intents')

  await page.reload()
  await expect(status(page)).toContainText('Awaiting approval')
  expect(await intents('alice')).toHaveLength(1)

  // The same holds for a lost approval: after reload the saved state is read back, not approved twice.
  await page.route('**/approve', async (route) => {
    await route.fetch()
    await route.abort('connectionreset')
  })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  // The app reads the saved state back instead of approving again.
  await expect(status(page)).toContainText(/Queued|Sending|Accepted by provider/)
  await page.unroute('**/approve')
  await page.reload()
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
  expect((await intents('alice')).map((i) => i.status)).toEqual(['accepted'])
})

test('a server outage shows errors, never mail or success, and recovers the pending request', async ({ page }, info) => {
  await signIn(page, sessions.alice)
  await composeAndSubmit(page, { to: 'outage@partner.example', subject: 'During an outage', body: 'Approve while the server is down.' })
  await expect(status(page)).toContainText('Awaiting approval')

  await control({ do: 'outage', on: true })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.getByText('It is not known whether the approval was recorded')).toBeVisible()
  await expect(status(page)).toContainText('Awaiting approval')
  await expect(status(page)).not.toContainText('Accepted')
  await shot(page, info, 'outage-approval')

  // Reading mail during the outage shows an error state and no rows.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Inbox' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Messages could not be loaded' })).toBeVisible()
  await expect(page.getByRole('list', { name: /Messages in/ })).toHaveCount(0)
  await shot(page, info, 'outage-inbox')

  // A fresh load during the outage shows only the unavailable screen.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The server is unavailable' })).toBeVisible()
  await expect(page.getByText('Synthetic subject')).toHaveCount(0)
  await shot(page, info, 'outage-startup')
  expect((await intents('alice')).map((i) => i.status)).toEqual(['draft'])

  await control({ do: 'outage', on: false })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Send requests' }).click()
  await page.getByRole('link', { name: /During an outage/ }).click()
  await expect(status(page)).toContainText('Awaiting approval')
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
  expect(await intents('alice')).toHaveLength(1)
})

test('an expired session clears what was on screen and asks to sign in again', async ({ page }, info) => {
  await signIn(page, sessions.aliceExpiring)
  await expect(page.getByText('Quarterly invoice query')).toBeVisible()
  await control({ do: 'expire-session', who: 'aliceExpiring' })
  await page.getByRole('button', { name: 'Refresh messages' }).click()
  await expect(page.getByText('Your session has ended')).toBeVisible()
  await expect(page.getByText('Quarterly invoice query')).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('elevateo:session'))).toBeNull()
  await shot(page, info, 'session-expired')
  // The dead session is refused if tried again; a valid one works.
  await page.getByLabel('Pilot session').fill(sessions.aliceExpiring)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('The server did not accept that session')).toBeVisible()
  await expect(page.getByText('Quarterly invoice query')).toHaveCount(0)
  await page.getByLabel('Pilot session').fill(sessions.alice)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
})

test('two tabs stay consistent and a request is approved only once', async ({ context }) => {
  const first = await context.newPage()
  const second = await context.newPage()
  await signIn(first, sessions.alice)
  await signIn(second, sessions.alice)
  await second.goto('/sends')

  await composeAndSubmit(first, { to: 'tabs@partner.example', subject: 'Seen in both tabs', body: 'Submitted in the first tab.' })
  // The second tab learns of the request without a reload and opens it.
  await second.getByRole('link', { name: /Seen in both tabs/ }).click()
  await expect(status(second)).toContainText('Awaiting approval')
  await second.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(second)).toContainText('Accepted by provider', { timeout: 20_000 })
  // The first tab reflects the approval made elsewhere and no longer offers to approve.
  await expect(status(first)).toContainText('Accepted by provider', { timeout: 20_000 })
  await expect(first.getByRole('button', { name: 'Approve this version' })).toHaveCount(0)
  expect((await intents('alice')).map((i) => i.status)).toEqual(['accepted'])

  // Signing out in one tab ends the other, and clears stored requests.
  await first.getByRole('button', { name: 'Sign out' }).click()
  await expect(first.getByLabel('Pilot session')).toBeVisible()
  await expect(second.getByLabel('Pilot session')).toBeVisible()
  expect(await first.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('elevateo:sends:')))).toEqual([])
})

test('one user cannot see another user\'s mailboxes, mail or send requests', async ({ page }) => {
  await signIn(page, sessions.alice)
  await composeAndSubmit(page, { to: 'private@partner.example', subject: 'Alice only', body: 'Belongs to alice.' })
  const [aliceIntent] = await intents('alice')
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByLabel('Pilot session')).toBeVisible()

  // Same browser, different account: nothing of alice's remains.
  await page.getByLabel('Pilot session').fill(sessions.bob)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page).toHaveURL(/\/mail\/bob-main$/)
  await expect(page.getByText('Bob private subject')).toBeVisible()
  await expect(page.getByLabel('Mailbox').locator('option')).toHaveText(['bob@pilot.example'])
  await page.goto('/sends')
  await expect(page.getByText('No send requests')).toBeVisible()
  await expect(page.getByText('Alice only')).toHaveCount(0)

  // Alice's server-issued ids give bob nothing.
  await page.goto('/mail/alice-main')
  await expect(page.getByText('Mailbox not found')).toBeVisible()
  const probe = (path: string) => page.evaluate(async ([p, t]) => (await fetch(p!, { headers: { authorization: `Bearer ${t}` } })).status, [path, sessions.bob])
  expect(await probe('/v1/messages?mailboxId=alice-main')).toBe(200)
  expect(await page.evaluate(async (t) => ((await (await fetch('/v1/messages?mailboxId=alice-main', { headers: { authorization: `Bearer ${t}` } })).json()) as { items: unknown[] }).items.length, sessions.bob)).toBe(0)
  expect(await probe('/v1/messages/alice-main/msg-119')).toBe(404)
  expect(await probe(`/v1/send-intents/${aliceIntent!.id}`)).toBe(404)
  expect(await probe('/v1/mailboxes/alice-main/quota')).toBe(404)
})

test('status checks are bounded and stop when the request page closes', async ({ page }) => {
  await signIn(page, sessions.alice)
  await control({ do: 'pause', on: true })
  await composeAndSubmit(page, { to: 'polling@partner.example', subject: 'Stays queued', body: 'Dispatch is paused.' })
  let checks = 0
  page.on('request', (r) => {
    if (/\/v1\/send-intents\/[^/]+$/.test(new URL(r.url()).pathname) && r.method() === 'GET') checks++
  })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  await page.waitForTimeout(8_000)
  // Backoff of 1.5s, 2.5s, 3.5s… plus the read after approval: a handful of checks, not a tight loop.
  expect(checks).toBeGreaterThanOrEqual(2)
  expect(checks).toBeLessThanOrEqual(5)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Inbox' }).click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
  const afterLeaving = checks
  await page.waitForTimeout(8_000)
  expect(checks).toBe(afterLeaving)
})

test('unsupported areas say they are unavailable and offer no working control', async ({ page }, info) => {
  await signIn(page, sessions.alice)
  const requests: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/v1/') && r.method() !== 'GET') requests.push(r.url())
  })
  for (const [path, heading] of [
    ['/overview', 'Overview is not available yet'],
    ['/campaigns', 'Campaigns is not available yet'],
    ['/campaigns/new', 'Campaigns is not available yet'],
    ['/contacts', 'Contacts is not available yet'],
    ['/assistant', 'AI Assistant is not available yet'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading })).toBeVisible()
    await expect(page.locator('main').getByRole('button')).toHaveCount(0)
  }
  await shot(page, info, 'unavailable-assistant')
  for (const section of ['sending', 'enrichment', 'domains']) {
    await page.goto(`/connections/${section}`)
    await expect(page.getByText('Not available yet.')).toBeVisible()
    await expect(page.locator('main').locator('input, textarea, select')).toHaveCount(0)
  }
  // AI permissions are real server flags, kept separate, and all off by default.
  await page.goto('/connections/ai')
  const row = page.getByRole('list', { name: 'AI permissions by mailbox' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()
  await expect(row.getByRole('switch')).toHaveCount(3)
  for (const toggle of await row.getByRole('switch').all()) await expect(toggle).toHaveAttribute('aria-checked', 'false')
  await row.getByRole('switch', { name: 'May read this mailbox' }).click()
  await expect(row.getByRole('switch', { name: 'May read this mailbox' })).toHaveAttribute('aria-checked', 'true')
  await expect(row.getByRole('switch', { name: 'May prepare drafts' })).toHaveAttribute('aria-checked', 'false')
  await page.reload()
  await expect(page.getByRole('list', { name: 'AI permissions by mailbox' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first().getByRole('switch', { name: 'May read this mailbox' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText(/never follows|never followed/)).toHaveCount(0)
  await shot(page, info, 'connections-ai')
  expect(requests.every((u) => u.endsWith('/permissions'))).toBe(true)
})
