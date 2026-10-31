# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: read.spec.ts >> animations respect the reduced-motion preference (FE-R16)
- Location: e2e/read.spec.ts:325:1

# Error details

```
Error: transition-duration 0s

expect(received).toBeCloseTo(expected, precision)

Expected: 0.075
Received: 0

Expected precision:    5
Expected difference: < 0.000005
Received difference:   0.075
```

# Page snapshot

```yaml
- generic:
  - generic:
    - generic:
      - generic [aria-hidden]:
        - link:
          - /url: "#main"
          - text: Skip to content
        - complementary:
          - generic:
            - generic:
              - link:
                - /url: "#/"
                - generic: Elevateo Co.
              - button [expanded]
            - generic:
              - button:
                - generic: Synthetic organization A
            - generic:
              - navigation:
                - list:
                  - listitem:
                    - link:
                      - /url: "#/inbox"
                      - generic: Inbox
                  - listitem:
                    - link:
                      - /url: "#/"
                      - generic: Dashboard
              - navigation:
                - paragraph: Mail
                - list:
                  - listitem:
                    - link:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000021"
                      - generic: Fixture inbox
                  - listitem:
                    - link:
                      - /url: "#/mailboxes/00000000-0000-4000-8000-000000000023"
                      - generic: C/D fixture mailbox
                  - listitem:
                    - link:
                      - /url: "#/search"
                      - generic: Search
              - navigation:
                - paragraph: Outreach
                - list:
                  - listitem:
                    - link:
                      - /url: "#/outreach/campaigns"
                      - generic: Campaigns
                  - listitem:
                    - link:
                      - /url: "#/outreach/leads"
                      - generic: Leads
                  - listitem:
                    - link:
                      - /url: "#/outreach/accounts"
                      - generic: Accounts
                  - listitem:
                    - link:
                      - /url: "#/outreach/analytics"
                      - generic: Analytics
              - navigation:
                - paragraph: Contacts
                - list:
                  - listitem:
                    - link:
                      - /url: "#/people"
                      - generic: People
                  - listitem:
                    - link:
                      - /url: "#/email-finder"
                      - generic: Email finder
              - navigation:
                - list:
                  - listitem:
                    - link:
                      - /url: "#/settings"
                      - generic: Settings
                  - listitem:
                    - link:
                      - /url: "#/help"
                      - generic: Help
            - generic:
              - button:
                - generic [aria-hidden]: FA
                - generic: Fixture user A
        - generic:
          - main:
            - generic:
              - region:
                - navigation:
                  - list:
                    - listitem:
                      - link:
                        - /url: "#/"
                        - text: Home
                    - listitem:
                      - generic: Custom Tags
                - generic:
                  - generic:
                    - generic:
                      - generic:
                        - heading [level=1]: Custom Tags
                        - paragraph: Manage all your tags for this workspace
                      - generic:
                        - generic:
                          - button: Get Help
                    - separator
                - navigation:
                  - link:
                    - /url: "#/settings/workspace"
                    - text: Workspace
                  - link:
                    - /url: "#/settings/profile"
                    - text: Profile
                  - link:
                    - /url: "#/settings/tags"
                    - text: Tags
                  - link:
                    - /url: "#/settings/developer-api"
                    - text: Developer API
                  - link:
                    - /url: "#/settings/webhooks"
                    - text: Webhooks
                  - link:
                    - /url: "#/settings/integrations"
                    - text: Integrations
                - note:
                  - generic:
                    - heading [level=3]: "Simulated UI adapter: not saved on the server"
                    - generic: This build has no server endpoint for these settings. Changes are kept in this browser only, for this workspace, and never reach other members.
                - generic:
                  - generic:
                    - heading [level=2]: Tags
                    - button: Add New Tag
                  - generic:
                    - generic:
                      - heading [level=2]: No tags yet
                      - paragraph: Tags label conversations and campaigns for your team. Create your first tag to start organising.
                      - generic:
                        - button: Add New Tag
          - status:
            - generic: Simulated local mail
            - generic: "Simulation mode: no mail is sent or received. Drafts and notes are saved on the server."
      - status
      - note [aria-hidden]: Development fixtures — synthetic data only. Nothing is sent, received or saved.
  - dialog [ref=e2]:
    - heading "Add New Tag" [level=2] [ref=e3]
    - button "Close" [active] [ref=e5]
    - generic [ref=e9]:
      - generic [ref=e10]:
        - generic [ref=e11]: Tag Name
        - textbox "Tag Name" [ref=e13]:
          - /placeholder: Enter tag name...
      - group "Color" [ref=e14]:
        - radiogroup "Tag colour" [ref=e16]:
          - radio "Rose" [checked] [ref=e17]
          - radio "Peach" [ref=e18]
          - radio "Lemon" [ref=e19]
          - radio "Lime" [ref=e20]
          - radio "Mint" [ref=e21]
          - radio "Aqua" [ref=e22]
          - radio "Sky" [ref=e23]
          - radio "Lavender" [ref=e24]
          - radio "Pink" [ref=e25]
          - radio "Stone" [ref=e26]
          - radio "Red" [ref=e27]
          - radio "Orange" [ref=e28]
          - radio "Gold" [ref=e29]
          - radio "Green" [ref=e30]
          - radio "Teal" [ref=e31]
          - radio "Cyan" [ref=e32]
          - radio "Indigo" [ref=e33]
          - radio "Violet" [ref=e34]
          - radio "Magenta" [ref=e35]
          - radio "Slate" [ref=e36]
      - generic [ref=e37]:
        - text: "Preview:"
        - generic [ref=e38]: Tag name
    - generic [ref=e39]:
      - button "Cancel" [ref=e40]
      - button "Create Tag" [ref=e41]
```

