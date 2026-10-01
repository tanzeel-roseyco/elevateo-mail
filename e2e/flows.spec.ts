import { expect, test, type Page, type TestInfo } from '@playwright/test'

// AIDEV-NOTE: Main user flows on desktop and mobile. Screenshots land in e2e-shots/ for the visual QA gate.

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `e2e-shots/${info.project.name}-${name}.png` })
const isMobile = (info: TestInfo) => info.project.name === 'mobile'

async function openCompose(page: Page) {
  await page.getByRole('button', { name: 'Compose', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /^Compose/ })).toBeVisible()
}

test('overview metrics link to the matching filtered activity list', async ({ page }, info) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/overview$/)
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Alerts' })).toContainText('flooda.co')
  await shot(page, info, 'overview')
  await page.getByRole('region', { name: 'Sending summary' }).getByRole('link', { name: /^Delivered/ }).click()
  await expect(page).toHaveURL(/\/activity\?kind=delivered&range=7d/)
  await expect(page.getByLabel('Event type')).toHaveValue('delivered')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
})

test('navigation highlights the active section and settings sit at the bottom', async ({ page }, info) => {
  await page.goto('/overview')
  if (isMobile(info)) {
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await shot(page, info, 'drawer')
  }
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Campaigns/ }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
  if (isMobile(info)) await page.getByRole('button', { name: 'Open navigation' }).click()
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: /Campaigns/ })).toHaveAttribute('aria-current', 'page')
  await expect(nav.getByRole('link').last()).toHaveText(/Settings/)
})

test('compose blocks an incomplete message, then simulates a send', async ({ page }, info) => {
  await page.goto('/mail/inbox')
  await openCompose(page)
  await page.getByRole('button', { name: 'Simulate send' }).click()
  await expect(page.getByRole('alert')).toContainText('Add at least one recipient.')

  await page.getByLabel('To', { exact: true }).fill('dana.okafor@summit-events.example')
  await page.getByLabel('To', { exact: true }).press('Enter')
  await page.getByLabel('Subject', { exact: true }).fill('Panel confirmation for March')
  await page.getByLabel('Message body').fill('Hi Dana,\n\nHappy to join the **opening panel**.')
  await expect(page.getByText(/Draft saved/)).toBeVisible()
  await shot(page, info, 'composer')

  await page.getByRole('button', { name: 'Simulate send' }).click()
  await expect(page.getByText('Simulated send complete. No real email was sent.')).toBeVisible()
  await page.getByRole('navigation', { name: 'Mail folders' }).getByRole('link', { name: 'Sent' }).click()
  await expect(page.getByRole('link', { name: /Panel confirmation for March/ })).toBeVisible()
})

test('closing the composer keeps a draft and discarding asks first', async ({ page }) => {
  await page.goto('/mail/drafts')
  await openCompose(page)
  await page.getByLabel('Subject', { exact: true }).fill('Half-written thought')
  await page.getByRole('button', { name: 'Save draft and close' }).click()
  await page.getByRole('button', { name: /Half-written thought/ }).first().click()
  await page.getByRole('button', { name: 'Discard draft' }).click()
  const dialog = page.getByRole('alertdialog', { name: 'Discard this draft?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Discard draft' }).click()
  await expect(page.getByText('Half-written thought')).toHaveCount(0)
})

test('reading keeps list filters and replies default to the receiving identity', async ({ page }, info) => {
  await page.goto('/mail/inbox?campaign=none')
  await page.getByRole('link', { name: /Speaking slot at the March leadership summit/ }).click()
  await expect(page).toHaveURL(/\/mail\/inbox\/t-ord-2\?campaign=none/)
  await expect(page.getByRole('heading', { name: 'Speaking slot at the March leadership summit?' })).toBeVisible()
  await expect(page.getByText('Summit-speaker-brief.pdf')).toBeVisible()
  await shot(page, info, 'thread')

  await page.getByRole('button', { name: 'Reply', exact: true }).click()
  await expect(page.getByLabel('From', { exact: true })).toHaveValue('l.macdonald@elevateoco.com')
  await shot(page, info, 'reply')
  await page.getByRole('button', { name: 'Save draft and close' }).click()

  await page.getByRole('button', { name: 'Back to list' }).click()
  await expect(page).toHaveURL(/\/mail\/inbox\?campaign=none$/)
  await expect(page.getByLabel('Filter by campaign')).toHaveValue('none')
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Speaking slot at the March leadership summit?' })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/mail\/inbox\?campaign=none$/)
  await expect(page.getByLabel('Filter by campaign')).toHaveValue('none')
})

test('mail list restores its scroll position after closing a conversation', async ({ page }) => {
  await page.goto('/mail/inbox')
  const list = page.getByTestId('mail-list')
  await expect(list.getByRole('link').first()).toBeVisible()
  // Playwright scrolls the target into view before clicking, so measure after that has happened.
  const target = list.getByRole('link').nth(14)
  await target.scrollIntoViewIfNeeded()
  await list.evaluate((el) => el.scrollBy(0, 40))
  const before = await list.evaluate((el) => el.scrollTop)
  expect(before).toBeGreaterThan(0)
  await target.click()
  await page.getByRole('button', { name: 'Back to list' }).click()
  await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBe(before)
})

test('archive can be undone', async ({ page }) => {
  await page.goto('/mail/inbox?campaign=none')
  const row = page.getByRole('checkbox', { name: 'Select conversation: Invoice INV-2041 for the September retainer' })
  await row.check()
  await page.getByRole('toolbar', { name: 'Bulk actions' }).getByRole('button', { name: 'Archive' }).click()
  await expect(row).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(row).toBeVisible()
})

