import { expect, test, type Page } from '@playwright/test'
import { browserStorage, composeAndSubmit, control, createDrafts, fillMessage, fixtureButton, intents, replacements, requestRows, reset, shot, signIn, status } from './support'

// AIDEV-NOTE: Critical journeys against the real server (workerd + D1 + durable fake provider) behind its own
// cookie-setting browser fixture. Nothing is mocked, except tests that drop a single answer on its way back.

test.beforeEach(async () => {
  await reset()
})

const pendingPanel = (page: Page) => page.getByRole('region', { name: 'Unconfirmed submissions' })
/** Lets the server handle a new request but drops its answer, or (`reach: false`) drops the request itself. */
async function loseSubmissions(page: Page, reach: boolean): Promise<void> {
  await page.route('**/v1/send-intents', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    if (reach) await route.fetch()
    await route.abort('connectionreset')
  })
}

test('browse pages, open a lazily loaded body, compose, approve and track to acceptance', async ({ page }, info) => {
  const bodyRequests: string[] = []
  page.on('request', (r) => {
    if (/\/v1\/messages\/[^?]+\/[^?]+$/.test(new URL(r.url()).pathname)) bodyRequests.push(r.url())
  })
  await signIn(page)
  // The session is a cookie scripts cannot read: no token anywhere a script could find one.
  expect(await page.evaluate(() => [sessionStorage.length, document.cookie])).toEqual([0, ''])
  expect((await page.context().cookies()).filter((c) => c.name === '__Host-elevateo_session').map((c) => [c.httpOnly, c.secure, c.sameSite])).toEqual([[true, true, 'Strict']])

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

  // Search is a separate bounded metadata request; opening the inbox still fetches no bodies.
  await expect(page.getByRole('link', { name: 'Search stored mail' })).toBeVisible()

  await rows.first().getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Quarterly invoice query', level: 2 })).toBeVisible()
  expect(bodyRequests).toHaveLength(1)
  // Hostile markup is shown as text and does nothing.
  await expect(page.getByText('<script>document.title="INJECTED"</script>')).toBeVisible()
  await expect(page).not.toHaveTitle(/INJECTED/)
  expect(await page.locator('article img, article script').count()).toBe(0)
  await shot(page, info, 'inbox-message')

  // AIDEV-NOTE: Fake-provider fixtures cover ordinary sending; Gmail reply identity has separate boundary tests.
  await page.goto('/compose')
  await page.getByLabel('To', { exact: true }).fill('sender0@partner.example')
  await page.getByLabel('Subject').fill('Quarterly invoice query')
  await page.getByLabel('Message', { exact: true }).fill('Thanks, the invoice is attached to our records.')
  await shot(page, info, 'compose')
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Review before submitting' })).toBeVisible()
  await expect(page.getByText('this mailbox 30 of 30 available')).toBeVisible()
  // Nothing has reached the server, or browser storage, before the person submits.
  expect(await intents('alice')).toEqual([])
  expect(await browserStorage(page)).not.toMatch(/invoice is attached|sender0@partner/)
  await shot(page, info, 'review')
  await page.getByRole('button', { name: 'Submit for approval' }).click()

  await expect(status(page)).toContainText('Awaiting approval')
  await expect(status(page)).toContainText('Nothing is sent until you approve it')
  expect((await intents('alice')).map((i) => i.status)).toEqual(['draft'])
  await shot(page, info, 'awaiting-approval')

  // A reload shows the same saved content, read from the server: the browser kept none of it.
  expect(await browserStorage(page)).not.toMatch(/invoice is attached|sender0@partner|Quarterly/)
  await page.reload()
  await expect(page.getByText('Thanks, the invoice is attached to our records.')).toBeVisible()
  await expect(page.getByText('sender0@partner.example')).toBeVisible()

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

test('a queued request is replaced by exactly one successor, which needs its own approval', async ({ page }, info) => {
  await signIn(page)
  // With dispatch paused on the server, an approved request stays queued.
  await control({ do: 'pause', on: true })
  const original = await composeAndSubmit(page, { to: 'first@partner.example', subject: 'Original wording', body: 'First version.' })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  await expect(status(page)).toContainText('Approval is not sending')

  await page.getByRole('button', { name: 'Edit as a replacement' }).click()
  await expect(page).toHaveURL(new RegExp(`/compose\\?replace=${original}$`))
  // The form starts from what the server saved.
  await expect(page.getByLabel('Subject')).toHaveValue('Original wording')
  await expect(page.getByLabel('To', { exact: true })).toHaveValue('first@partner.example')
  await page.getByLabel('Subject').fill('Corrected wording')
  await shot(page, info, 'replace-edit')
  await page.getByRole('button', { name: 'Review' }).click()
  await expect(page.getByRole('heading', { name: 'Review the replacement' })).toBeVisible()
  // Reviewing changes nothing on the server: the original is still queued.
  expect((await intents('alice')).map((i) => i.status)).toEqual(['pending'])
  await page.getByRole('button', { name: 'Replace and submit for approval' }).click()

  // The edited version is a different request and has not been approved.
  await expect(page.getByRole('heading', { name: 'Corrected wording', level: 2 })).toBeVisible()
  await expect(status(page)).toContainText('Awaiting approval')
  await expect(page.getByRole('button', { name: 'Approve this version' })).toBeVisible()
  const rows = await intents('alice')
  expect(rows.map((i) => i.status).sort()).toEqual(['cancelled', 'draft'])
  expect(new Set(rows.map((i) => i.idempotency_key)).size).toBe(2)
  const successor = new URL(page.url()).pathname.split('/').pop()!
  expect(await replacements('alice')).toEqual([{ predecessor_id: original, successor_id: successor }])

  // The replaced request says so, links to its one replacement, and cannot be replaced again.
  await page.goto(`/sends/${original}`)
  await expect(status(page)).toContainText('Cancelled')
  await expect(page.getByRole('link', { name: 'Open the replacement' })).toHaveAttribute('href', `/sends/${successor}`)
  await expect(page.getByRole('button', { name: 'Edit as a replacement' })).toHaveCount(0)
  await shot(page, info, 'replaced')
  await page.goto(`/compose?replace=${original}`)
  await expect(page.getByText('This request has already been replaced')).toBeVisible()
  expect(await intents('alice')).toHaveLength(2)
})

test('two tabs replacing the same request converge on one successor, and approving in both approves once', async ({ context }) => {
  const first = await context.newPage()
  const second = await context.newPage()
  await signIn(first)
  const original = await composeAndSubmit(first, { to: 'race@partner.example', subject: 'Before the race', body: 'Both tabs edit this.' })
  // The cookie is shared, so the second tab is already signed in.
  await second.goto(`/sends/${original}`)
  await expect(status(second)).toContainText('Awaiting approval')

  for (const [tab, subject] of [[first, 'Edited in tab one'], [second, 'Edited in tab two']] as const) {
    await tab.getByRole('button', { name: 'Edit as a replacement' }).click()
    await tab.getByLabel('Subject').fill(subject)
    await tab.getByRole('button', { name: 'Review' }).click()
    await expect(tab.getByRole('heading', { name: 'Review the replacement' })).toBeVisible()
  }
  await Promise.all([first, second].map((tab) => tab.getByRole('button', { name: 'Replace and submit for approval' }).click()))
  // The tab that lost is told its own wording was not saved as a second request.
  await Promise.any([first, second].map((tab) => tab.getByText('a second one was not created').waitFor()))
  await expect(first).toHaveURL(/\/sends\/[\w-]+$/)
  await expect(second).toHaveURL(/\/sends\/[\w-]+$/)

  // One successor exists; both tabs show that same request, whichever tab's wording won.
  const links = await replacements('alice')
  expect(links).toHaveLength(1)
  expect(links[0]!.predecessor_id).toBe(original)
  const successorPath = `/sends/${links[0]!.successor_id}`
  expect(new URL(first.url()).pathname).toBe(successorPath)
  expect(new URL(second.url()).pathname).toBe(successorPath)
  expect((await intents('alice')).map((i) => i.status).sort()).toEqual(['cancelled', 'draft'])
  const winning = await first.getByRole('heading', { level: 2 }).textContent()
  expect(['Edited in tab one', 'Edited in tab two']).toContain(winning)
  await expect(second.getByRole('heading', { name: winning!, level: 2 })).toBeVisible()

  // The successor was not approved by being created. Approving it in both tabs at once approves it once.
  for (const tab of [first, second]) await expect(status(tab)).toContainText('Awaiting approval')
  await Promise.all([first, second].map((tab) => tab.getByRole('button', { name: 'Approve this version' }).click()))
  for (const tab of [first, second]) {
    await expect(status(tab)).toContainText('Accepted by provider', { timeout: 20_000 })
    await expect(tab.getByRole('button', { name: 'Approve this version' })).toHaveCount(0)
  }
  expect((await intents('alice')).map((i) => i.status).sort()).toEqual(['accepted', 'cancelled'])
  await first.goto('/connections/mailboxes')
  await expect(first.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()).toContainText('29 of 30 available · 1 accepted · 0 held')
})

test('the server refuses approval beyond the mailbox limit and the request stays unapproved', async ({ page }, info) => {
  await signIn(page)
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
  await signIn(page)
  await control({ do: 'pause', on: true })
  const id = await composeAndSubmit(page, { to: 'unknown@partner.example', subject: 'Interrupted send', body: 'The worker stops mid-send.' })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  // A Worker claims the request and dies before recording an outcome; the server's own recovery marks it unknown.
  await control({ do: 'pause', on: false })
  await control({ do: 'crash-claim', owner: 'alice', id })
  await control({ do: 'tick' })

  await page.getByRole('button', { name: 'Check status' }).click()
  await expect(status(page)).toContainText('Outcome unknown')
  await expect(status(page)).toContainText('Do not send it again')
  await expect(status(page)).toContainText('Reference for support')
  for (const name of ['Approve this version', 'Edit as a replacement', 'Cancel request']) await expect(page.getByRole('button', { name })).toHaveCount(0)
  await expect(page.getByText('1 held')).toBeVisible()
  await expect(page.getByText('Held requests have no known release time.')).toBeVisible()
  await shot(page, info, 'unknown')
  // Asking for a replacement by address is refused as well, and creates nothing.
  await page.goto(`/compose?replace=${id}`)
  await expect(page.getByText('This request can no longer be changed')).toBeVisible()
  await page.goto(`/sends/${id}`)
  await expect(status(page)).toContainText('Outcome unknown')

  // No automatic checking of an unknown outcome.
  let checks = 0
  page.on('request', (r) => {
    if (r.url().includes(`/v1/send-intents/${id}`)) checks++
  })
  await page.waitForTimeout(6_000)
  expect(checks).toBe(0)
  expect((await intents('alice')).map((i) => i.status)).toEqual(['unknown'])
})

test('a provider refusal is shown as rejected, with nothing claimed as sent', async ({ page }, info) => {
  await signIn(page)
  await control({ do: 'pause', on: true })
  const id = await composeAndSubmit(page, { to: 'refused@partner.example', subject: 'Provider refuses', body: 'The provider says no.' })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  await control({ do: 'pause', on: false })
  await control({ do: 'dispatch', owner: 'alice', id, scenario: 'reject' })
  await page.getByRole('button', { name: 'Check status' }).click()
  await expect(status(page)).toContainText('Rejected')
  await expect(status(page)).toContainText('It was not sent')
  await expect(status(page)).toContainText('provider rejected')
  await expect(page.getByRole('button', { name: 'Approve this version' })).toHaveCount(0)
  await shot(page, info, 'rejected')
})

test('a lost answer is recovered after reload as the same request, never a second one', async ({ page }, info) => {
  await signIn(page)
  // The server receives and saves the request; only its answer is dropped on the way back.
  await loseSubmissions(page, true)
  await fillMessage(page, { to: 'lost@partner.example', subject: 'Answer lost', body: 'The reply never arrives.' })
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page).toHaveURL(/\/sends$/)
  await expect(pendingPanel(page)).toContainText('Not confirmed')
  await expect(pendingPanel(page)).toContainText('It is not known whether the server saved this request')
  await shot(page, info, 'unconfirmed')
  expect(await intents('alice')).toHaveLength(1)
  // Only the request's key is kept for recovery: no recipient, subject or text.
  const kept = await browserStorage(page)
  expect(kept).toContain('elevateo:pending:')
  expect(kept).not.toMatch(/lost@partner|Answer lost|reply never arrives/)
  await page.unroute('**/v1/send-intents')

  // After a reload the content is gone from memory; the key alone finds the saved request in the server's list.
  await page.reload()
  await expect(requestRows(page)).toHaveCount(1)
  await expect(pendingPanel(page)).toHaveCount(0)
  expect(await browserStorage(page)).not.toContain('elevateo:pending:')
  await requestRows(page).first().getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Answer lost', level: 2 })).toBeVisible()
  await expect(status(page)).toContainText('Awaiting approval')
  expect(await intents('alice')).toHaveLength(1)

  // The same holds for a lost approval: the saved state is read back, not approved twice.
  await page.route('**/approve', async (route) => {
    await route.fetch()
    await route.abort('connectionreset')
  })
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText(/Queued|Sending|Accepted by provider/)
  await page.unroute('**/approve')
  await page.reload()
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
  expect((await intents('alice')).map((i) => i.status)).toEqual(['accepted'])
})

test('a submission that never reached the server is reported as not saved, and nothing is invented', async ({ page }, info) => {
  await signIn(page)
  await loseSubmissions(page, false)
  await fillMessage(page, { to: 'never@partner.example', subject: 'Never arrived', body: 'The request is dropped on the way out.' })
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(pendingPanel(page)).toContainText('Not confirmed')
  await page.unroute('**/v1/send-intents')
  await page.reload()
  await expect(pendingPanel(page)).toContainText('Not saved')
  await expect(pendingPanel(page)).toContainText('It was not saved and nothing was sent')
  await expect(page.getByText('No send requests')).toBeVisible()
  await shot(page, info, 'not-saved')
  expect(await intents('alice')).toEqual([])
  await pendingPanel(page).getByRole('button', { name: 'Dismiss' }).click()
  await expect(pendingPanel(page)).toHaveCount(0)
  expect(await browserStorage(page)).not.toContain('elevateo:pending:')
})

test('more than 100 unfinished requests are paged from the server, none dropped and none kept in the browser', async ({ page }, info) => {
  await signIn(page)
  // The oldest request is one whose answer was lost; 105 newer ones are then created on the server.
  await loseSubmissions(page, true)
  await fillMessage(page, { to: 'oldest@partner.example', subject: 'Oldest and unconfirmed', body: 'Its answer was lost.' })
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(pendingPanel(page)).toContainText('Not confirmed')
  await page.unroute('**/v1/send-intents')
  await createDrafts(page, 105, 'alice-main')
  expect(await intents('alice')).toHaveLength(106)

  // Reload: the lost one is found behind 105 newer requests by its key, without creating anything.
  await page.reload()
  await expect(requestRows(page)).toHaveCount(25)
  await expect(pendingPanel(page)).toHaveCount(0)
  await expect(page.getByText('Page 1')).toBeVisible()
  await shot(page, info, 'many-requests')

  const older = page.getByRole('button', { name: 'Older requests' })
  let seen = 25
  for (const [pageNumber, count] of [[2, 25], [3, 25], [4, 25], [5, 6]] as const) {
    await older.click()
    await expect(page.getByText(`Page ${pageNumber}`)).toBeVisible()
    await expect(requestRows(page)).toHaveCount(count)
    seen += count
  }
  expect(seen).toBe(106)
  await expect(older).toBeDisabled()
  // The position is in the address, so a reload stays on the last page.
  await page.reload()
  await expect(requestRows(page)).toHaveCount(6)

  // Every one is still unfinished on the server, and the browser holds none of their content.
  const rows = await intents('alice')
  expect(rows).toHaveLength(106)
  expect(rows.every((i) => i.status === 'draft')).toBe(true)
  const kept = await browserStorage(page)
  expect(kept).not.toMatch(/Bulk|partner\.example|Oldest|elevateo:sends|elevateo:pending/)
  expect(await page.evaluate(() => localStorage.length)).toBeLessThanOrEqual(2)

  // The oldest is the recovered one; it opens from the server and can still be approved.
  await requestRows(page).last().getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Oldest and unconfirmed', level: 2 })).toBeVisible()
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
  expect((await intents('alice')).filter((i) => i.status === 'accepted')).toHaveLength(1)
})

test('a server outage shows errors, never mail or success, and recovers the pending request', async ({ page }, info) => {
  await signIn(page)
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
  // So does the request history: an error, never an empty list presented as the truth.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Send requests' }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Send requests could not be loaded' })).toBeVisible()
  await expect(page.getByText('No send requests')).toHaveCount(0)
  await shot(page, info, 'outage-requests')

  // A fresh load during the outage shows only the unavailable screen.
  await page.reload()
  await expect(page.getByRole('heading', { name: 'The server is unavailable' })).toBeVisible()
  await expect(page.getByText('Synthetic subject')).toHaveCount(0)
  await shot(page, info, 'outage-startup')
  expect((await intents('alice')).map((i) => i.status)).toEqual(['draft'])

  await control({ do: 'outage', on: false })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(requestRows(page)).toHaveCount(1)
  await requestRows(page).first().getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'During an outage', level: 2 })).toBeVisible()
  await expect(status(page)).toContainText('Awaiting approval')
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
  expect(await intents('alice')).toHaveLength(1)
})