# Test source

```ts
  260 |         }
  261 |         const [r, g, b, alpha] = ctx.getImageData(0, 0, 1, 1).data
  262 |         if (alpha !== 255) throw new Error('No opaque ancestor background; refusing an assumed backdrop')
  263 |         return `rgb(${r}, ${g}, ${b})`
  264 |       }
  265 |       const results: Record<string, number> = {}
  266 |       // Raw computed serializations per surface: the evidence record of what the browser actually
  267 |       // reported, so a ratio can be audited against the real pixels instead of trusted blindly.
  268 |       const raws: Record<string, string> = {}
  269 |       const measure = (key: string, fg: string, bg: string) => {
  270 |         raws[key] = `${fg} on ${bg}`
  271 |         results[key] = contrast(fg, bg)
  272 |       }
  273 |       // Active sidebar item: accent text over its current background, measured only on a RENDERED
  274 |       // copy (the drawer's below md, the rail's otherwise) — a display:none rail copy has no
  275 |       // client rects and is skipped, so a missing visible copy fails the must-measure check below.
  276 |       const active = Array.from(
  277 |         document.querySelectorAll('nav[aria-labelledby="sidebar-mail"] a[aria-current="page"]'),
  278 |       ).find((el) => el.getClientRects().length > 0)
  279 |       if (active) measure('sidebar-active', getComputedStyle(active).color, surfaceBehind(active))
  280 |       // Active filter pill in the content area.
  281 |       const pill = document.querySelector('nav[aria-label="Filter"] a[aria-current="page"]')
  282 |       if (pill && pill.getClientRects().length > 0) measure('filter-active', getComputedStyle(pill).color, surfaceBehind(pill))
  283 |       // Current accent text token against both panel surfaces.
  284 |       const probe = document.createElement('span')
  285 |       probe.style.color = 'var(--color-accent-content)'
  286 |       probe.style.backgroundColor = 'var(--surface)'
  287 |       document.body.append(probe)
  288 |       measure('accent-on-surface', getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor)
  289 |       probe.style.backgroundColor = 'var(--surface-2)'
  290 |       measure('accent-on-surface-2', getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor)
  291 |       probe.remove()
  292 |       return { ratios: results, raws, parser }
  293 |     })
  294 |     if (drawerPresentation) {
  295 |       await page.keyboard.press('Escape')
  296 |       await expect(page.getByRole('dialog', { name: 'Navigation' })).not.toBeVisible()
  297 |     }
  298 |     const { ratios, raws, parser } = measured
  299 |     // Parser regressions: both serializations agree, color(srgb …) creams read as light, unknown
  300 |     // formats fail closed. These guard the oracle itself before any ratio is trusted.
  301 |     expect(parser.white, 'rgb white luminance').toBeCloseTo(1, 5)
  302 |     expect(parser.cream, 'color(srgb) cream must read light, not near-black').toBeGreaterThan(0.7)
  303 |     expect(parser.redDelta, 'rgb vs color(srgb) must agree').toBeLessThan(1e-9)
  304 |     expect(parser.oklabLight, 'r5 oklab near-white must normalize light, not near-black').toBeGreaterThan(0.7)
  305 |     expect(parser.oklabWhiteDelta, 'oklab white must normalize to sRGB white').toBeLessThan(0.02)
  306 |     expect(parser.unknownThrew, 'unknown serialization must throw').toBe(true)
  307 |     // Actual computed values travel into the run record for parent audit against the screenshot.
  308 |     test.info().annotations.push({ type: `computed-colors-${theme}`, description: JSON.stringify(raws) })
  309 |     // Every measured surface must actually be present: a missing active-sidebar or active-filter
  310 |     // selector is a failure, not a silent skip of that contrast measurement.
  311 |     for (const key of ['sidebar-active', ...(hasFilterTabs ? ['filter-active'] : []), 'accent-on-surface', 'accent-on-surface-2']) {
  312 |       expect(Object.keys(ratios), `surface not found/measured: ${key}`).toContain(key)
  313 |     }
  314 |     for (const [surface, ratio] of Object.entries(ratios)) {
  315 |       expect(ratio, `${theme} ${surface} measured ${ratio.toFixed(2)}:1 (${raws[surface]})`).toBeGreaterThanOrEqual(4.5)
  316 |     }
  317 |     await page.screenshot({ path: `e2e/.results/contrast-${theme}.png`, fullPage: true })
  318 |   })
  319 | }
  320 |
  321 | // Closes the recorded coverage gap: configuring the reduced-motion project proved nothing about
  322 | // behavior. This asserts the REAL computed animation state from the bundle CSS in every project:
  323 | // under reduce, index.css collapses all animation/transition durations to 0.01ms so nothing can
  324 | // visibly move; without it, the pulse animation must genuinely run. Fail-closed on both branches.
  325 | test('animations respect the reduced-motion preference (FE-R16)', async ({ page }) => {
  326 |   await page.goto(ENTRY)
  327 |   await expect(page.getByText('Simulated local mail')).toBeVisible()
  328 |   await page.goto(`${ENTRY}#/settings/tags`)
  329 |   const tagHeader = page.getByRole('heading', { name: 'Tags', exact: true }).locator('..')
  330 |   await tagHeader.getByRole('button', { name: 'Add New Tag', exact: true }).click()
  331 |   const swatch = page.getByRole('radio', { checked: true })
  332 |   await expect(swatch).toBeVisible()
  333 |   await swatch.hover()
  334 |   const probe = await page.evaluate(() => {
  335 |     const pulse = document.createElement('div')
  336 |     pulse.className = 'animate-pulse' // the same class the real Skeleton uses
  337 |     document.body.append(pulse)
  338 |     const pulseStyle = getComputedStyle(pulse)
  339 |     const transitioned = document.querySelector('[role="radio"][aria-checked="true"]')
  340 |     const result = {
  341 |       reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  342 |       animationName: pulseStyle.animationName,
  343 |       animationDuration: pulseStyle.animationDuration.split(',')[0]!.trim(),
  344 |       transitionDuration: transitioned ? getComputedStyle(transitioned).transitionDuration.split(',')[0]!.trim() : null,
  345 |     }
  346 |     pulse.remove()
  347 |     return result
  348 |   })
  349 |   const seconds = (v: string): number => (v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v))
  350 |   expect(probe.animationName, 'pulse animation must exist in the bundle CSS').not.toBe('none')
  351 |   expect(probe.transitionDuration, 'a transitioned element must be present to measure').not.toBeNull()
  352 |   if (probe.reduce) {
  353 |     // 0.01ms (sub-millisecond) means no perceivable motion; a vacuous pass is impossible because
  354 |     // the same properties are asserted to be genuinely animated when the preference is absent.
  355 |     expect(seconds(probe.animationDuration), `animation-duration ${probe.animationDuration}`).toBeLessThanOrEqual(0.001)
  356 |     expect(seconds(probe.transitionDuration!), `transition-duration ${probe.transitionDuration}`).toBeLessThanOrEqual(0.001)
  357 |   } else {
  358 |     expect(seconds(probe.animationDuration), `animation-duration ${probe.animationDuration}`).toBeGreaterThanOrEqual(1)
  359 |     // The real tag swatch specifies duration-75; verify that exact non-reduced duration.
> 360 |     expect(seconds(probe.transitionDuration!), `transition-duration ${probe.transitionDuration}`).toBeCloseTo(0.075, 5)
      |                                                                                                   ^ Error: transition-duration 0s
  361 |   }
  362 | })
  363 |
  364 | test('no request leaves for remote hosts while reading hostile content', async ({ page }) => {
  365 |   const external: string[] = []
  366 |   page.on('request', (request) => {
  367 |     const url = new URL(request.url())
  368 |     if (url.hostname !== '127.0.0.1') external.push(request.url())
  369 |   })
  370 |   await page.goto(ENTRY)
  371 |   await openMailbox(page, 'Fixture inbox')
  372 |   const hostileThread = page.getByRole('link', { name: /\(no subject\)/ })
  373 |   // AIDEV-NOTE: Hover/focus must not reveal desktop actions over the phone link before the security check.
  374 |   await hostileThread.hover()
  375 |   await hostileThread.focus()
  376 |   if ((page.viewportSize()?.width ?? 1280) < 768) {
  377 |     await expect(hostileThread.locator('..').getByRole('button', { name: /^Mark .* as (unread|read)$/ })).toHaveCount(0)
  378 |   }
  379 |   await hostileThread.click()
  380 |   await expect(page.getByText('alert(1)', { exact: false })).toBeVisible()
  381 |   await expect(page.locator('article script, article img, article iframe')).toHaveCount(0)
  382 |   expect(external).toEqual([])
  383 | })
  384 |
  385 | // FC web-quality: People, workspace members and Personal Details render the fixture entry's simulated
  386 | // V2 ports (src/dev/simulatedPeople.ts) instead of their error states, at desktop and phone width.
  387 | for (const width of [1440, 390]) {
  388 |   test(`People, workspace members and Personal Details show simulated data at ${width}px`, async ({ page }) => {
  389 |     await page.setViewportSize({ width, height: 900 })
  390 |     await page.goto(`${ENTRY}#/people`)
  391 |     await expect(page.getByText('Unbound roster verified with the organization gateway.')).toBeVisible()
  392 |     await expect(page.getByRole('heading', { name: 'Current organization grants' })).toBeVisible()
  393 |     await expect(page.getByText('Current grants could not be loaded')).toHaveCount(0)
  394 |     await page.goto(`${ENTRY}#/settings/workspace/members`)
  395 |     await expect(page.getByRole('heading', { name: 'Current organization grants' })).toBeVisible()
  396 |     await expect(page.getByRole('button', { name: 'Save role' }).first()).toBeVisible()
  397 |     await page.goto(`${ENTRY}#/settings/profile/personal-details`)
  398 |     await expect(page.getByLabel('Display name')).toBeVisible()
  399 |     await expect(page.getByText('Personal settings could not be loaded')).toHaveCount(0)
  400 |     const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  401 |     expect(overflow).toBeLessThanOrEqual(0)
  402 |   })
  403 | }
  404 |
  405 | // Failure path: `?production-settings` drops the simulated ports, so the pages keep their honest
  406 | // error state rather than inventing data.
  407 | test('without simulated ports Personal Details shows its error state, not invented data', async ({ page }) => {
  408 |   await page.goto(`${ENTRY}?production-settings#/settings/profile/personal-details`)
  409 |   await expect(page.getByText('Personal settings could not be loaded')).toBeVisible()
  410 |   await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
  411 | })
  412 |
```