test('split pane shows list and conversation side by side on desktop', async ({ page }, info) => {
  test.skip(isMobile(info), 'Split pane is a desktop layout; mobile always uses list then detail.')
  await page.goto('/mail/inbox?campaign=none')
  await page.getByRole('button', { name: 'Switch to split view' }).click()
  await page.getByRole('link', { name: /Flood model data-sharing agreement/ }).click()
  await expect(page.getByRole('heading', { name: 'Flood model data-sharing agreement' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Invoice INV-2041/ })).toBeVisible()
  await shot(page, info, 'split-pane')
})

test('campaign detail tabs, breadcrumbs, and simulated batch', async ({ page }, info) => {
  await page.goto('/campaigns')
  await shot(page, info, 'campaigns')
  await page.getByRole('link', { name: 'Boltloop — Q4 automation audit offer' }).click()
  await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText('Campaigns')
  await expect(page.getByText('150 of 240 recipients processed')).toBeVisible()
  await shot(page, info, 'campaign-detail')
  await page.getByRole('button', { name: 'Simulate next batch' }).click()
  await expect(page.getByText('240 of 240 recipients processed')).toBeVisible()

  await page.getByRole('navigation', { name: 'Campaign sections' }).getByRole('link', { name: 'Recipients' }).click()
  await expect(page).toHaveURL(/\/recipients$/)
  await expect(page.getByRole('table', { name: 'Campaign recipients' })).toBeVisible()
  await shot(page, info, 'campaign-recipients')
  await page.getByRole('navigation', { name: 'Breadcrumb' }).getByRole('link', { name: 'Campaigns' }).click()
  await expect(page).toHaveURL(/\/campaigns$/)
})

test('create a campaign through all five steps', async ({ page }, info) => {
  await page.goto('/campaigns/new')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toContainText('Give the campaign a name.')
  await page.getByLabel('Campaign name').fill('E2E — winter check-in')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText(/eligible recipients/)).toBeVisible()
  await expect(page.getByText(/excluded automatically/)).toBeVisible()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Subject').fill('A winter check-in for {{company}}')
  await page.getByLabel('Message', { exact: true }).fill('Hi {{first_name}},\n\nA short note to see how the quarter is closing.')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Step 5 of 5: Review' })).toBeVisible()
  await shot(page, info, 'campaign-review')
  await page.getByRole('button', { name: 'Schedule campaign (simulated)' }).click()
  await expect(page.getByRole('heading', { name: 'E2E — winter check-in', level: 1 })).toBeVisible()
  await expect(page.getByText('Scheduled', { exact: true })).toBeVisible()
})

test('contacts: detail panel and CSV import with validation errors', async ({ page }, info) => {
  await page.goto('/contacts')
  await expect(page.getByRole('table', { name: 'Contacts' })).toBeVisible()
  await shot(page, info, 'contacts')
  await page.goto('/contacts?status=unsubscribed')
  await page.getByRole('table', { name: 'Contacts' }).getByRole('button').first().click()
  await expect(page.getByRole('dialog')).toContainText('Campaign emails to them are blocked')
  await shot(page, info, 'contact-panel')
  await page.getByRole('button', { name: 'Close' }).click()

  await page.goto('/contacts/import')
  await page.getByRole('button', { name: 'Load sample CSV' }).click()
  await expect(page.getByText('2 rows ready to import, 4 with errors (skipped).')).toBeVisible()
  await expect(page.getByText('Email is not valid')).toBeVisible()
  await shot(page, info, 'import-preview')
  await page.getByRole('button', { name: 'Import 2 valid contacts' }).click()
  await expect(page.getByText('2 contacts imported.')).toBeVisible()
})

test('appearance changes preview live, apply on save, and persist', async ({ page }, info) => {
  await page.goto('/settings/appearance')
  await shot(page, info, 'appearance')
  await page.getByText('Dark', { exact: true }).click()
  await page.getByRole('button', { name: 'Teal accent' }).click()
  await page.getByText('Compact', { exact: true }).click()
  // Preview only: the app itself must not change until Save.
  await expect(page.locator('html')).not.toHaveAttribute('data-density', 'compact')
  await page.getByRole('button', { name: 'Save appearance' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact')
  await shot(page, info, 'appearance-dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByText('Saved in this browser.')).toBeVisible()
  await page.goto('/mail/inbox')
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  await shot(page, info, 'inbox-dark')
})

test('global search groups results and deep links work', async ({ page }, info) => {
  await page.goto('/mail/inbox')
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  await shot(page, info, 'inbox')
  const search = page.getByRole('searchbox', { name: 'Search messages, contacts, and campaigns' })
  await search.fill('flood')
  await expect(page.getByRole('region', { name: 'Messages' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Campaigns' })).toBeVisible()
  await shot(page, info, 'search')
  await search.press('Enter')
  await expect(page).toHaveURL(/\/search\?q=flood/)
  await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible()

  await page.goto('/settings/identities')
  await expect(page.getByRole('heading', { name: /Flooda/ })).toBeVisible()
  await shot(page, info, 'identities')
  await page.goto('/no-such-page')
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible()
})

test('a failed load shows an error state that can be retried', async ({ page }) => {
  await page.goto('/overview?simulate=load-error')
  await expect(page.getByRole('heading', { name: 'The mailroom could not be loaded' })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
})
