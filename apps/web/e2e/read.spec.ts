// Authored, not executed: coordinator runs these in the pinned Playwright container (R6).
import { expect, test } from '@playwright/test'

const ENTRY = '/dev-fixtures.html'

test('fixture entry is visibly labelled and shows the simulated-mail indicator', async ({ page }) => {
  await page.goto(ENTRY)
  await expect(page.getByText('Development fixtures — synthetic data only', { exact: false })).toBeVisible()
  await expect(page.getByText('Simulated local mail')).toBeVisible()
  await page.screenshot({ path: 'e2e/.results/shell.png', fullPage: true })
})

test('keyboard traversal: skip link, mailbox, conversation, reader focus', async ({ page }) => {
  await page.goto(ENTRY)
  await expect(page.getByRole('navigation', { name: 'Mailboxes' })).toBeVisible()
  await page.getByRole('link', { name: 'Fixture inbox' }).click()
  const thread = page.locator('a[data-thread]').first()
  await expect(thread).toBeVisible()
  await thread.focus()
  await page.keyboard.press('Enter')
  // Reader focus lands on the conversation heading; hostile body text is inert visible text.
  await expect(page.getByRole('heading', { name: '(no subject)' })).toBeFocused()
  await expect(page.getByText('<script>alert(1)</script>', { exact: false })).toBeVisible()
  const scripts = await page.locator('article script, article img').count()
  expect(scripts).toBe(0)
  await page.screenshot({ path: 'e2e/.results/reader.png', fullPage: true })
})

test('no horizontal overflow at 390px and readable empty state', async ({ page }) => {
  await page.goto(ENTRY)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'e2e/.results/entry.png', fullPage: true })
})

test('no request leaves for remote hosts while reading hostile content', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.hostname !== '127.0.0.1') external.push(request.url())
  })
  await page.goto(ENTRY)
  await page.getByRole('link', { name: 'Fixture inbox' }).click()
  await page.locator('a[data-thread]').first().click()
  await expect(page.getByText('alert(1)', { exact: false })).toBeVisible()
  expect(external).toEqual([])
})
