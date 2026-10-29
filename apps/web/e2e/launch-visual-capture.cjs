// Launch visual QA capture (2026-10-23 frontend lane). Runs ONLY inside the pinned Playwright image
// against the dev-fixtures entry served by Vite on 127.0.0.1:4173, plus the EmailGuard reference
// pages opened from disk. For every page, width and theme it writes a PNG and a geometry record
// (heading box, sidebar width, first card box, accent colours) so the 1–2px parity claim can be
// checked from numbers, not eyeballing. Not a Playwright test: `.cjs` keeps it out of testMatch.
//
//   node e2e/launch-visual-capture.cjs <out-dir> <design-ref-dir>
//
// AIDEV-NOTE: Reference pages are Livewire server renders with offline scripts; every non-file
// request is aborted so a missing CDN never stalls the capture, and `x-cloak` is stripped so the
// server-rendered state is visible.
const fs = require('node:fs')
const path = require('node:path')
const { chromium } = require('@playwright/test')

const [outDir, refDir] = process.argv.slice(2)
if (!outDir || !refDir) throw new Error('usage: node e2e/launch-visual-capture.cjs <out-dir> <design-ref-dir>')
fs.mkdirSync(outDir, { recursive: true })

const BASE = 'http://127.0.0.1:4173/dev-fixtures.html'
const WIDTHS = [
  { name: '1440', width: 1440, height: 1000 },
  { name: '390', width: 390, height: 844 },
]
// The app follows the OS colour scheme unless the user picks one, so emulating it covers both themes.
// References are captured in light only: the parity geometry does not depend on colour.
const THEMES = ['light', 'dark']
// The fixture inbox and the collaboration mailbox (two mailboxes => the unified list renders).
const CD_MAILBOX = '00000000-0000-4000-8000-000000000023'
const CD_THREAD = '00000000-0000-4000-8000-000000000033'

/** App pages: key, hash route, optional query, reference html (relative to design-ref). */
const PAGES = [
  { key: 'dashboard', hash: '#/', ref: 'source-html/app/dashboard.html' },
  { key: 'inbox-unified', hash: '#/inbox' },
  { key: 'inbox-unified-starred', hash: '#/inbox?filter=starred' },
  { key: 'inbox-mailbox', hash: `#/mailboxes/${CD_MAILBOX}` },
  { key: 'inbox-mailbox-archive', hash: `#/mailboxes/${CD_MAILBOX}?filter=archive` },
  { key: 'thread', hash: `#/mailboxes/${CD_MAILBOX}/threads/${CD_THREAD}` },
  { key: 'drafts', hash: `#/mailboxes/${CD_MAILBOX}/drafts` },
  { key: 'search', hash: '#/search?q=fixture' },
  { key: 'settings-workspace', hash: '#/settings/workspace', query: 'production-settings', ref: 'source-html/settings/workspaces__show.html' },
  { key: 'settings-workspace-name', hash: '#/settings/workspace/name', query: 'production-settings' },
  { key: 'settings-workspace-invite', hash: '#/settings/workspace/invite', query: 'production-settings' },
  { key: 'settings-workspace-invitations', hash: '#/settings/workspace/invitations', query: 'production-settings' },
  { key: 'settings-workspace-create', hash: '#/settings/workspace/create', query: 'production-settings' },
  { key: 'settings-profile', hash: '#/settings/profile', query: 'production-settings', ref: 'source-html/settings/user__profile.html' },
  { key: 'settings-password', hash: '#/settings/profile/password', query: 'production-settings', ref: 'source-html/settings/user__password.html' },
  { key: 'settings-tags', hash: '#/settings/tags', query: 'production-settings', ref: 'source-html/settings/tags.html' },
  { key: 'settings-developer-api', hash: '#/settings/developer-api', query: 'production-settings', ref: 'source-html/settings/api-settings.html' },
  { key: 'settings-webhooks', hash: '#/settings/webhooks', query: 'production-settings', ref: 'source-html/settings/webhooks.html' },
  { key: 'settings-webhooks-create', hash: '#/settings/webhooks/create', query: 'production-settings' },
  { key: 'settings-integrations', hash: '#/settings/integrations', query: 'production-settings', ref: 'source-html/settings/integrations.html' },
  { key: 'settings-integrations-mcp', hash: '#/settings/integrations/mcp', query: 'production-settings', ref: 'source-html/settings/integrations__emailguard-mcp.html' },
  { key: 'settings-tags-demo-adapter', hash: '#/settings/tags' },
  // FC web-quality: these three captured their error states until the fixture entry gained simulated
  // V2 administration and preference ports (src/dev/simulatedPeople.ts).
  { key: 'people', hash: '#/people' },
  { key: 'settings-workspace-members', hash: '#/settings/workspace/members' },
  { key: 'settings-personal-details', hash: '#/settings/profile/personal-details' },
  // FC screens over their simulated adapters (the production-settings variants above show unavailable).
  { key: 'settings-integrations-mcp-simulated', hash: '#/settings/integrations/mcp' },
  { key: 'bounces', hash: `#/mailboxes/${CD_MAILBOX}/bounces` },
  { key: 'suppressions', hash: `#/mailboxes/${CD_MAILBOX}/suppressions` },
  { key: 'help', hash: '#/help' },
]

