// Authored, not executed: BE-02 C/D journeys against the labelled fixture entry. The entry builds
// ONE stateful fixture gateway per DOCUMENT LOAD, so hash navigations within a page observe each
// other's writes (a saved draft is listed, a read mark persists). A scripted example per
// operation (#/fixtures?saveDraft=draft_conflict) forces a definitive or uncertain outcome, but
// the script is read only while that document loads: a same-document hash change to the scripted
// URL re-scripts nothing, so every scripted scenario starts from a fresh load (`loadScripted`).
// These prove client policy over the fixture only; nothing here talks to Rails.
//
// Evidence captures: every PNG is written after a route-specific ready assertion under a
// project-qualified name (desktop / narrow-390 / reduced-motion), so one project cannot overwrite
// another's capture and a file always shows the route its name claims. Editor states are captured
// with a tall viewport so the fields, the alert and its recovery controls are all in one image
// (the shell's main region scrolls internally, so a full-page capture alone shows only the top).
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { expectMailboxNavReady, openMailbox } from './support'

const ENTRY = '/dev-fixtures.html'
const MAILBOX = '00000000-0000-4000-8000-000000000023'
const THREAD = '00000000-0000-4000-8000-000000000033'
const DRAFT = '00000000-0000-4000-8000-000000000051'
const READER = '00000000-0000-4000-8000-000000000003'
const ACTOR = '00000000-0000-4000-8000-000000000001'
const at = (route: string) => `${ENTRY}#${route}`

/**
 * Loads the entry fresh with a fixture script, then opens the route. Leaving the document first
 * makes the second goto a real load even when the page already shows the entry; otherwise the
 * hash merely changes in place and the unscripted gateway built earlier keeps answering.
 */
async function loadScripted(page: Page, script: string, route: string) {
  await page.goto('about:blank')
  await page.goto(at(`/fixtures?${script}`))
  await page.goto(at(route))
}

async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

const shot = (testInfo: TestInfo, name: string) => `e2e/.results/${testInfo.project.name}-cd-${name}.png`

async function capture(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({ path: shot(testInfo, name), fullPage: true })
}

/** Captures the whole editor (fields, alert and recovery controls) by lending the page enough height. */
async function captureEditor(page: Page, testInfo: TestInfo, name: string) {
  const size = page.viewportSize() ?? { width: 1280, height: 720 }
  await page.setViewportSize({ width: size.width, height: 1800 })
  await expect(page.getByLabel('Subject')).toBeVisible()
  const alert = page.getByRole('alert')
  if ((await alert.count()) > 0) {
    await alert.first().scrollIntoViewIfNeeded()
    await expect(alert.first()).toBeInViewport()
  }
  await page.screenshot({ path: shot(testInfo, name), fullPage: true })
  await page.setViewportSize(size)
}

/** The C/D routes with the assertion that proves each one is the route it claims to be. */
const CD_ROUTES: Array<{ name: string; route: string; ready(page: Page): Promise<void> }> = [
  { name: 'drafts', route: `/mailboxes/${MAILBOX}/drafts`, ready: (page) => expect(page.getByRole('heading', { name: 'Drafts' })).toBeVisible() },
  { name: 'draft-editor', route: `/mailboxes/${MAILBOX}/drafts/${DRAFT}`, ready: (page) => expect(page.getByText('Saved version 2')).toBeVisible() },
  { name: 'reader', route: `/mailboxes/${MAILBOX}/threads/${THREAD}`, ready: (page) => expect(page.getByRole('heading', { name: 'Synthetic thread' })).toBeVisible() },
  { name: 'members', route: `/mailboxes/${MAILBOX}/members`, ready: (page) => expect(page.getByText('Roster revision 1')).toBeVisible() },
  { name: 'search', route: '/search?q=plaintext', ready: (page) => expect(page.getByRole('heading', { name: 'Search' })).toBeVisible() },
]

test('the C/D mailbox exposes Drafts and Members; the read-only inbox does not', async ({ page }, testInfo) => {
  await page.goto(ENTRY)
  await expectMailboxNavReady(page)
  await openMailbox(page, 'Fixture inbox')
  await expect(page.getByRole('link', { name: 'Drafts' })).toHaveCount(0)
  await openMailbox(page, 'C/D fixture mailbox')
  await page.goto(at(`/mailboxes/${MAILBOX}/drafts`))
  await expect(page.getByRole('heading', { name: 'Drafts' })).toBeVisible()
  await expect(page.getByText('Stored on this installation only')).toBeVisible()
  await expect(page.getByRole('link', { name: /Fixture draft/ })).toBeVisible()
  await capture(page, testInfo, 'drafts')
})

