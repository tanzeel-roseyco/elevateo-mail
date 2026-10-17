// Route screenshot capture for the design audit. Usage: node capture.mjs <outDir> <label>
import { chromium } from 'playwright'
import fs from 'node:fs'

const [outDir, label] = process.argv.slice(2)
const BASE = 'http://127.0.0.1:4173'
fs.mkdirSync(outDir, { recursive: true })

const browser = await chromium.launch()
const viewports = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } }

async function discover(page) {
  await page.goto(`${BASE}/demo.html`)
  await page.waitForTimeout(1500)
  const hash = await page.evaluate(() => location.hash)
  const mbx = hash.match(/mailboxes\/([^/]+)/)?.[1]
  const thread = await page.locator('a[href*="/threads/"]').first().getAttribute('href').catch(() => null)
  await page.goto(`${BASE}/demo.html#/mailboxes/${mbx}/drafts`)
  await page.waitForTimeout(1200)
  const draft = await page.locator('a[href*="/drafts/"]').first().getAttribute('href').catch(() => null)
  return { mbx, thread, draft }
}

const ctx0 = await browser.newContext({ viewport: viewports.desktop })
const ids = await discover(await ctx0.newPage())
await ctx0.close()
console.log('ids', ids)

const routes = [
  ['home', '#/'],
  ['inbox', `#/mailboxes/${ids.mbx}`],
  ['inbox-unread', `#/mailboxes/${ids.mbx}?filter=unread`],
  ['thread', ids.thread],
  ['drafts', `#/mailboxes/${ids.mbx}/drafts`],
  ['draft-editor', ids.draft],
  ['send-review', ids.draft ? `${ids.draft}/send-review` : null],
  ['members', `#/mailboxes/${ids.mbx}/members`],
  ['search', '#/search?q=invoice'],
  ['campaigns', '#/outreach/campaigns'],
  ['campaign-new', '#/outreach/campaigns/new'],
  ['leads', '#/outreach/leads'],
  ['accounts', '#/outreach/accounts'],
  ['analytics', '#/outreach/analytics'],
  ['people', '#/people'],
  ['settings-personal', '#/settings/personal'],
  ['settings-org', '#/settings/organization'],
]

for (const [vpName, vp] of Object.entries(viewports)) {
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: vp, colorScheme: scheme })
    const page = await ctx.newPage()
    for (const [name, hash] of routes) {
      if (!hash) continue
      await page.goto(`${BASE}/demo.html${hash.startsWith('#') ? hash : `#${hash}`}`)
      await page.waitForTimeout(1300)
      await page.screenshot({ path: `${outDir}/${label}-${name}-${vpName}-${scheme}.png`, fullPage: false })
    }
    await page.goto(`${BASE}/dev-fixtures.html#/fixtures?getSession=unauthenticated`)
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `${outDir}/${label}-signin-${vpName}-${scheme}.png` })
    if (vpName === 'mobile') {
      await page.goto(`${BASE}/demo.html#/mailboxes/${ids.mbx}`)
      await page.waitForTimeout(1200)
      const menu = page.getByRole('button', { name: /navigation|menu/i }).first()
      if (await menu.isVisible().catch(() => false)) {
        await menu.click()
        await page.waitForTimeout(500)
        await page.screenshot({ path: `${outDir}/${label}-nav-drawer-${vpName}-${scheme}.png` })
      }
    }
    await ctx.close()
  }
}
await browser.close()
