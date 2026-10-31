import { chromium, expect, test, type Page } from '@playwright/test'

async function controlled(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}
test('manifest, icons, shortcuts and browser installability', async ({ request }) => {
  const context = await chromium.launchPersistentContext('', { executablePath: chromium.executablePath(), baseURL: 'http://127.0.0.1:4180' })
  try {
  const page = context.pages()[0]!
  await controlled(page)
  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ id: '/', scope: '/', start_url: '/#/inbox', display: 'standalone', name: 'Elevateo Mail', theme_color: '#ffffff', background_color: '#ffffff' })
  expect(manifest.shortcuts.map((item: { url: string }) => item.url)).toEqual(['/#/inbox', '/#/search'])
  expect(manifest.icons.some((icon: { purpose: string }) => icon.purpose === 'maskable')).toBe(true)
  for (const asset of [...manifest.icons, ...manifest.screenshots]) {
    expect((await request.get(asset.src)).status()).toBe(200)
  }
  const cdp = await page.context().newCDPSession(page)
  const result = await cdp.send('Page.getInstallabilityErrors')
  expect(result.installabilityErrors).toEqual([])
  } finally { await context.close() }
})
test('offline shell loads but API, callback and writes fail without caching or replay', async ({ page, context }) => {
  await controlled(page)
  await page.evaluate(async () => { await fetch('/v1/session', { cache: 'no-store' }) })
  const keys = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((r) => r.url)))).flat())
  expect(keys.length).toBeGreaterThan(10)
  expect(keys.every((key) => /\/(assets|brand)\/|\/shell-/.test(key))).toBe(true)
  expect(keys.every((key) => key.includes('?build='))).toBe(true)
  let posts = 0
  page.on('request', (request) => { if (request.method() === 'POST') posts++ })
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('You are offline.', { exact: false })).toBeVisible()
  for (const path of ['/v1/session', '/auth/complete', '/attachments/private']) {
    expect(await page.evaluate(async (url) => { try { await fetch(url); return true } catch { return false } }, path)).toBe(false)
  }
  expect(await page.evaluate(async () => { try { await fetch('/v2/send-approvals', { method: 'POST' }); return true } catch { return false } })).toBe(false)
  const attempts = posts
  await context.setOffline(false)
  await page.waitForTimeout(1500)
  expect(posts).toBe(attempts)
})
test('update waits for every open window without reload or storage mutation, then removes old caches', async ({ page, context, request }) => {
  await controlled(page)
  const other = await context.newPage()
  await controlled(other)
  const original = await page.evaluate(async () => (await caches.keys()).filter((key) => key.startsWith('elevateo-shell-')))
  await page.evaluate(() => {
    // AIDEV-NOTE: Sentinels detect reload/storage mutation; draft/version and approval behavior have separate tests.
    const field = document.createElement('textarea')
    field.setAttribute('aria-label', 'Unsaved draft sentinel')
    field.value = 'Do not discard this draft'
    document.body.append(field)
    sessionStorage.setItem('elevateo.approval-recovery.v1', 'pending-approval-sentinel')
  })
  await request.post('/__test/version')
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update() })
  await expect(page.getByRole('status', { name: 'App update' })).toBeVisible()
  await expect(page.getByLabel('Unsaved draft sentinel')).toHaveValue('Do not discard this draft')
  expect(await page.evaluate(() => sessionStorage.getItem('elevateo.approval-recovery.v1'))).toBe('pending-approval-sentinel')
  await page.close()
  expect(await other.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(true)
  await other.close()
  const next = await context.newPage()
  await controlled(next)
  await expect.poll(() => next.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting)).toBe(false)
  const updated = await next.evaluate(() => caches.keys())
  expect(updated.some((name) => original.includes(name))).toBe(false)
})

for (const width of [1440, 390]) for (const colorScheme of ['light'] as const) {
  test(`visual ${width} ${colorScheme} browser and standalone`, async ({ browserName }, testInfo) => {
    expect(browserName).toBe('chromium')
    // AIDEV-NOTE: A real installed app window needs headed Chrome under xvfb; media emulation cannot prove this.
    const context = await chromium.launchPersistentContext('', { headless: false, executablePath: chromium.executablePath(), baseURL: 'http://127.0.0.1:4180' })
    try {
    const page = context.pages()[0]!
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await controlled(page)
    await expect(page.getByText('Install help', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: testInfo.outputPath(`${width}-${colorScheme}-browser.png`), fullPage: true })
    const cdp = await page.context().newCDPSession(page)
    const manifestId = 'http://127.0.0.1:4180/'
    await cdp.send('PWA.install', { manifestId })
    await cdp.send('PWA.changeAppUserSettings', { manifestId, displayMode: 'standalone' })
    const opened = context.waitForEvent('page')
    await cdp.send('PWA.launch', { manifestId })
    const app = await opened
    await app.setViewportSize({ width, height: width === 390 ? 844 : 900 })
    await app.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
    await app.waitForLoadState('networkidle')
    expect(await app.evaluate(() => matchMedia('(display-mode: standalone)').matches)).toBe(true)
    await expect(app.getByText('Install help', { exact: true })).toHaveCount(0)
    expect(await app.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await app.screenshot({ path: testInfo.outputPath(`${width}-${colorScheme}-standalone.png`), fullPage: true })
    } finally { await context.close() }
  })
}
