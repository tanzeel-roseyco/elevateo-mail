import { expect, test, type Page, type TestInfo } from '@playwright/test'

// AIDEV-NOTE: Brand theme, new sections and resilience states. Screenshots feed the visual QA gate in both themes.

const shot = (page: Page, info: TestInfo, name: string) => page.screenshot({ path: `e2e-shots/${info.project.name}-${name}.png` })
const isMobile = (info: TestInfo) => info.project.name === 'mobile'
// Resolved through a probe element: the build may shorten "#ffffff" to "#fff", but the computed colour is canonical.
const token = (page: Page, name: string) =>
  page.evaluate((n) => {
    const probe = document.createElement('div')
    probe.style.backgroundColor = `var(${n})`
    document.body.append(probe)
    const colour = getComputedStyle(probe).backgroundColor
    probe.remove()
    return colour
  }, name)
const GOLD = 'rgb(201, 162, 39)'

async function openNav(page: Page, info: TestInfo) {
  if (isMobile(info)) await page.getByRole('button', { name: 'Open navigation' }).click()
  return page.getByRole('navigation', { name: 'Main' })
}

test('light theme is white with a gold accent; dark theme is dark grey', async ({ page }, info) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/overview')
  await expect(page.getByRole('heading', { name: 'Overview', level: 1 })).toBeVisible()
  expect(await token(page, '--surface')).toBe('rgb(255, 255, 255)')
  expect(await token(page, '--accent')).toBe(GOLD)
  await shot(page, info, 'brand-overview-light')

  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(await token(page, '--surface')).toBe('rgb(37, 38, 42)')
  expect(await token(page, '--bg')).toBe('rgb(27, 28, 31)')
  expect(await token(page, '--accent')).toBe(GOLD)
  await shot(page, info, 'brand-overview-dark')
  await page.goto('/mail/inbox')
  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible()
  await shot(page, info, 'brand-inbox-dark')
  await page.goto('/campaigns')
  await expect(page.getByRole('heading', { name: 'Campaigns', level: 1 })).toBeVisible()
  await shot(page, info, 'brand-campaigns-dark')
})

test('the transparent logo loads undistorted in the navigation', async ({ page }, info) => {
  await page.goto('/overview')
  await openNav(page, info)
  const logo = page.locator('img[src="/logo.png"]').last()
  await expect(logo).toBeVisible()
  const size = await logo.evaluate((img: HTMLImageElement) => ({ natural: img.naturalWidth / img.naturalHeight, box: img.clientWidth / img.clientHeight, loaded: img.complete && img.naturalWidth > 0, background: getComputedStyle(img).backgroundColor }))
  expect(size.loaded).toBe(true)
  expect(size.box).toBeCloseTo(size.natural, 2)
  expect(size.background).toBe('rgba(0, 0, 0, 0)')
  // The file itself must be transparent, not just the element: the corner of the round mark has zero alpha.
  const cornerAlpha = await logo.evaluate((img: HTMLImageElement) => {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const context = canvas.getContext('2d')!
    context.drawImage(img, 0, 0)
    return context.getImageData(1, 1, 1, 1).data[3]
  })
  expect(cornerAlpha).toBe(0)
})

test('connections sections are reachable, deep-linkable and survive back/forward', async ({ page }, info) => {
  await page.goto('/overview')
  const nav = await openNav(page, info)
  await nav.getByRole('link', { name: 'Connections' }).click()
  await expect(page).toHaveURL(/\/connections\/mailboxes$/)
  await expect(page.getByRole('list', { name: 'Connected mailboxes' }).getByRole('listitem')).toHaveCount(9)
  await shot(page, info, 'connections-mailboxes')

  const sections = page.getByRole('navigation', { name: 'Connections sections' })
  for (const [name, heading] of [['Sending', 'Two separate routes'], ['AI', 'Local AI programs'], ['Enrichment', 'Enrichment'], ['Domains', 'Sending domains']] as const) {
    await sections.getByRole('link', { name, exact: true }).click()
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    await shot(page, info, `connections-${name.toLowerCase()}`)
  }
  await page.goBack()
  await expect(page).toHaveURL(/\/connections\/enrichment$/)
  await expect(page.getByText('Hunter', { exact: true })).toBeVisible()
  await page.goForward()
  await expect(page).toHaveURL(/\/connections\/domains$/)
  await expect(page.getByRole('heading', { name: 'Sending domains' })).toBeVisible()
  await page.goto('/connections/nope')
  await expect(page).toHaveURL(/\/connections\/mailboxes$/)
})

