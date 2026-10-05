import { expect, test, type Page } from '@playwright/test'
import { browserStorage, control, fixtureButton, intents, reset, shot, signIn, status } from './support'

// AIDEV-NOTE: Real fixture HTTP covers cross-feature policy; no provider, session or product response is mocked.
test.beforeEach(async () => { await reset() })
const recipient = 'product-client@partner.example'
const campaign = 'product-welcome'

async function addContact(page: Page) {
  await page.goto('/contacts')
  await page.getByLabel('Email addresses').fill(recipient)
  await page.getByLabel('Consent or withdrawal evidence').fill('Signup form receipt product-001')
  await page.getByRole('checkbox', { name: 'These people explicitly opted in to this outreach.' }).check()
  await page.getByRole('button', { name: 'Save contacts' }).click()
  await expect(page.getByText('1 contact saved. No email was sent.', { exact: true })).toBeVisible()
  await expect(page.getByRole('row').filter({ hasText: recipient })).toContainText('Opted in')
}

async function createCampaign(page: Page, enabled = true) {
  await page.goto('/campaigns')
  await page.getByLabel('New campaign ID').fill(campaign)
  await page.getByRole('button', { name: 'Create campaign' }).click()
  await expect(page.getByRole('heading', { name: `Prepare a draft · ${campaign}` })).toBeVisible()
  if (enabled) {
    await page.getByRole('button', { name: 'Enable approved sends' }).click()
    await expect(page.getByText('Enabled for approved sends', { exact: true })).toBeVisible()
  }
}

async function prepare(page: Page) {
  await page.getByLabel('Sending mailbox').selectOption('alice-main')
  await page.getByLabel('Recipient', { exact: true }).fill(recipient)
  await page.getByLabel('Subject', { exact: true }).fill('Product welcome')
  await page.getByLabel('Message', { exact: true }).fill('Thanks for explicitly opting in.')
  await page.getByRole('button', { name: 'Prepare for review' }).click()
  await page.getByRole('link', { name: 'Review this send request' }).click()
  await expect(status(page)).toContainText('Awaiting approval')
  return new URL(page.url()).pathname.split('/').pop()!
}

test('sequence drafts survive reload, require individual review and cancel without quota use', async ({ page }, info) => {
  await signIn(page); await addContact(page); await createCampaign(page)
  const panel = page.getByRole('region', { name: 'Campaign sequences' })
  await page.setViewportSize({ width: 390, height: 844 })
  // AIDEV-NOTE: Shell overflow hiding can conceal clipped controls without document horizontal overflow.
  const saveBounds = await panel.getByRole('button', { name: 'Save sequence for review' }).boundingBox()
  expect(saveBounds).not.toBeNull()
  expect(saveBounds!.x + saveBounds!.width).toBeLessThanOrEqual(390)
  await panel.getByLabel('Sequence mailbox').selectOption('alice-main')
  await panel.getByLabel('Sequence recipient').fill(recipient)
  await panel.getByLabel('Step 1 subject').fill('Sequence welcome')
  await panel.getByLabel('Step 1 message').fill('Your requested introduction.')
  await panel.getByLabel('Step 1 earliest send time').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16))
  await panel.getByRole('button', { name: 'Save sequence for review' }).click()
  await expect(panel.getByRole('link', { name: 'Review step 1' })).toBeVisible()
  expect((await intents('alice')).map(row => row.status)).toEqual(['draft'])
  await panel.scrollIntoViewIfNeeded(); await shot(page, info, 'sequence-saved')
  await page.reload()
  await page.getByRole('button', { name: campaign, exact: true }).click()
  await expect(panel.getByRole('link', { name: 'Review step 1' })).toBeVisible()
  await panel.getByRole('button', { name: 'Cancel remaining steps' }).click()
  await expect(panel).toContainText('cancelled')
  expect((await intents('alice')).map(row => row.status)).toEqual(['cancelled'])
  await page.goto('/connections/mailboxes')
  await expect(page.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()).toContainText('30 of 30 available · 0 accepted · 0 held')
  expect(await browserStorage(page)).not.toMatch(/Your requested introduction|Sequence welcome/)
})

test('opted-in contact becomes a reviewed campaign request with server quota and overview counts', async ({ page }) => {
  await control({ do: 'pause', on: true })
  await signIn(page)
  await addContact(page)
  await createCampaign(page)
  const id = await prepare(page)
  expect((await intents('alice')).map(row => row.status)).toEqual(['draft'])
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(status(page)).toContainText('Queued')
  await page.goto('/connections/mailboxes')
  const mailbox = page.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()
  await expect(mailbox).toContainText('29 of 30 available · 0 accepted · 1 held')
  await page.goto('/overview')
  await expect(page.getByRole('region', { name: 'Server status' })).toContainText('Dispatch: Paused')
  await expect(page.locator('dl > div').filter({ has: page.getByText('Queued', { exact: true }) }).locator('dd').first()).toHaveText('1')
  await control({ do: 'pause', on: false })
  await control({ do: 'tick' })
  await page.goto(`/sends/${id}`)
  await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
  await page.goto('/connections/mailboxes')
  await expect(mailbox).toContainText('29 of 30 available · 1 accepted · 0 held')
})