const GEOMETRY = `(() => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), fontSize: cs.fontSize, fontWeight: cs.fontWeight, radius: cs.borderTopLeftRadius, border: cs.borderTopWidth + ' ' + cs.borderTopColor, shadow: cs.boxShadow, color: cs.color, bg: cs.backgroundColor } }
  // Selector lists return the first match in DOCUMENT order, so the preference order is applied by hand:
  // the app's main heading first, then the reference's main-column heading, then any heading.
  const h1 = ['main h1', 'h1', '[data-flux-main] [data-flux-heading].text-lg', '[data-flux-heading].text-lg'].map((sel) => document.querySelector(sel)).find(Boolean) || null
  const sidebar = document.querySelector('aside, ui-sidebar, [data-flux-sidebar]')
  const card = document.querySelector('main [class*="rounded-xl"][class*="border"], [class*="rounded-xl"][class*="border"]')
  const primary = Array.from(document.querySelectorAll('button, a')).find((el) => /bg-\\(--color-accent\\)|bg-\\[var\\(--color-accent\\)\\]|bg-accent|bg-\\[var\\(--color-accent\\)/.test(el.className))
  const accents = Array.from(document.querySelectorAll('[class*="blue-"], [class*="sky-"]')).length
  return { title: document.title, h1: box(h1), h1Text: h1 ? h1.textContent.trim() : null, sidebar: box(sidebar), card: box(card), primary: box(primary), blueOrSkyClasses: accents, scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }
})()`

/** Returns the readiness problems (empty when the page settled); a stuck skeleton is evidence, not success. */
async function settle(page, errors) {
  // Fixture data resolves within a frame or two; wait for the skeletons to leave and fonts to load.
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 8000 }).catch(() => errors.push('fonts did not finish loading within 8s'))
  await page.waitForFunction(() => !document.querySelector('[role="status"][aria-label^="Loading"]'), null, { timeout: 8000 }).catch(() => errors.push('loading skeleton still present after 8s'))
  await page.waitForTimeout(300)
}

const APP_ORIGIN = 'http://127.0.0.1:4173'
/** Only the preview server origin and local files may load; the origin is parsed, never prefix-matched. */
function isLocal(url) {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'file:' || parsed.origin === APP_ORIGIN
  } catch {
    return false
  }
}

;(async () => {
  const browser = await chromium.launch()
  const results = []
  for (const theme of THEMES) for (const size of WIDTHS) {
    const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1, reducedMotion: 'reduce', colorScheme: theme })
    // Offline references: anything that is not the dev server or a local file is aborted.
    await context.route('**/*', (route) => (isLocal(route.request().url()) ? route.continue() : route.abort()))
    for (const spec of PAGES) {
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', (err) => errors.push(String(err)))
      page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()) })
      const url = `${BASE}${spec.query ? `?${spec.query}` : ''}${spec.hash}`
      await page.goto(url)
      await settle(page, errors)
      const file = `${spec.key}-${size.name}-${theme}.png`
      await page.screenshot({ path: path.join(outDir, file), fullPage: true })
      const geometry = await page.evaluate(GEOMETRY)
      const record = { key: spec.key, width: size.width, theme, url, file, geometry, errors }
      if (spec.ref && theme === 'light') {
        const refPage = await context.newPage()
        const refErrors = []
        refPage.on('pageerror', (err) => refErrors.push(String(err)))
        // A missing or broken reference file must fail the capture: a blank reference would make every delta meaningless.
        await refPage.goto(`file://${path.join(refDir, spec.ref)}`, { waitUntil: 'domcontentloaded' })
        await refPage.evaluate(() => { document.querySelectorAll('[x-cloak]').forEach((el) => el.removeAttribute('x-cloak')) })
        await refPage.waitForTimeout(500)
        const refFile = `${spec.key}-REF-${size.name}.png`
        await refPage.screenshot({ path: path.join(outDir, refFile), fullPage: true })
        record.ref = { file: refFile, geometry: await refPage.evaluate(GEOMETRY), errors: refErrors }
        if (!record.ref.geometry.h1) errors.push(`reference ${spec.ref} has no detectable main heading`)
        const a = geometry.h1, b = record.ref.geometry.h1
        record.h1Delta = a && b ? { dx: +(a.x - b.x).toFixed(1), dy: +(a.y - b.y).toFixed(1), dh: +(a.h - b.h).toFixed(1), fontSize: [a.fontSize, b.fontSize] } : null
        const sa = geometry.sidebar, sb = record.ref.geometry.sidebar
        record.sidebarDelta = sa && sb ? { dw: +(sa.w - sb.w).toFixed(1) } : null
        await refPage.close()
      }
      results.push(record)
      console.log(`${file} h1=${JSON.stringify(geometry.h1 && { x: geometry.h1.x, y: geometry.h1.y, h: geometry.h1.h, fs: geometry.h1.fontSize })} ref-dy=${record.h1Delta ? record.h1Delta.dy : '-'} sidebar-dw=${record.sidebarDelta ? record.sidebarDelta.dw : '-'} errors=${errors.length}`)
      await page.close()
    }
    await context.close()
  }
  await browser.close()
  fs.writeFileSync(path.join(outDir, 'geometry.json'), JSON.stringify(results, null, 2))
  const failed = results.filter((r) => r.errors.length > 0)
  console.log(`captures=${results.length} written to ${outDir}; pages with readiness or console errors: ${failed.length}`)
  // Readiness problems are recorded per page above; they also fail the run so unfinished UI is never quiet evidence.
  if (failed.length > 0) process.exit(2)
})().catch((error) => {
  console.error(error)
  process.exit(1)
})