test('an expired session clears what was on screen and cannot be revived', async ({ page }, info) => {
  await signIn(page)
  await composeAndSubmit(page, { to: 'expiry@partner.example', subject: 'Before expiry', body: 'Held by the server.' })
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Inbox' }).click()
  await expect(page.getByText('Quarterly invoice query')).toBeVisible()
  await control({ do: 'expire-session', who: 'alice' })
  await page.getByRole('button', { name: 'Refresh messages' }).click()
  await expect(page.getByText('Your session has ended')).toBeVisible()
  await expect(page.getByText('Quarterly invoice query')).toHaveCount(0)
  await expect(page.getByText('Before expiry')).toHaveCount(0)
  expect(await browserStorage(page)).not.toMatch(/expiry@partner|Before expiry|Quarterly/)
  await shot(page, info, 'session-expired')
  // A reload does not bring the account back, and the expired session cannot be issued again.
  await page.reload()
  await expect(fixtureButton(page, 'alice')).toBeVisible()
  await expect(page.getByText('Quarterly invoice query')).toHaveCount(0)
  await fixtureButton(page, 'alice').click()
  await expect(page.getByText('The fixture session could not be started')).toBeVisible()
  await expect(page.getByText('Quarterly invoice query')).toHaveCount(0)
  // The request made before expiry is still with the server.
  expect((await intents('alice')).map((i) => i.status)).toEqual(['draft'])
})

