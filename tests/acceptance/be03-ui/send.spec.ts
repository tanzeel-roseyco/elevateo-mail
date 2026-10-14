// Client-only SIMULATED evidence; no Rails, PostgreSQL, provider or durable queue proof.
import { expect, test, type Page, type TestInfo } from '@playwright/test'
const mailbox = '00000000-0000-4000-8000-000000000023'
const draft = '00000000-0000-4000-8000-000000000051'
const editor = `/mailboxes/${mailbox}/drafts/${draft}`
const review = `${editor}/send-review`
const entry = (mode: string, route = review) => `/be03-browser.html?case=${mode}#${route}`
async function capture(page: Page, info: TestInfo, name: string) {
  await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true })
  // The shell scrolls internally; capture the bottom at the ORIGINAL desktop/mobile viewport too.
  const button = page.getByRole('button', { name: /Approve simulated send|Retry original approval/ })
  if (await button.isVisible()) {
    await button.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath(`${name}-controls.png`), fullPage: true })
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)).toBe(false)
}
test('saved edits -> full literal review -> explicit attestation -> simulated queue', async ({ page }, info) => {
  await page.goto(entry('happy', editor))
  await page.getByLabel('Subject').fill('<script>Browser correspondence</script>')
  await page.getByLabel('To', { exact: true }).fill('Synthetic recipient <recipient@example.test>')
  await page.getByLabel('Message').fill('<img src="https://example.invalid/pixel">\nPlaintext browser evidence')
  await expect(page.getByRole('link', { name: 'Review simulated send' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText('Saved version 3')).toBeVisible()
  await page.getByRole('link', { name: 'Review simulated send' }).click()
  await expect(page.getByRole('status', { name: 'Loading send review' })).toBeVisible()
  await capture(page, info, 'review-loading')
  const heading = page.getByRole('heading', { name: 'Review saved draft version 3' })
  await expect(heading).toBeVisible()
  await expect(heading).toBeFocused()
  await expect(page.getByText('<script>Browser correspondence</script>', { exact: true })).toBeVisible()
  await expect(page.getByText('To — all 1 recipients', { exact: true })).toBeVisible()
  await expect(page.getByText('Synthetic recipient recipient@example.test', { exact: true })).toBeVisible()
  await expect(page.getByText('<img src="https://example.invalid/pixel">\nPlaintext browser evidence', { exact: true })).toBeVisible()
  await expect(page.getByText('None. Attachments are unsupported.')).toBeVisible()
  expect(await page.locator('article script, article img').count()).toBe(0)
  const approve = page.getByRole('button', { name: 'Approve simulated send' })
  await expect(approve).toBeDisabled()
  await capture(page, info, 'review-ready')
  await page.getByRole('checkbox').check()
  await approve.click()
  await expect(page.getByRole('heading', { name: 'Send intent: queued' })).toBeVisible()
  await expect(page.getByText('The approved intent is durably queued. No delivery is established.')).toBeVisible()
  await expect(page.getByText('SIMULATED browser harness — memory only. Nothing is sent or durably stored.')).toBeVisible()
  await capture(page, info, 'queued-SIMULATED')
})
test('lost approval response retries original binding only', async ({ page }, info) => {
  await page.goto(entry('retry'))
  await expect(page.getByRole('heading', { name: 'Review saved draft version 2' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Approve simulated send' }).click()
  await expect(page.getByRole('alert')).toContainText('Approval may have been stored')
  await expect(page.getByText(/Retry details are kept only in memory/)).toBeVisible()
  await capture(page, info, 'uncertain-original-retry')
  await page.getByRole('button', { name: 'Retry original approval' }).click()
  await expect(page.getByRole('heading', { name: 'Send intent: queued' })).toBeVisible()
  await capture(page, info, 'retry-queued-SIMULATED')
})
for (const mode of ['empty', 'error', 'stale']) {
  test(`${mode} retains deliberate safe UI`, async ({ page }, info) => {
    await page.goto(entry(mode))
    if (mode === 'empty') {
      await expect(page.getByRole('alert')).toContainText('This draft is not ready')
      await expect(page.getByText('(no recipients)', { exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Approve simulated send' })).toBeDisabled()
    } else if (mode === 'error') {
      await expect(page.getByRole('alert')).toContainText('This review is unavailable')
      await expect(page.getByRole('button', { name: 'Load fresh review' })).toBeVisible()
    } else {
      await page.getByRole('checkbox').check()
      await page.getByRole('button', { name: 'Approve simulated send' }).click()
      await expect(page.getByRole('alert')).toContainText('Your draft text is retained')
      await expect(page.getByRole('button', { name: 'Load fresh review' })).toBeVisible()
    }
    await capture(page, info, mode)
  })
}

for (const mode of ['status-error', 'status-unknown']) {
  test(`${mode} preserves uncertain status semantics`, async ({ page }, info) => {
    await page.goto(entry(mode, `/mailboxes/${mailbox}/send-intents/00000000-0000-4000-8000-000000000091`))
    await expect(page.getByRole('status', { name: 'Loading send status' })).toBeVisible()
    await capture(page, info, `${mode}-loading`)
    if (mode === 'status-error') {
      await expect(page.getByRole('alert')).toContainText('No outcome or safe resend is established')
      await expect(page.getByRole('button', { name: 'Refresh status' })).toBeVisible()
    } else {
      await expect(page.getByRole('heading', { name: 'Send intent: unknown' })).toBeVisible()
      await expect(page.getByText('The simulated submission outcome is unknown. Do not resend or create a replacement draft.')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Request stop' })).toBeVisible()
    }
    await capture(page, info, mode)
  })
}
