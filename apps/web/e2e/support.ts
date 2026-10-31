// Shared shell navigation for viewport-spanning specs. Below the md breakpoint the mailbox
// navigation lives in the drawer dialog and the rail is display:none; at md and above the rail is
// always visible. Specs that run in every project must traverse whichever presentation the
// viewport provides instead of assuming the desktop rail.
import { expect, type Page } from '@playwright/test'

export async function setInboxFilter(page: Page, value: 'all' | 'unread'): Promise<void> {
  // AIDEV-NOTE: InboxPage replaces filter pills with the Folder select below md (768px).
  if ((page.viewportSize()?.width ?? 1280) < 768) {
    const folder = page.getByRole('combobox', { name: 'Folder', exact: true })
    await folder.selectOption(value)
    await expect(folder).toHaveValue(value)
  } else {
    const filter = page.getByRole('navigation', { name: 'Filter', exact: true })
      .getByRole('link', { name: value === 'all' ? 'All' : 'Unread', exact: true })
    await filter.click()
    await expect(filter).toHaveAttribute('aria-current', 'page')
  }
}

function drawerTrigger(page: Page) {
  return page.getByRole('button', { name: 'Open navigation' })
}

/** Waits for the ready shell header, then proves the mailbox navigation exists where this
 * viewport puts it: the visible rail at md and above, the drawer trigger below md. */
export async function expectMailboxNavReady(page: Page): Promise<void> {
  await expect(page.getByText('Simulated local mail')).toBeVisible()
  if (await drawerTrigger(page).isVisible()) return
  await expect(page.getByRole('navigation', { name: 'Mail' })).toBeVisible()
}

/** Clicks a mailbox link via the rail, or via the drawer below md. The drawer path also asserts
 * the dialog's mailbox navigation and that selecting a route closes the dialog (D6). */
export async function openMailbox(page: Page, name: string): Promise<void> {
  await expect(page.getByText('Simulated local mail')).toBeVisible()
  const trigger = drawerTrigger(page)
  if (await trigger.isVisible()) {
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Navigation' })
    await expect(dialog.getByRole('navigation', { name: 'Mail' })).toBeVisible()
    await dialog.getByRole('navigation', { name: 'Mail' }).getByRole('link', { name, exact: true }).click()
    await expect(dialog).not.toBeVisible()
  } else {
    // Rail-scoped and exact: Today also links each mailbox, and "50 unread in <name>" matches a substring.
    await page.getByRole('navigation', { name: 'Mail' }).getByRole('link', { name, exact: true }).click()
  }
}