test('connecting a tenth mailbox reaches the limit and persists across reload', async ({ page }, info) => {
  await page.goto('/connections/mailboxes')
  await page.getByLabel('Mailbox address').fill('tenth@example.com')
  await page.getByRole('button', { name: 'Connect mailbox (simulated)' }).click()
  await expect(page.getByText('All 10 mailbox places are in use')).toBeVisible()
  await expect(page.getByRole('list', { name: 'Connected mailboxes' }).getByRole('listitem')).toHaveCount(10)
  await shot(page, info, 'connections-limit')
  await page.reload()
  await expect(page.getByRole('list', { name: 'Connected mailboxes' }).getByRole('listitem')).toHaveCount(10)
})

test('a failed connections load can be retried', async ({ page }) => {
  await page.goto('/connections/mailboxes?simulate=connections-error')
  await expect(page.getByRole('heading', { name: 'Connections could not be loaded' })).toBeVisible()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('list', { name: 'Connected mailboxes' })).toBeVisible()
})

test('the assistant prepares a labelled draft that opens for review', async ({ page }, info) => {
  await page.goto('/overview')
  const nav = await openNav(page, info)
  await nav.getByRole('link', { name: 'AI Assistant' }).click()
  await expect(page.getByRole('heading', { name: 'AI Assistant', level: 1 })).toBeVisible()
  await expect(page.getByText('Preview: no AI is connected')).toBeVisible()
  await shot(page, info, 'assistant')
  const first = page.getByRole('list', { name: 'Conversations waiting for a reply' }).getByRole('listitem').first()
  await first.getByRole('button', { name: 'Prepare draft (simulated)' }).click()
  await first.getByRole('button', { name: 'Review draft' }).click()
  await expect(page.getByLabel('Message body')).toHaveValue(/Simulated draft/)
  await expect(page.getByRole('button', { name: 'Simulate send' })).toBeVisible()
  await shot(page, info, 'assistant-review')
})

test('going offline shows a banner and pauses connection actions', async ({ page, context }, info) => {
  await page.goto('/connections/mailboxes')
  await expect(page.getByRole('list', { name: 'Connected mailboxes' })).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByText('You are offline.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect mailbox (simulated)' })).toBeDisabled()
  await shot(page, info, 'offline')
  await context.setOffline(false)
  await expect(page.getByText('You are offline.')).toBeHidden()
  await expect(page.getByRole('button', { name: 'Connect mailbox (simulated)' })).toBeEnabled()
})

test('new pages have no horizontal overflow', async ({ page }) => {
  // Each path is paired with text that only exists once its content has loaded, so the measurement is not of a skeleton.
  const pages = [['/connections/mailboxes', 'of 10 mailboxes connected'], ['/connections/sending', 'Resend identities'], ['/connections/ai', 'Local AI programs'], ['/connections/enrichment', 'Hunter'], ['/connections/domains', 'Sending domains'], ['/assistant', 'Current access:']] as const
  for (const [path, loaded] of pages) {
    await page.goto(path)
    await expect(page.getByText(loaded).first()).toBeVisible()
    // The shell clips overflow, so measure content directly. The section tabs scroll sideways on phones by design.
    const overflow = await page.evaluate(() => [...document.querySelectorAll('main *')].some((el) => {
      if (el.closest('nav')) return false
      const box = el.getBoundingClientRect()
      // Zero-size boxes are hidden or screen-reader-only nodes.
      return box.width > 1 && (box.right > window.innerWidth + 1 || box.left < -1)
    }))
    expect(overflow, path).toBe(false)
  }
})