test('a new draft is created by an explicit save and then listed', async ({ page }, testInfo) => {
  await page.goto(at(`/mailboxes/${MAILBOX}/drafts`))
  await page.getByRole('button', { name: 'New draft' }).click()
  await expect(page.getByRole('heading', { name: 'New draft' })).toBeVisible()
  await expect(page.getByText('Draft only — nothing is sent')).toBeVisible()
  await expect(page.getByText('Not saved yet')).toBeVisible()
  await page.getByLabel('Subject').fill('Browser draft')
  await page.getByLabel('To').fill('Fixture recipient <recipient@example.test>')
  await page.getByLabel('Message').fill('<script>alert(1)</script> plain body')
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expect(page.getByText('Saved version 1')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Browser draft' })).toBeVisible()
  expect(await page.locator('article script, article img').count()).toBe(0)
  await captureEditor(page, testInfo, 'draft-saved')
  await page.getByRole('link', { name: 'Back to drafts' }).click()
  await expect(page.getByRole('link', { name: /Browser draft/ })).toBeVisible()
})

test('a definitive conflict never overwrites: my text is kept and rebase re-enables saving', async ({ page }, testInfo) => {
  await loadScripted(page, 'saveDraft=draft_conflict', `/mailboxes/${MAILBOX}/drafts/${DRAFT}`)
  await expect(page.getByText('Saved version 2')).toBeVisible()
  await page.getByLabel('Subject').fill('Edited in browser')
  await page.getByRole('button', { name: 'Save changes' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('This draft changed elsewhere')
  await expect(alert).toContainText('nothing was overwritten')
  await expect(page.getByLabel('Subject')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Keep my text and continue from the server version' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discard my text and load the server copy' })).toBeVisible()
  await captureEditor(page, testInfo, 'draft-conflict')
  await page.getByRole('button', { name: 'Keep my text and continue from the server version' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('Subject')).toHaveValue('Edited in browser')
  await expect(page.getByText('Unsaved changes')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled()
})

test('an uncertain save keeps the text and the ledger lookup does not invent certainty', async ({ page }, testInfo) => {
  await loadScripted(page, 'saveDraft=temporarily_unavailable', `/mailboxes/${MAILBOX}/drafts/${DRAFT}`)
  await expect(page.getByText('Saved version 2')).toBeVisible()
  await page.getByLabel('Message').fill('Unconfirmed body')
  await page.getByRole('button', { name: 'Save changes' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('The save was not confirmed')
  await expect(alert).toContainText('same attempt id and text')
  await expect(page.getByRole('button', { name: 'Retry this save' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check what the server stored' })).toBeVisible()
  await captureEditor(page, testInfo, 'draft-uncertain')
  await page.getByRole('button', { name: 'Check what the server stored' }).click()
  // The lookup note is a status line above the form; the attempt and its controls stay.
  await expect(page.getByRole('status').filter({ hasText: 'No record of this save is visible yet' })).toBeVisible()
  await expect(alert).toContainText('The save was not confirmed')
  await expect(page.getByLabel('Message')).toHaveValue('Unconfirmed body')
  await expect(page.getByRole('button', { name: 'Retry this save' })).toBeVisible()
  await captureEditor(page, testInfo, 'draft-uncertain-lookup')
})

test('read state, assignment and an inert note inside the reader', async ({ page }, testInfo) => {
  await page.goto(at(`/mailboxes/${MAILBOX}/threads/${THREAD}`))
  await expect(page.getByRole('heading', { name: 'Synthetic thread' })).toBeVisible()
  await page.getByRole('button', { name: 'Mark as read' }).click()
  await expect(page.getByRole('button', { name: 'Mark as unread' })).toBeVisible()

  await page.getByRole('button', { name: 'Assign to me' }).click()
  await expect(page.getByText('Assigned to you')).toBeVisible()
  await page.getByLabel('Assign to user id').fill(READER)
  await page.getByRole('button', { name: 'Assign', exact: true }).click()
  await expect(page.getByText(`Assigned to user ${READER}`)).toBeVisible()

  const note = '<img src="https://example.invalid/pixel">\n[unsafe](javascript:alert(1))\nPlaintext note'
  await page.getByLabel('Add a note').fill(note)
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.locator('article pre', { hasText: 'Plaintext note' })).toBeVisible()
  await expect(page.getByText('<img src="https://example.invalid/pixel">', { exact: false }).last()).toBeVisible()
  expect(await page.locator('article img, article script, article a[href^="javascript"]').count()).toBe(0)
  await capture(page, testInfo, 'reader-collaboration')

  // The read mark persisted within this page's fixture state: the list no longer shows it unread.
  await page.goto(at(`/mailboxes/${MAILBOX}`))
  await expect(page.locator('a[data-thread]').first()).toBeVisible()
  await expect(page.locator('a[data-thread]').first()).not.toHaveClass(/font-semibold/)
})

test('a persistently unconfirmed note stays frozen for retry and can be deliberately abandoned', async ({ page }) => {
  // This scenario proves only the persistent-outage policy: the scripted outcome applies to EVERY
  // createThreadNote call in this document, so no retry can succeed here. The same-attempt-id and
  // appears-exactly-once guarantees are proven at the observable gateway boundary by the
  // uncertainty-to-success regression in src/features/thread/CollaborationPanels.test.tsx (notes),
  // which the fixture script mechanism (one outcome per operation per load) cannot express.
  await loadScripted(page, 'createThreadNote=temporarily_unavailable', `/mailboxes/${MAILBOX}/threads/${THREAD}`)
  await page.getByLabel('Add a note').fill('browser note')
  await page.getByRole('button', { name: 'Add note' }).click()
  await expect(page.getByRole('alert')).toContainText('identical retry is recognized')
  await expect(page.getByLabel('Add a note')).toHaveValue('browser note')
  await expect(page.getByRole('button', { name: 'Retry the same note' })).toBeVisible()
  // The scripted outage repeats; the attempt stays frozen rather than being silently dropped.
  await page.getByRole('button', { name: 'Retry the same note' }).click()
  await expect(page.getByRole('alert')).toContainText('identical retry is recognized')
  await page.getByRole('button', { name: 'Write a different note' }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('membership: add a reader at the current revision; the last manager is protected', async ({ page }, testInfo) => {
  await page.goto(at(`/mailboxes/${MAILBOX}/members`))
  await expect(page.getByText('Roster revision 1')).toBeVisible()
  await page.getByLabel('User id').fill(READER)
  await page.getByRole('button', { name: 'Save member' }).click()
  await expect(page.getByText('Roster revision 2')).toBeVisible()
  await expect(page.getByText(READER)).toBeVisible()
  const actorRow = page.locator('li', { hasText: ACTOR })
  await actorRow.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('alert')).toContainText('without a manager')
  await expect(page.getByText('Roster revision 2')).toBeVisible()
  await capture(page, testInfo, 'members')
})

test('search is literal, scoped by URL, and links into the reader', async ({ page }, testInfo) => {
  await page.goto(at('/search?q=%3Cimg'))
  await expect(page.getByText('Literal text match')).toBeVisible()
  await expect(page.locator('a[data-thread]')).toHaveCount(2)
  expect(await page.locator('main img, main script').count()).toBe(0)
  await page.goto(at(`/search?q=%3Cimg&mailbox=${MAILBOX}`))
  await expect(page.locator('a[data-thread]')).toHaveCount(1)
  await page.locator('a[data-thread]').first().click()
  await expect(page.getByRole('heading', { name: 'Synthetic thread' })).toBeVisible()
  await page.goto(at('/search?q=%20%20'))
  await expect(page.getByText('That search cannot be run')).toBeVisible()
  await capture(page, testInfo, 'search-refused')
})

test('no horizontal overflow on the C/D views at 390px, each route captured after its own ready assertion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const { name, route, ready } of CD_ROUTES) {
    await page.goto(at(route))
    await expect(page.getByText('Simulated local mail')).toBeVisible()
    await ready(page)
    await noHorizontalOverflow(page)
    await capture(page, testInfo, `narrow-${name}`)
  }
})

test('dark theme C/D views, each route captured after its own ready assertion', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  for (const { name, route, ready } of CD_ROUTES) {
    await page.goto(at(route))
    await expect(page.getByText('Simulated local mail')).toBeVisible()
    await ready(page)
    await noHorizontalOverflow(page)
    await capture(page, testInfo, `dark-${name}`)
  }
})

test('dark theme recovery states: the conflict and the uncertain attempt, each from a freshly scripted load', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  // Conflict: the scripted refusal must actually be in force, so the save is refused, not stored.
  await loadScripted(page, 'saveDraft=draft_conflict', `/mailboxes/${MAILBOX}/drafts/${DRAFT}`)
  await expect(page.getByText('Saved version 2')).toBeVisible()
  await page.getByLabel('Subject').fill('Edited in dark')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toContainText('This draft changed elsewhere')
  await expect(page.getByText('Saved version 2')).toBeVisible()
  await expect(page.getByText('Saved version 3')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Keep my text and continue from the server version' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Discard my text and load the server copy' })).toBeVisible()
  await captureEditor(page, testInfo, 'dark-draft-conflict')

  // Uncertain: a second scripted load, since the script belongs to the document that loaded it.
  await loadScripted(page, 'saveDraft=temporarily_unavailable', `/mailboxes/${MAILBOX}/drafts/${DRAFT}`)
  await expect(page.getByText('Saved version 2')).toBeVisible()
  await page.getByLabel('Message').fill('Unconfirmed in dark')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByRole('alert')).toContainText('The save was not confirmed')
  await expect(page.getByText('Saved version 3')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retry this save' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check what the server stored' })).toBeVisible()
  await captureEditor(page, testInfo, 'dark-draft-uncertain')
})
