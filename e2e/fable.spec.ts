import { expect, test } from '@playwright/test'

// AIDEV-NOTE: Campaign badges and mailbox labels must share a narrow row without hiding the next column.
test('campaign inbox rows fit mobile and split-reader widths', async ({ page }, info) => {
  await page.goto('/mail/inbox?campaign=any')
  const mobile = info.project.name === 'mobile'
  if (!mobile) {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.getByRole('button', { name: 'Switch to split view' }).click()
  }
  const list = page.getByTestId('mail-list')
  const labels = list.locator('[title^="Mailbox:"]')
  await expect(labels.first()).toBeVisible()
  const overflow = await list.locator('li').evaluateAll((rows) => rows.some((row) => row.scrollWidth > row.clientWidth + 1))
  expect(overflow).toBe(false)
  const clipped = await labels.evaluateAll((items) => items.some((item) => {
    const row = item.closest('li')?.getBoundingClientRect()
    const label = item.getBoundingClientRect()
    return !row || label.right > row.right + 1 || label.left < row.left - 1
  }))
  expect(clipped).toBe(false)
  await page.screenshot({ path: `e2e-shots/${info.project.name}-fable-mailboxes.png` })
  if (!mobile) {
    await page.setViewportSize({ width: 1024, height: 900 })
    await expect(page.getByRole('button', { name: 'Switch to list view' })).toBeHidden()
    await expect(list).toBeVisible()
  }
})
