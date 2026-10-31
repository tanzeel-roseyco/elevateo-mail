import { chromium } from '@playwright/test'

// AIDEV-NOTE: Manifest screenshots contain only the real production sign-in view, never mailbox data.
const browser = await chromium.launch({ executablePath: chromium.executablePath() })
try {
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: 'light' })
    await page.goto('http://127.0.0.1:4180/')
    try { await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor() }
    catch (error) {
      console.error(await page.locator('body').innerText())
      await page.screenshot({ path: 'e2e/capture-failed.png' })
      throw error
    }
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await page.screenshot({ path: `public/brand/pwa-${name}.png` })
    await page.close()
  }
} finally { await browser.close() }