test('two tabs stay consistent, and signing out in one ends the other', async ({ context }) => {
  const first = await context.newPage()
  const second = await context.newPage()
  await signIn(first)
  await second.goto('/sends')
  await expect(second.getByText('No send requests')).toBeVisible()

  await composeAndSubmit(first, { to: 'tabs@partner.example', subject: 'Seen in both tabs', body: 'Submitted in the first tab.' })
  // The second tab learns of the request without a reload, reads it from the server and opens it.
  await requestRows(second).first().getByRole('link').click()
  await expect(second.getByRole('heading', { name: 'Seen in both tabs', level: 2 })).toBeVisible()
  await expect(status(second)).toContainText('Awaiting approval')
  await second.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(second)).toContainText('Accepted by provider', { timeout: 20_000 })
  // The first tab reflects the approval made elsewhere and no longer offers to approve.
  await expect(status(first)).toContainText('Accepted by provider', { timeout: 20_000 })
  await expect(first.getByRole('button', { name: 'Approve this version' })).toHaveCount(0)
  expect((await intents('alice')).map((i) => i.status)).toEqual(['accepted'])

  // Signing out in one tab ends the session on the server, so the other tab loses its data too.
  await first.getByRole('button', { name: 'Sign out' }).click()
  await expect(fixtureButton(first, 'alice')).toBeVisible()
  await expect(second.getByText('Your session has ended')).toBeVisible()
  await expect(second.getByText('Seen in both tabs')).toHaveCount(0)
  expect(await browserStorage(first)).not.toMatch(/tabs@partner|Seen in both|elevateo:sends|elevateo:pending/)
  expect((await context.cookies()).filter((c) => c.name === '__Host-elevateo_session')).toEqual([])
})

