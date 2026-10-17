// AIDEV-NOTE: Production-bundle UI proof with routed API responses; never contacts real recipients.
import { expect, test } from '@playwright/test'
import { APPROVAL, REVIEW, STATUS } from '../src/features/send/sendTestData'

const origin = process.env['ELEVATEO_PRODUCTION_URL']
const envelope = { context_id: REVIEW.context_id, authorization_version: REVIEW.authorization_version }
const session = { ...envelope, actor: { id: '00000000-0000-4000-8000-000000000001', display_name: 'Pilot operator' }, organization: { id: '00000000-0000-4000-8000-000000000011', name: 'Pilot workspace' }, simulation_mode: false, csrf_token: 'pilot_csrf_0123456789' }
const attachment = { id: '00000000-0000-4000-8000-000000000081', filename: 'pilot.txt', content_type: 'text/plain', byte_size: 5, status: 'pending_scan' }

test('live attachment scan, consent approval and delivery evidence', async ({ page }, info) => {
  test.skip(!origin, 'Requires the production artifact served inside Docker')
  let uploaded = false
  let clean = false
  let approved = false
  await page.route('**/v1/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    let body: unknown
    if (path === '/v1/session') body = session
    else if (path === '/v1/mailboxes') body = { ...envelope, next_cursor: null, items: [{ id: REVIEW.mailbox_id, display_name: 'Pilot mailbox', display_address: 'pilot@example.test', capabilities: { read: true, compose: true, approve_send: true, manage_members: false } }] }
    else if (path === `/v1/drafts/${REVIEW.draft_id}`) body = { ...envelope, draft: { id: REVIEW.draft_id, mailbox_id: REVIEW.mailbox_id, subject: 'Pilot message', to: REVIEW.to, body_text: 'Attachment for review.', reply_to_thread_id: null, version: 1, state: 'editable', created_at: APPROVAL.approved_at, updated_at: APPROVAL.approved_at } }
    else if (path.endsWith('/attachments')) {
      if (request.method() === 'POST') {
        expect(request.headers()['x-csrf-token']).toBe(session.csrf_token)
        expect(request.postDataJSON()).toMatchObject({ mailbox_id: REVIEW.mailbox_id, filename: 'pilot.txt', content_base64: 'aGVsbG8=' })
        uploaded = true
        body = attachment
      } else body = { items: uploaded ? [{ ...attachment, status: clean ? 'clean' : 'pending_scan' }] : [] }
    } else if (path.endsWith('/send-review')) body = { ...REVIEW, simulated: false, attachments_supported: true, attachments: [{ ...attachment, status: clean ? 'clean' : 'pending_scan' }], ready: clean, review_digest: clean ? REVIEW.review_digest : null, issues: clean ? [] : [{ code: 'attachment_not_clean', recipient_index: null }] }
    else if (path.endsWith('/send-approvals')) {
      expect(clean).toBe(true)
      expect(request.postDataJSON()).toMatchObject({ correspondence_confirmed: true, review_digest: REVIEW.review_digest })
      approved = true
      body = { ...APPROVAL, simulated: false }
    } else if (path === `/v1/send-intents/${STATUS.send_id}`) body = { ...STATUS, simulated: false, state: 'accepted', cancellable: false, attempts: 1, delivery_status: 'delivered', delivery_updated_at: STATUS.approved_at }
    else return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ code: 'not_found', message: 'No routed resource', request_id: 'pilot-test' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto(`${origin}/#/mailboxes/${REVIEW.mailbox_id}/drafts/${REVIEW.draft_id}`)
  await page.getByLabel('Choose attachment').setInputFiles({ name: 'pilot.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByText('Waiting for security scan')).toBeVisible()
  await page.getByRole('link', { name: 'Review send', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Approve live send' })).toBeDisabled()
  await expect(page.getByText('This draft is not ready for approval.')).toBeVisible()
  clean = true
  await page.reload()
  await expect(page.getByText(/Security scan passed/)).toBeVisible()
  const approve = page.getByRole('button', { name: 'Approve live send' })
  await expect(approve).toBeDisabled()
  await page.getByRole('checkbox').check()
  await page.screenshot({ path: info.outputPath('live-review.png'), fullPage: true })
  await approve.click()
  await expect(page.getByRole('heading', { name: 'Delivery: delivered' })).toBeVisible()
  await expect(page.getByText(/does not confirm the email was read/)).toBeVisible()
  expect(approved).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath('live-delivery.png'), fullPage: true })
})
