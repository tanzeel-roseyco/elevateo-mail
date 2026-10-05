import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { control, fixtureButton, requestRows, reset, shot, signIn, status } from './support'

// AIDEV-NOTE: Screens for the visual QA gate, in both themes at desktop and phone sizes, against the real server.
// Runs in both projects. Layout is also checked for horizontal overflow at each stop.

test.beforeEach(async () => {
  await reset()
})

const isMobile = (info: TestInfo) => info.project.name === 'mobile'

async function expectNoOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
}

async function capture(page: Page, info: TestInfo, name: string) {
  await expectNoOverflow(page)
  await shot(page, info, name)
}

async function compose(page: Page, subject: string, to = 'visual@partner.example') {
  await page.goto('/compose')
  await page.getByLabel('To', { exact: true }).fill(to)
  await page.getByLabel('Subject').fill(subject)
  await page.getByLabel('Message', { exact: true }).fill('A short synthetic message for the visual check.')
  await page.getByRole('button', { name: 'Review' }).click()
  await page.getByRole('button', { name: 'Submit for approval' }).click()
  await expect(page).toHaveURL(/\/sends\/.+/)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`${scheme}: sign-in, loading, inbox, empty, message, offline and error states`, async ({ page, context }, info) => {
    await page.emulateMedia({ colorScheme: scheme })
    await page.goto('/')
    await expect(page.getByRole('region', { name: 'Test fixture sign-in' })).toBeVisible()
    await capture(page, info, `${scheme}-sign-in`)

    // Hold the first answer back briefly so the loading state can be seen; the request still reaches the server.
    await page.route('**/v1/capabilities', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await route.continue()
    })
    await fixtureButton(page, 'alice').click()
    await expect(page.getByText('Contacting the server…')).toBeVisible()
    await capture(page, info, `${scheme}-loading`)
    // Unrouting while the delayed handler is still waiting would make its continue() fail, so wait for the inbox first.
    await expect(page.getByRole('heading', { name: 'Inbox', level: 1 })).toBeVisible()
    await page.unroute('**/v1/capabilities')
    await expect(page.getByText('Quarterly invoice query')).toBeVisible()
    await capture(page, info, `${scheme}-inbox`)

    await page.getByRole('link', { name: /Quarterly invoice query/ }).click()
    await expect(page.getByRole('heading', { name: 'Quarterly invoice query', level: 2 })).toBeVisible()
    await capture(page, info, `${scheme}-message`)

    await page.goto('/mail/alice-readonly')
    await expect(page.getByText('No messages stored')).toBeVisible()
    await capture(page, info, `${scheme}-inbox-empty`)

    await context.setOffline(true)
    await expect(page.getByText('You are offline.')).toBeVisible()
    await page.getByRole('button', { name: 'Refresh messages' }).click()
    await expect(page.getByRole('alert').filter({ hasText: 'Messages could not be loaded' })).toBeVisible()
    await capture(page, info, `${scheme}-offline-error`)
    await context.setOffline(false)
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect(page.getByText('No messages stored')).toBeVisible()
  })

  test(`${scheme}: send statuses, connections and unavailable areas`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme })
    await signIn(page)

    await compose(page, 'Accepted example')
    await page.getByRole('button', { name: 'Approve this version' }).click()
    await expect(status(page)).toContainText('Accepted by provider', { timeout: 20_000 })
    await capture(page, info, `${scheme}-send-accepted`)

    await compose(page, 'Cancelled example')
    await page.getByRole('button', { name: 'Cancel request' }).click()
    await page.getByRole('button', { name: 'Cancel request' }).last().click()
    await expect(status(page)).toContainText('Cancelled')

    await control({ do: 'pause', on: true })
    await compose(page, 'Queued example')
    await page.getByRole('button', { name: 'Approve this version' }).click()
    await expect(status(page)).toContainText('Queued')
    await capture(page, info, `${scheme}-send-queued`)

    await compose(page, 'Awaiting approval example')
    await expect(status(page)).toContainText('Awaiting approval')
    await capture(page, info, `${scheme}-send-awaiting`)

    // Editing a saved request as its replacement, starting from the content the server holds.
    await page.getByRole('button', { name: 'Edit as a replacement' }).click()
    await expect(page.getByRole('heading', { name: 'Edit as a replacement' })).toBeVisible()
    await expect(page.getByLabel('Subject')).toHaveValue('Awaiting approval example')
    await page.getByLabel('Subject').focus()
    await capture(page, info, `${scheme}-compose`)
    await page.getByRole('button', { name: 'Review' }).click()
    await expect(page.getByRole('heading', { name: 'Review the replacement' })).toBeVisible()
    await capture(page, info, `${scheme}-review`)

    // A submission whose answer never arrives is listed as unconfirmed, above what the server holds.
    // The server performs the replacement; only its answer is dropped.
    await page.route('**/v1/send-intents/*/replace', async (route) => {
      await route.fetch()
      await route.abort('connectionreset')
    })
    await page.getByRole('button', { name: 'Replace and submit for approval' }).click()
    await expect(page.getByRole('region', { name: 'Unconfirmed submissions' })).toContainText('Not confirmed')
    await expect(requestRows(page).first()).toBeVisible()
    if (!isMobile(info)) await requestRows(page).nth(1).getByRole('link').click()
    await capture(page, info, `${scheme}-send-list`)
    await page.unroute('**/v1/send-intents/*/replace')
    // Checking again repeats the same replacement under the same key and opens the one successor.
    await page.getByRole('button', { name: 'Check again' }).click()
    await expect(page.getByRole('heading', { name: 'Awaiting approval example', level: 2 })).toBeVisible()
    await expect(status(page)).toContainText('Awaiting approval')
    await page.goto('/sends')
    await expect(requestRows(page)).toHaveCount(5)
    await expect(requestRows(page).filter({ hasText: 'Replaced' })).toHaveCount(1)

    await page.goto('/connections/mailboxes')
    await expect(page.getByText(/of 30 available/).first()).toBeVisible()
    await capture(page, info, `${scheme}-connections`)
    await page.goto('/connections/ai')
    await expect(page.getByRole('list', { name: 'AI permissions by mailbox' })).toBeVisible()
    await capture(page, info, `${scheme}-connections-ai`)
    // Campaign screens are covered by product.spec.ts; assistant context is gated by mailbox selection.
    await page.goto('/assistant')
    await expect(page.getByRole('heading', { name: 'AI Assistant', exact: true })).toBeVisible()
    await expect(page.getByLabel('Mailbox', { exact: true })).toHaveValue('')
    await capture(page, info, `${scheme}-assistant`)
    await page.goto('/settings/account')
    await expect(page.getByRole('button', { name: 'Sign out' }).last()).toBeVisible()
    await capture(page, info, `${scheme}-settings`)
  })
}