test('one user cannot see another user\'s mailboxes, mail or send requests', async ({ page }) => {
  await signIn(page)
  const aliceIntent = await composeAndSubmit(page, { to: 'private@partner.example', subject: 'Alice only', body: 'Belongs to alice.' })
  await page.getByRole('button', { name: 'Sign out' }).click()

  // Same browser, different account: nothing of alice's remains.
  await fixtureButton(page, 'bob').click()
  await expect(page).toHaveURL(/\/mail\/bob-main$/)
  await expect(page.getByText('Bob private subject')).toBeVisible()
  await expect(page.getByLabel('Mailbox').locator('option')).toHaveText(['bob@pilot.example'])
  await page.goto('/sends')
  await expect(page.getByText('No send requests')).toBeVisible()
  await page.goto(`/sends/${aliceIntent}`)
  await expect(page.getByText('This request could not be loaded')).toBeVisible()
  await expect(page.getByText('Alice only')).toHaveCount(0)
  await page.goto(`/compose?replace=${aliceIntent}`)
  await expect(page.getByText('The request to edit could not be loaded')).toBeVisible()

  // Alice's server-issued ids give bob nothing.
  await page.goto('/mail/alice-main')
  await expect(page.getByText('Mailbox could not be loaded', { exact: true })).toBeVisible()
  await expect(page.getByText('Quarterly invoice query')).toHaveCount(0)
  const probe = (path: string, body?: object) => page.evaluate(async ([p, b]) => (await fetch(p!, b === undefined ? {} : { method: 'POST', credentials: 'same-origin', headers: { 'x-elevateo-csrf': '1', ...(b === null ? {} : { 'content-type': 'application/json' }) }, ...(b === null ? {} : { body: b }) })).status, [path, body === undefined ? undefined : Object.keys(body).length ? JSON.stringify(body) : null] as const)
  // A well-formed replacement, so a refusal is about whose request it is and not about the payload.
  const replacement = { revision: 'a'.repeat(64), draft: { mailboxId: 'bob-main', to: ['x@partner.example'], subject: 'S', body: 'B', kind: 'manual', revision: 1, idempotencyKey: 'probe-key-1' } }
  expect(await page.evaluate(async () => ((await (await fetch('/v1/messages?mailboxId=alice-main')).json()) as { items: unknown[] }).items.length)).toBe(0)
  expect(await page.evaluate(async () => ((await (await fetch('/v1/send-intents')).json()) as { items: unknown[] }).items.length)).toBe(0)
  expect(await probe('/v1/messages/alice-main/msg-119')).toBe(404)
  expect(await probe(`/v1/send-intents/${aliceIntent}`)).toBe(404)
  expect(await probe(`/v1/send-intents/${aliceIntent}/content`)).toBe(404)
  // Cancelling answers a foreign id exactly as it answers one that does not exist, and changes nothing.
  expect(await probe(`/v1/send-intents/${aliceIntent}/cancel`, {})).toBe(await probe('/v1/send-intents/no-such-request/cancel', {}))
  expect(await probe(`/v1/send-intents/${aliceIntent}/replace`, replacement)).toBe(404)
  expect(await intents('bob')).toEqual([])
  expect(await probe('/v1/mailboxes/alice-main/quota')).toBe(404)
  expect((await intents('alice')).map((i) => i.status)).toEqual(['draft'])
})

