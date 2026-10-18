// AIDEV-NOTE: Production-bundle proof of the Resend consent gate and provider delivery states with
// routed API responses; never contacts real recipients. Screenshots land in the test output dir.
import { expect, test, type Page } from '@playwright/test'
import { REVIEW, STATUS } from '../src/features/send/sendTestData'

const origin = process.env['ELEVATEO_PRODUCTION_URL']
const envelope = { context_id: REVIEW.context_id, authorization_version: REVIEW.authorization_version }
const session = { ...envelope, actor: { id: '00000000-0000-4000-8000-000000000001', display_name: 'Pilot operator' }, organization: { id: '00000000-0000-4000-8000-000000000011', name: 'Pilot workspace' }, simulation_mode: false, csrf_token: 'pilot_csrf_0123456789' }
const mailboxes = { ...envelope, next_cursor: null, items: [{ id: REVIEW.mailbox_id, display_name: 'Pilot mailbox', display_address: 'pilot@example.test', capabilities: { read: true, compose: true, approve_send: true, manage_members: false } }] }

async function routeApi(page: Page, routes: Record<string, unknown>): Promise<void> {
  await page.route('**/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    const body = path === '/v1/session' ? session : path === '/v1/mailboxes' ? mailboxes : routes[path]
    if (body === undefined) return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'not_available', message: 'No routed resource', request_id: 'consent-test' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
}

test('resend review without consent evidence is blocked with a visible reason', async ({ page }, info) => {
  test.skip(!origin, 'Requires the production artifact served inside Docker')
  await routeApi(page, { [`/v1/drafts/${REVIEW.draft_id}/send-review`]: { ...REVIEW, simulated: false, outbound_mode: 'resend' } })
  await page.goto(`${origin}/#/mailboxes/${REVIEW.mailbox_id}/drafts/${REVIEW.draft_id}/send-review`)
  const alert = page.getByRole('alert', { name: 'Consent required' })
  await expect(alert).toContainText('Recipient 1: recipient@example.test has no consent evidence')
  await expect(page.getByRole('button', { name: 'Approve live send' })).toBeDisabled()
  await expect(page.getByText('Live email via Resend - sends to real recipients')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('consent-blocked-review.png'), fullPage: true })
})

test('live bounced send shows provider state and suppression reason without simulated labels', async ({ page }, info) => {
  test.skip(!origin, 'Requires the production artifact served inside Docker')
  await routeApi(page, { [`/v1/send-intents/${STATUS.send_id}`]: { ...STATUS, simulated: false, state: 'accepted', cancellable: false, attempts: 1, delivery_status: 'bounced', delivery_updated_at: STATUS.approved_at, suppression_reason: 'bounced' } })
  await page.goto(`${origin}/#/mailboxes/${REVIEW.mailbox_id}/send-intents/${STATUS.send_id}`)
  await expect(page.getByRole('heading', { name: 'Delivery: bounced' })).toBeVisible()
  await expect(page.getByRole('note', { name: 'Suppression' })).toContainText('Suppressed after a bounce')
  await expect(page.getByRole('main').getByText(/Simulated/)).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('bounced-status.png'), fullPage: true })
})
