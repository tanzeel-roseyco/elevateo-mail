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
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(ENTRY)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await page.screenshot({ path: 'e2e/.results/entry.png', fullPage: true })
})

test('real keyboard traversal: Tab reaches the skip link, Enter lands on main', async ({ page }) => {
  await page.goto(ENTRY)
  await expect(page.getByRole('navigation', { name: 'Mailboxes' })).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('real keyboard navigation: Tab reaches a conversation row and Enter opens its reader', async ({ page }) => {
  await page.goto(ENTRY)
  await page.getByRole('link', { name: 'Fixture inbox' }).click()
  const firstThread = page.locator('a[data-thread]').first()
  await expect(firstThread).toBeVisible()
  // Walk real Tab stops until the first conversation link holds focus; bounded so a broken tab
  // order fails instead of looping.
  let reached = false
  for (let i = 0; i < 25 && !reached; i += 1) {
    await page.keyboard.press('Tab')
    reached = await firstThread.evaluate((el) => el === document.activeElement)
  }
  expect(reached, 'Tab never reached the first conversation link').toBe(true)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/threads\//)
  await expect(page.getByRole('heading', { name: '(no subject)' })).toBeFocused()
})

test.describe('mobile drawer at 390px (V8/D6)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('contains Tab and Shift+Tab, excludes the background, Escape restores the trigger', async ({ page }) => {
    await page.goto(ENTRY)
    const trigger = page.getByRole('button', { name: 'Open mailbox menu' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Mailboxes' })
    await expect(dialog).toBeVisible()
    // Background exclusion: the main region is inside an aria-hidden subtree while the modal is open.
    const hiddenMain = await page.evaluate(() => {
      const main = document.getElementById('main')
      for (let node = main; node; node = node.parentElement) {
        if (node.getAttribute('aria-hidden') === 'true') return true
      }
      return false
    })
    expect(hiddenMain).toBe(true)
    // Real forward and backward traversal stays inside the dialog.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Shift+Tab')
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    await page.screenshot({ path: 'e2e/.results/drawer-390.png', fullPage: true })
    // Escape closes and restores focus to the trigger.
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('selecting a mailbox in the drawer closes it and shows that mailbox', async ({ page }) => {
    await page.goto(ENTRY)
    const trigger = page.getByRole('button', { name: 'Open mailbox menu' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Mailboxes' })
    await dialog.getByRole('link', { name: 'Fixture inbox' }).click()
    await expect(dialog).not.toBeVisible()
    await expect(page.getByRole('heading', { name: 'Conversations' })).toBeVisible()
    // Focus lands on the intended, visible target: Radix restores it to the drawer trigger on
    // close (D6); it must not be stranded on <body> or inside the removed dialog.
    await expect(trigger).toBeVisible()
    await expect(trigger).toBeFocused()
  })

  test('populated inbox at 390px has no horizontal overflow', async ({ page }) => {
    await page.goto(ENTRY)
    await page.getByRole('button', { name: 'Open mailbox menu' }).click()
    await page.getByRole('dialog', { name: 'Mailboxes' }).getByRole('link', { name: 'Fixture inbox' }).click()
    await expect(page.locator('a[data-thread]').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
    await page.screenshot({ path: 'e2e/.results/inbox-390.png', fullPage: true })
  })
})

// Computed-contrast measurement (FE-R14): the accent text token against its actual surfaces in
// both themes. Thresholds follow WCAG AA for normal text.
for (const theme of ['light', 'dark'] as const) {
  test(`accent text meets 4.5:1 on its surfaces in the ${theme} theme`, async ({ page }) => {
    await page.goto(ENTRY)
    await page.evaluate((t) => {
      document.documentElement.setAttribute('data-theme', t)
    }, theme)
    await page.getByRole('link', { name: 'Fixture inbox' }).click()
    await expect(page.getByRole('link', { name: 'Unread' })).toBeVisible()
    const ratios = await page.evaluate(() => {
      const luminance = (rgb: string): number => {
        const parts = rgb.match(/\d+(\.\d+)?/g)
        if (!parts || parts.length < 3) throw new Error(`Unparseable color: ${rgb}`)
        const [r, g, b] = parts.slice(0, 3).map((v) => {
          const c = Number(v) / 255
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        }) as [number, number, number]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const contrast = (fg: string, bg: string): number => {
        const [a, b] = [luminance(fg), luminance(bg)]
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
      }
      const surfaceBehind = (el: Element): string => {
        for (let node: Element | null = el; node; node = node.parentElement) {
          const bg = getComputedStyle(node).backgroundColor
          if (bg && !bg.includes('rgba(0, 0, 0, 0)') && bg !== 'transparent') return bg
        }
        return getComputedStyle(document.body).backgroundColor
      }
      const results: Record<string, number> = {}
      // Active sidebar item: accent text over the accent-soft tint.
      const active = document.querySelector('nav[aria-label="Mailboxes"] a[aria-current="page"]')
      if (active) results['sidebar-active'] = contrast(getComputedStyle(active).color, surfaceBehind(active))
      // Active filter pill in the content area.
      const pill = document.querySelector('nav[aria-label="Filter"] a[aria-current="page"]')
      if (pill) results['filter-active'] = contrast(getComputedStyle(pill).color, surfaceBehind(pill))
      // Focus indicator color against the panel surface.
      const probe = document.createElement('span')
      probe.style.color = 'var(--accent-text)'
      probe.style.backgroundColor = 'var(--surface)'
      document.body.append(probe)
      results['accent-on-surface'] = contrast(getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor)
      probe.style.backgroundColor = 'var(--surface-2)'
      results['accent-on-surface-2'] = contrast(getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor)
      probe.remove()
      return results
    })
    // Every measured surface must actually be present: a missing active-sidebar or active-filter
    // selector is a failure, not a silent skip of that contrast measurement.
    for (const key of ['sidebar-active', 'filter-active', 'accent-on-surface', 'accent-on-surface-2']) {
      expect(Object.keys(ratios), `surface not found/measured: ${key}`).toContain(key)
    }
    for (const [surface, ratio] of Object.entries(ratios)) {
      expect(ratio, `${theme} ${surface} measured ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5)
    }
    await page.screenshot({ path: `e2e/.results/contrast-${theme}.png`, fullPage: true })
  })
}

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