test('when the account behind the session changes in another tab, the first tab drops the old account', async ({ context }) => {
  const first = await context.newPage()
  const second = await context.newPage()
  await signIn(first)
  const aliceIntent = await composeAndSubmit(first, { to: 'switch@partner.example', subject: 'Alice before the switch', body: 'Must not stay on screen.' })
  await second.goto('/')
  await expect(second.getByText('Quarterly invoice query')).toBeVisible()

  // The session cookie is replaced with bob's without the first tab doing anything.
  expect(await second.evaluate(async () => (await fetch('/__fixture/session', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-elevateo-csrf': '1' }, body: JSON.stringify({ user: 'bob' }) })).status)).toBe(200)
  await second.goto('/')
  await expect(second.getByText('Bob private subject')).toBeVisible()

  // The first tab is told, asks the server who it is, and keeps nothing of alice's.
  await expect(first.getByText('Alice before the switch')).toHaveCount(0)
  await expect(first.getByText('This request could not be loaded')).toBeVisible()
  await first.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Inbox' }).click()
  await expect(first.getByText('Bob private subject')).toBeVisible()
  await expect(first.getByText('Quarterly invoice query')).toHaveCount(0)
  expect((await intents('alice')).map((i) => i.id)).toEqual([aliceIntent])
  expect(await intents('bob')).toEqual([])
})

test('items left in the browser by the earlier version are recovered or kept until explicitly discarded', async ({ page }) => {
  await signIn(page)
  const held = await composeAndSubmit(page, { to: 'kept@partner.example', subject: 'Held by the server', body: 'Already saved.' })
  // What the earlier version stored: a token in tab storage and whole send records in shared storage.
  await page.evaluate((id) => {
    sessionStorage.setItem('elevateo:session', 't'.repeat(48))
    const old = { mailboxId: 'alice-main', to: ['old@partner.example'], cc: [], bcc: [], subject: 'Old subject', body: 'Old private text' }
    const record = (patch: object) => ({ key: crypto.randomUUID(), status: 'draft', intentId: null, revision: null, createdAt: new Date().toISOString(), content: old, ...patch })
    // First: exactly what the server holds, under the same key. Then a draft never submitted, a record whose request
    // is gone, and one pointing at a real request whose saved text is different.
    const same = record({ intentId: id.id, key: id.key, content: { ...old, to: ['kept@partner.example'], subject: 'Held by the server', body: 'Already saved.' } })
    localStorage.setItem('elevateo:sends:0123456789abcdef01234567', JSON.stringify([same, record({ status: 'local_draft' }), record({ intentId: 'gone-request' }), record({ intentId: id.id })]))
  }, { id: held, key: (await intents('alice'))[0]!.idempotency_key })
  const storedBefore = await page.evaluate(() => (JSON.parse(localStorage.getItem('elevateo:sends:0123456789abcdef01234567')!) as unknown[]).slice(1))
  await page.goto('/sends')

  // The token is removed at start. The record the server holds is dropped from the browser; the other two stay.
  const panel = page.getByRole('region', { name: 'Items from an earlier version' })
  await expect(panel).toContainText('3 items from an earlier version of this app are still stored in this browser')
  expect(await page.evaluate(() => sessionStorage.getItem('elevateo:session'))).toBeNull()
  await expect(page.getByText('Old private text')).toHaveCount(0)
  await expect(page.getByText('Old subject')).toHaveCount(0)
  const stillStored = () => page.evaluate(() => JSON.parse(localStorage.getItem('elevateo:sends:0123456789abcdef01234567') ?? '[]') as unknown[])
  expect(await stillStored()).toEqual(storedBefore)
  // Nothing was created on the server from them.
  expect(await intents('alice')).toHaveLength(1)

  // They survive a reload, and go only when the person says so.
  await page.reload()
  await expect(panel).toContainText('3 items')
  expect(await stillStored()).toEqual(storedBefore)
  await panel.getByRole('button', { name: 'Discard them' }).click()
  await page.getByRole('button', { name: 'Discard', exact: true }).click()
  await expect(panel).toHaveCount(0)
  expect(await browserStorage(page)).not.toMatch(/elevateo:sends|Old private text/)
  await expect(requestRows(page)).toHaveCount(1)
})

test('status checks are bounded and stop when the request page closes', async ({ page }) => {
  await signIn(page)
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

test('provider gates stay disabled while selected-mailbox AI permissions are independent', async ({ page }, info) => {
  await signIn(page)
  const requests: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.startsWith('/v1/') && r.method() !== 'GET') requests.push(r.url())
  })
  // Overview, contacts and campaigns have real server-backed journeys in product.spec.ts.
  await page.goto('/assistant')
  await expect(page.getByRole('heading', { name: 'AI Assistant', exact: true })).toBeVisible()
  await page.getByLabel('Mailbox', { exact: true }).selectOption('alice-main')
  await expect(page.getByText('Enable AI reading for this mailbox in Connections to inspect context.')).toBeVisible()
  await expect(page.getByText('Enable AI drafting for this mailbox in Connections to save a draft.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save draft without sending' })).toHaveCount(0)
  await shot(page, info, 'assistant-permission-gates')
  for (const section of ['domains']) {
    await page.goto(`/connections/${section}`)
    await expect(page.getByText('Not available yet.')).toBeVisible()
    await expect(page.locator('main').locator('input, textarea, select')).toHaveCount(0)
  }
  // AIDEV-NOTE: Sending now has server-backed metadata; disabled configuration must hide secret entry and writes.
  await page.goto('/connections/sending')
  await expect(page.getByText('Resend is disabled until server encryption and provider configuration are ready.')).toBeVisible()
  await expect(page.getByLabel('Resend API key')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Store key' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Verify sender' })).toHaveCount(0)
  await expect(page.getByLabel('Connection to manage')).toHaveValue('')
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
  // Exactly one write reached the server, and it was the permission change.
  expect(requests).toHaveLength(1)
  expect(requests[0]).toMatch(/\/v1\/mailboxes\/alice-main\/permissions$/)
})


