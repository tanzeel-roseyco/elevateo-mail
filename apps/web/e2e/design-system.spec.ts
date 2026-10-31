import { writeFile } from 'node:fs/promises'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { REVIEW, STATUS } from '../src/features/send/sendTestData'

// AIDEV-NOTE: Synthetic routes capture the real UI without sending mail or contacting discovery services.
const mailbox = REVIEW.mailbox_id
const base = `/mailboxes/${mailbox}`
const envelope = { context_id: REVIEW.context_id, authorization_version: REVIEW.authorization_version }
const session = { ...envelope, actor: { id: '00000000-0000-4000-8000-000000000001', display_name: 'Design reviewer' }, organization: { id: '00000000-0000-4000-8000-000000000011', name: 'Elevateo workspace' }, simulation_mode: true, csrf_token: 'design_csrf_0123456789' }
const mailboxes = { ...envelope, next_cursor: null, items: [{ id: mailbox, display_name: 'Corporate mailbox', display_address: 'team@example.test', capabilities: { read: true, compose: true, approve_send: true, manage_members: false } }] }
async function routeApi(page: Page, routes: Record<string, unknown>) {
  await page.route('**/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const body = path === '/v1/session' ? session : path === '/v1/mailboxes' ? mailboxes : routes[path]
    return route.fulfill({ status: body === undefined ? 404 : 200, contentType: 'application/json', body: JSON.stringify(body ?? { code: 'not_available', message: 'Synthetic unavailable resource', request_id: 'visual' }) })
  })
}
async function capture(page: Page, info: TestInfo, name: string) {
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'light')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
  const axeScript = process.env['ELEVATEO_AXE_SCRIPT']
  if (axeScript) {
    await page.addScriptTag({ path: axeScript })
    const results = await page.evaluate(async () => {
      const browser = window as unknown as { axe: { run(options: object): Promise<{ violations: unknown[] }> } }
      return browser.axe.run({ runOnly: ['color-contrast'] })
    })
    await writeFile(info.outputPath(`${name}-contrast.json`), JSON.stringify(results, null, 2))
    await info.attach(`${name}-contrast`, { body: JSON.stringify(results, null, 2), contentType: 'application/json' })
    expect(results.violations).toEqual([])
  }
  // Actual rendered token contrast, including the forced light result under an OS dark preference.
  const palette = await page.evaluate(() => {
    const css = getComputedStyle(document.documentElement)
    return ['fg', 'muted', 'line', 'surface'].map(name => css.getPropertyValue(`--color-${name}`).trim())
  })
  const luminance = (hex: string) => {
    const channel = (offset: number) => { const c = parseInt(hex.slice(offset, offset + 2), 16) / 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4 }
    return .2126 * channel(1) + .7152 * channel(3) + .0722 * channel(5)
  }
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
  expect(contrast(palette[0]!, palette[3]!)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(palette[1]!, palette[3]!)).toBeGreaterThanOrEqual(4.5)
  expect(contrast(palette[2]!, palette[3]!)).toBeGreaterThanOrEqual(3)
}
const screens = [
  ['inbox', base, 'Synthetic thread'],
  ['thread', `${base}/threads/00000000-0000-4000-8000-000000000033`, 'Synthetic thread'],
  ['draft-editor', `${base}/drafts/00000000-0000-4000-8000-000000000051`, 'Saved version 2'],
  ['settings', '/settings', 'Update Workspace Name'],
  ['empty', `${base}?filter=archive`, 'Nothing archived'],
] as const
for (const [name, path, ready] of screens) {
  test(`corporate ${name}`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`/dev-fixtures.html#${path}`)
    await expect(page.getByText(ready, { exact: true }).first()).toBeVisible()
    await capture(page, info, name)
    if (name === 'draft-editor') {
      await page.getByRole('button', { name: 'Save changes' }).scrollIntoViewIfNeeded()
      await capture(page, info, 'draft-editor-actions')
    }
  })
}
test('corporate outreach', async ({ page }, info) => {
  await routeApi(page, {})
  await page.route('**/v2/outreach/campaigns**', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ items: [{ id: '00000000-0000-4000-8000-000000000081', name: 'Customer updates', status: 'draft', version: 1 }], next_cursor: null }) }))
  await page.goto('/#/outreach/campaigns')
  await expect(page.getByRole('link', { name: 'Customer updates' })).toBeVisible()
  await capture(page, info, 'outreach')
})
test('corporate email finder', async ({ page }, info) => {
  await routeApi(page, {})
  await page.route('**/v2/email-finder/**', route => {
    const body = route.request().url().endsWith('/health')
      ? { smtp_available: false, smtp_reason: 'SMTP checks unavailable in this preview', ehlo_hostname: 'mail.example.test', remaining_daily_probes: 48, halted_until: null, worker_seen_at: '2026-10-29T00:00:00Z' }
      : { items: [] }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) })
  })
  await page.goto('/#/email-finder')
  await expect(page.getByLabel('Full name')).toBeVisible()
  await capture(page, info, 'email-finder')
  await page.getByRole('button', { name: 'Start lookup' }).evaluate(element => element.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: info.outputPath('email-finder-actions.png') })
})
test('corporate sign-in', async ({ page }, info) => {
  await page.goto('/dev-fixtures.html#/fixtures?getSession=unauthenticated')
  await expect(page.getByLabel('Email address')).toBeVisible()
  await page.getByLabel('Email address').focus()
  await capture(page, info, 'sign-in')
})
test('corporate send review', async ({ page }, info) => {
  await routeApi(page, { [`/v1/drafts/${REVIEW.draft_id}/send-review`]: REVIEW })
  await page.goto(`/#${base}/drafts/${REVIEW.draft_id}/send-review`)
  await expect(page.getByRole('heading', { name: 'Review saved draft version 1' })).toBeVisible()
  await capture(page, info, 'send-review')
  await page.getByRole('button', { name: 'Approve simulated send' }).scrollIntoViewIfNeeded()
  await capture(page, info, 'send-review-actions')
})
test('corporate send status', async ({ page }, info) => {
  await routeApi(page, { [`/v1/send-intents/${STATUS.send_id}`]: STATUS })
  await page.goto(`/#${base}/send-intents/${STATUS.send_id}`)
  await expect(page.getByRole('button', { name: 'Cancel before dispatch' })).toBeVisible()
  await capture(page, info, 'send-status')
  await page.getByRole('button', { name: 'Cancel before dispatch' }).evaluate(element => element.scrollIntoView({ block: 'center' }))
  await page.screenshot({ path: info.outputPath('send-status-actions.png') })
})
test('corporate loading', async ({ page }, info) => {
  await page.route('**/v1/session', () => {})
  await page.goto('/')
  await expect(page.getByRole('status', { name: 'Loading session' })).toBeVisible()
  await capture(page, info, 'loading')
})
test('corporate error', async ({ page }, info) => {
  await page.route('**/v1/session', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ code: 'unavailable', message: 'Synthetic unavailable service', request_id: 'visual' }) }))
  await page.goto('/')
  await expect(page.getByRole('alert')).toBeVisible()
  await capture(page, info, 'error')
})
