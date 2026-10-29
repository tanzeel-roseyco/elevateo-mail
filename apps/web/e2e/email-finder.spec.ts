import { expect, test } from '@playwright/test'

// AIDEV-NOTE: Exercise the production entry with intercepted APIs; no discovery or SMTP traffic leaves the browser.
const session = {
  context_id: 'finder_context_0123456789', authorization_version: 'finder_version_0123456789',
  actor: { id: '00000000-0000-4000-8000-000000000001', display_name: 'Finder reviewer' },
  organization: { id: '00000000-0000-4000-8000-000000000002', name: 'Example workspace' },
  simulation_mode: true, csrf_token: 'finder_csrf_01234567890123456789012345',
}
const id = '00000000-0000-4000-8000-000000000003'
const result = { status: 'risky', email: 'alex.morgan@example.com', confidence: 72,
  reasons: ['Domain accepts random recipients; the address is not verified.'],
  sources: ['https://example.com/team'], checked_at: '2026-10-29T00:00:00Z' }
const job = { id, kind: 'person', status: 'completed', total: 1, completed: 1, created_at: '2026-10-29T00:00:00Z',
  items: [{ row: 1, input: { name: 'Alex Morgan', domain: 'example.com' }, result }] }
const json = (value: unknown) => ({ contentType: 'application/json', body: JSON.stringify(value) })

test.beforeEach(async ({ page }) => {
  await page.route('**/v1/session', (route) => route.fulfill(json(session)))
  await page.route('**/v1/mailboxes**', (route) => route.fulfill(json({
    context_id: session.context_id, authorization_version: session.authorization_version, next_cursor: null, items: [],
  })))
  await page.route('**/v2/email-finder/**', (route) => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/health')) return route.fulfill(json({ smtp_available: false,
      smtp_reason: 'Connection timed out on port 25', ehlo_hostname: 'mail.example.com', remaining_daily_probes: 48,
      halted_until: null, worker_seen_at: '2026-10-29T00:00:00Z' }))
    if (path.endsWith('/suppressions')) return route.fulfill(json({ items: [] }))
    if (path.endsWith('/export')) return route.fulfill(json({ csv: 'email,status\nalex.morgan@example.com,risky\n' }))
    if (route.request().method() === 'POST' || path.endsWith(id)) return route.fulfill(json(job))
    return route.fulfill(json({ items: [job] }))
  })
})

test('finder forms, progress and results work at every viewport', async ({ page }, testInfo) => {
  await page.goto('/#/email-finder')
  await expect(page.getByRole('heading', { name: 'Email finder', exact: true })).toBeVisible()
  await expect(page.getByText(/Connection timed out on port 25/)).toBeVisible()
  await page.getByLabel('Full name').fill('Alex Morgan')
  await page.getByLabel('Company domain').fill('example.com')
  await page.screenshot({ path: `e2e/.results/finder-form-${testInfo.project.name}.png`, fullPage: true })
  await page.getByRole('button', { name: 'Start lookup' }).click()
  await expect(page.getByText('completed · 1 of 1 rows processed')).toBeVisible()
  await expect(page.getByText('alex.morgan@example.com', { exact: true })).toBeVisible()
  await expect(page.getByText(/risky · 72% confidence/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await page.screenshot({ path: `e2e/.results/finder-results-${testInfo.project.name}.png`, fullPage: true })
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  expect((await downloaded).suggestedFilename()).toBe(`email-finder-${id}.csv`)
  await page.getByRole('link', { name: 'Suppressions', exact: true }).click()
  await expect(page.getByText('No suppressions recorded.')).toBeVisible()
  await page.screenshot({ path: `e2e/.results/finder-suppressions-${testInfo.project.name}.png`, fullPage: true })
})

test('blocked sources are never displayed as not found', async ({ page }) => {
  await page.route(`**/v2/email-finder/jobs/${id}`, (route) => route.fulfill(json({ ...job,
    items: [{ row: 1, input: job.items[0]!.input, result: { ...result, status: 'sources_unavailable', confidence: 0,
      reasons: ['All search engines are temporarily blocked.'], email: undefined } }],
  })))
  await page.goto(`/#/email-finder?mode=jobs&job=${id}`)
  await expect(page.getByText(/sources unavailable · 0% confidence/)).toBeVisible()
  await expect(page.getByText('All search engines are temporarily blocked.')).toBeVisible()
})

test('API failures retain an explicit retry state', async ({ page }) => {
  await page.route('**/v2/email-finder/health', (route) => route.fulfill({ status: 503, ...json({
    code: 'temporarily_unavailable', message: 'Worker unavailable', request_id: 'finder-e2e',
  }) }))
  await page.goto('/#/email-finder')
  await expect(page.getByRole('alert')).toContainText('Could not load finder data')
  await expect(page.getByRole('button', { name: 'Refresh' })).toBeVisible()
})