test('search stored subjects and open only the selected body', async ({ page }, info) => {
  await signIn(page)
  const bodies: string[] = []
  page.on('request', request => {
    if (/\/v1\/messages\/alice-main\/[^/?]+$/.test(new URL(request.url()).pathname)) bodies.push(request.url())
  })
  await page.getByRole('link', { name: 'Search stored mail' }).click()
  await page.getByLabel('Subject or sender').fill('Quarterly invoice')
  await page.getByRole('button', { name: 'Search newest messages' }).click()
  const results = page.getByRole('region', { name: 'Search results' })
  await expect(results.getByRole('link')).toHaveCount(1)
  expect(bodies).toHaveLength(0)
  await shot(page, info, 'search-results')
  await results.getByRole('link').click()
  await expect(page.getByRole('heading', { name: 'Quarterly invoice query', level: 2 })).toBeVisible()
  expect(bodies).toHaveLength(1)
})

test('unsupported reply source never becomes an ordinary send, including after retry', async ({ page }) => {
  await signIn(page)
  await page.getByRole('list', { name: 'Messages in alice@pilot.example' }).getByRole('listitem').first().getByRole('link').click()
  await page.getByRole('button', { name: 'Reply' }).click()
  await expect(page.getByRole('heading', { name: 'This message cannot be replied to' })).toBeVisible()
  await expect(page.getByLabel('Message', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Review', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'This message cannot be replied to' })).toBeVisible()
  expect(await intents('alice')).toEqual([])
  expect(await browserStorage(page)).not.toMatch(/Quarterly|sender0@partner/)
})