test('pausing a campaign refuses approval without reserving capacity', async ({ page }) => {
  await signIn(page)
  await addContact(page)
  await createCampaign(page)
  await page.getByRole('button', { name: 'Pause campaign' }).click()
  await expect(page.getByText('paused', { exact: true })).toBeVisible()
  await prepare(page)
  await page.getByRole('button', { name: 'Approve this version' }).click()
  await expect(page.getByText('The server refused this: the campaign is not running.')).toBeVisible()
  await expect(status(page)).toContainText('Awaiting approval')
  expect((await intents('alice')).map(row => row.status)).toEqual(['draft'])
  await page.goto('/connections/mailboxes')
  await expect(page.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' }).first()).toContainText('30 of 30 available · 0 accepted · 0 held')
})

test('switching accounts hides contacts, campaigns, requests and overview totals', async ({ page }) => {
  await signIn(page)
  await addContact(page)
  await createCampaign(page)
  const id = await prepare(page)
  await page.getByRole('button', { name: 'Sign out' }).click()
  await fixtureButton(page, 'bob').click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
  await page.goto('/contacts')
  await expect(page.getByText('No contacts on this page.', { exact: false })).toBeVisible()
  await expect(page.getByText(recipient, { exact: true })).toHaveCount(0)
  await page.goto('/campaigns')
  await expect(page.getByText('No campaigns on this page.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: campaign, exact: true })).toHaveCount(0)
  await page.goto('/overview')
  await expect(page.getByText('No send requests have been saved yet.')).toBeVisible()
  await page.goto(`/sends/${id}`)
  await expect(page.getByText('This request could not be loaded')).toBeVisible()
  await expect(page.getByText('Product welcome', { exact: true })).toHaveCount(0)
  expect(await browserStorage(page)).not.toMatch(/product-client|product-welcome|product-001|Thanks for explicitly/)
})

test('removing stored provider access persists disconnected mailboxes and isolates accounts', async ({ page }) => {
  await signIn(page)
  await page.goto('/connections/mailboxes')
  const grants = page.getByRole('region', { name: 'Stored provider connections' })
  await expect(grants).toContainText('fake · alice-main')
  await expect(grants).not.toContainText('bob-main')
  await grants.getByRole('button', { name: 'Remove access' }).click()
  await page.getByRole('alertdialog', { name: 'Remove this connection?' }).getByRole('button', { name: 'Remove access' }).click()
  await expect(grants).toContainText('Access removed')
  await expect(grants.getByRole('button', { name: 'Remove access' })).toHaveCount(0)
  await expect(page.getByText(/1 of 10 mailboxes connected/u)).toBeVisible()
  await page.reload()
  await expect(grants).toContainText('Access removed')
  await page.getByRole('button', { name: 'Browse disconnected mailboxes' }).click()
  const removed = page.getByRole('list', { name: 'Mailboxes' }).getByRole('listitem').filter({ hasText: 'alice@pilot.example' })
  await expect(removed).toContainText('Disconnected')
  await expect(removed.getByRole('switch', { name: 'Allow sending from this mailbox' })).not.toBeChecked()
  await expect(removed.getByRole('switch', { name: 'Allow sending from this mailbox' })).toBeDisabled()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await fixtureButton(page, 'bob').click()
  await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
  await page.goto('/connections/mailboxes')
  await expect(grants).toContainText('fake · bob-main')
  await expect(grants).toContainText('Access stored')
  await expect(grants).not.toContainText('alice-main')
  await expect(page.getByRole('list', { name: 'Mailboxes' })).not.toContainText('alice@pilot.example')
  expect(await browserStorage(page)).not.toMatch(/alice-grant|synthetic-not-a-token/u)
})

// AIDEV-NOTE: Mobile project matches visual.spec.ts only; explicit viewports keep this suite self-contained.
for (const size of ['desktop', 'mobile'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`product screens ${size} ${scheme}`, async ({ page }, info) => {
      await page.setViewportSize(size === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 })
      await page.emulateMedia({ colorScheme: scheme })
      await signIn(page)
      await addContact(page)
      await shot(page, info, `product-contacts-${size}-${scheme}`)
      await createCampaign(page)
      const prepareButton = page.getByRole('button', { name: 'Prepare for review' })
      await prepareButton.scrollIntoViewIfNeeded()
      await expect(prepareButton).toBeInViewport()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      await shot(page, info, `product-campaigns-${size}-${scheme}`)
      await page.goto('/overview')
      await expect(page.getByRole('region', { name: 'Server status' })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      await shot(page, info, `product-overview-${size}-${scheme}`)
    })
  }
}

test('optional Hunter access stays disabled without credentials and makes no lookup', async ({ page }, info) => {
  await signIn(page)
  const lookups: string[] = []
  page.on('request', request => { if (request.url().includes('/v1/hunter/enrich')) lookups.push(request.url()) })
  await page.goto('/connections/enrichment')
  const panel = page.getByRole('region', { name: 'Hunter enrichment' })
  await expect(panel.getByText('No active Hunter key.')).toBeVisible()
  await expect(panel.getByText(/Hunter lookups are disabled/u)).toBeVisible()
  await expect(panel.getByLabel('Hunter API key')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Look up contact' })).toHaveCount(0)
  await panel.getByRole('button', { name: 'Reload Hunter access' }).click()
  await expect(panel.getByRole('button', { name: 'Reload Hunter access' })).toBeEnabled()
  expect(lookups).toEqual([])
  await shot(page, info, 'hunter-disabled')
})
