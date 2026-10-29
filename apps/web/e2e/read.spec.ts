// Authored, not executed: coordinator runs these in the pinned Playwright container (R6).
import { expect, test } from '@playwright/test'
import { expectMailboxNavReady, openMailbox } from './support'

const ENTRY = '/dev-fixtures.html'

test('fixture entry is visibly labelled and shows the simulated-mail indicator', async ({ page }) => {
  await page.goto(ENTRY)
  await expect(page.getByText('Development fixtures — synthetic data only', { exact: false })).toBeVisible()
  await expect(page.getByText('Simulated local mail')).toBeVisible()
  await page.screenshot({ path: 'e2e/.results/shell.png', fullPage: true })
})

test('keyboard traversal: skip link, mailbox, conversation, reader focus', async ({ page }) => {
  await page.goto(ENTRY)
  await expectMailboxNavReady(page)
  await openMailbox(page, 'Fixture inbox')
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
  await expectMailboxNavReady(page)
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#main')).toBeFocused()
})

test('real keyboard navigation: Tab reaches a conversation row and Enter opens its reader', async ({ page }) => {
  await page.goto(ENTRY)
  await openMailbox(page, 'Fixture inbox')
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
    const trigger = page.getByRole('button', { name: 'Open navigation' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Navigation' })
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
    const trigger = page.getByRole('button', { name: 'Open navigation' })
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: 'Navigation' })
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
    await page.getByRole('button', { name: 'Open navigation' }).click()
    await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Fixture inbox' }).click()
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
    await openMailbox(page, 'Fixture inbox')
    // exact: a substring 'Unread' would also match conversation rows carrying the Unread badge.
    await expect(page.getByRole('link', { name: 'Unread', exact: true })).toBeVisible()
    // Below md the rail copy of the sidebar is display:none, so the active-link measurement must
    // come from the reopened drawer's visible copy — measuring the hidden rail is not evidence of
    // what the viewer sees. The filter pill stays rendered beneath the modal and measures as-is.
    const trigger = page.getByRole('button', { name: 'Open navigation' })
    const drawerPresentation = await trigger.isVisible()
    if (drawerPresentation) {
      await trigger.click()
      await expect(page.getByRole('dialog', { name: 'Navigation' })).toBeVisible()
    }
    // Transition settling: a background-color mid-transition reports its interpolated value
    // (serialized as oklab in Chromium), so every FINITE animation/transition is deliberately
    // awaited to completion (infinite ones, e.g. the skeleton pulse, never end and are skipped);
    // a bounded deadline prevents a hang, and two frames then flush the settled computed styles.
    await page.evaluate(async () => {
      // The rejecting deadline RACES the pending waits, so a finite animation that outlives it
      // fails the test rather than letting an unsettled color be measured; the timer is cleaned
      // up either way. A cancelled animation resolves its wait deliberately (`finished.catch`):
      // cancellation also ends interpolation, so its computed value is settled.
      const deadlineMs = 5000
      let timer: ReturnType<typeof setTimeout> | undefined
      const expiry = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`finite animations still running after ${deadlineMs}ms; refusing to measure unsettled colors`)), deadlineMs)
      })
      try {
        for (;;) {
          const pending = document.getAnimations().filter((a) => {
            const timing = a.effect?.getComputedTiming()
            return timing !== undefined && timing.endTime !== Infinity && a.playState === 'running'
          })
          if (pending.length === 0) break
          await Promise.race([Promise.all(pending.map((a) => a.finished.catch(() => {}))), expiry])
        }
      } finally {
        clearTimeout(timer)
      }
      await new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())))
    })
    const measured = await page.evaluate(() => {
      // Fail-closed color handling. Computed values arrive as rgb()/rgba() (0–255), color(srgb …)
      // (0–1 floats, from color-mix results — dividing those by 255 once read a pale cream as
      // near-black), or other spaces such as oklab(…) (transition interpolation, seen in the r5
      // reduced-motion run). The first two parse directly at full precision; everything else is
      // converted by actually painting it into an explicit-sRGB canvas pixel. Alpha < 1 throws.
      // Bounded, non-recursive fallback: validate the value via the two-sentinel fillStyle check
      // (an invalid assignment keeps the prior fillStyle), then DRAW it into an explicit-sRGB
      // 1x1 canvas and read the composited pixel with getImageData — a real sRGB pixel
      // conversion, independent of whatever string the browser would serialize. A non-opaque
      // pixel (alpha < 255) is rejected rather than composited against an assumed backdrop.
      const pixelChannels = (raw: string): [number, number, number] => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true })
        if (!ctx) throw new Error('no 2d canvas context for color conversion')
        ctx.fillStyle = '#010203'
        ctx.fillStyle = raw
        const first = String(ctx.fillStyle)
        ctx.fillStyle = '#fefdfc'
        ctx.fillStyle = raw
        if (first !== String(ctx.fillStyle)) throw new Error(`Unsupported color value: ${raw}`)
        ctx.clearRect(0, 0, 1, 1)
        ctx.fillRect(0, 0, 1, 1)
        const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1, { colorSpace: 'srgb' }).data
        if (a !== 255) throw new Error(`Non-opaque color: ${raw}`)
        return [r! / 255, g! / 255, b! / 255]
      }
      const channels = (raw: string): [number, number, number] => {
        let m = raw.match(/^rgba?\((\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)[,\s]+(\d+(?:\.\d+)?)(?:[,\s/]+([\d.]+%?))?\)$/)
        if (m) {
          if (m[4] !== undefined && m[4] !== '1' && m[4] !== '100%') throw new Error(`Non-opaque color: ${raw}`)
          return [Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255]
        }
        m = raw.match(/^color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?:\s*\/\s*([\d.]+%?))?\)$/)
        if (m) {
          if (m[4] !== undefined && m[4] !== '1' && m[4] !== '100%') throw new Error(`Non-opaque color: ${raw}`)
          return [Number(m[1]), Number(m[2]), Number(m[3])]
        }
        return pixelChannels(raw) // single bounded step; no serialization re-parse, no recursion
      }
      const luminance = (raw: string): number => {
        const [r, g, b] = channels(raw).map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [
          number, number, number,
        ]
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      // Representative parser regressions, returned for Node-side assertion: both direct
      // serializations agree on identical colors, color(srgb …) creams are light, the exact
      // oklab(…) value that failed the r5 reduced-motion run normalizes to a near-white, and
      // garbage still fails closed.
      let unknownThrew = false
      try { luminance('definitely-not-a-color') } catch { unknownThrew = true }
      const parser = {
        white: luminance('rgb(255, 255, 255)'),
        cream: luminance('color(srgb 0.957 0.91 0.788)'),
        redDelta: Math.abs(luminance('rgb(255, 0, 0)') - luminance('color(srgb 1 0 0)')),
        oklabLight: luminance('oklab(0.967428 0.000417888 -0.00125271)'),
        oklabWhiteDelta: Math.abs(luminance('oklab(1 0 0)') - luminance('rgb(255, 255, 255)')),
        unknownThrew,
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
      // Raw computed serializations per surface: the evidence record of what the browser actually
      // reported, so a ratio can be audited against the real pixels instead of trusted blindly.
      const raws: Record<string, string> = {}
      const measure = (key: string, fg: string, bg: string) => {
        raws[key] = `${fg} on ${bg}`
        results[key] = contrast(fg, bg)
      }
      // Active sidebar item: accent text over the accent-soft tint, measured only on a RENDERED
      // copy (the drawer's below md, the rail's otherwise) — a display:none rail copy has no
      // client rects and is skipped, so a missing visible copy fails the must-measure check below.
      const active = Array.from(
        document.querySelectorAll('nav[aria-label="Mailboxes"] a[aria-current="page"]'),
      ).find((el) => el.getClientRects().length > 0)
      if (active) measure('sidebar-active', getComputedStyle(active).color, surfaceBehind(active))
      // Active filter pill in the content area.
      const pill = document.querySelector('nav[aria-label="Filter"] a[aria-current="page"]')
      if (pill) measure('filter-active', getComputedStyle(pill).color, surfaceBehind(pill))
      // Focus indicator color against the panel surface.
      const probe = document.createElement('span')
      probe.style.color = 'var(--accent-text)'
      probe.style.backgroundColor = 'var(--surface)'
      document.body.append(probe)
      measure('accent-on-surface', getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor)
      probe.style.backgroundColor = 'var(--surface-2)'
      measure('accent-on-surface-2', getComputedStyle(probe).color, getComputedStyle(probe).backgroundColor)
      probe.remove()
      return { ratios: results, raws, parser }
    })
    if (drawerPresentation) {
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog', { name: 'Navigation' })).not.toBeVisible()
    }
    const { ratios, raws, parser } = measured
    // Parser regressions: both serializations agree, color(srgb …) creams read as light, unknown
    // formats fail closed. These guard the oracle itself before any ratio is trusted.
    expect(parser.white, 'rgb white luminance').toBeCloseTo(1, 5)
    expect(parser.cream, 'color(srgb) cream must read light, not near-black').toBeGreaterThan(0.7)
    expect(parser.redDelta, 'rgb vs color(srgb) must agree').toBeLessThan(1e-9)
    expect(parser.oklabLight, 'r5 oklab near-white must normalize light, not near-black').toBeGreaterThan(0.7)
    expect(parser.oklabWhiteDelta, 'oklab white must normalize to sRGB white').toBeLessThan(0.02)
    expect(parser.unknownThrew, 'unknown serialization must throw').toBe(true)
    // Actual computed values travel into the run record for parent audit against the screenshot.
    test.info().annotations.push({ type: `computed-colors-${theme}`, description: JSON.stringify(raws) })
    // Every measured surface must actually be present: a missing active-sidebar or active-filter
    // selector is a failure, not a silent skip of that contrast measurement.
    for (const key of ['sidebar-active', 'filter-active', 'accent-on-surface', 'accent-on-surface-2']) {
      expect(Object.keys(ratios), `surface not found/measured: ${key}`).toContain(key)
    }
    for (const [surface, ratio] of Object.entries(ratios)) {
      expect(ratio, `${theme} ${surface} measured ${ratio.toFixed(2)}:1 (${raws[surface]})`).toBeGreaterThanOrEqual(4.5)
    }
    await page.screenshot({ path: `e2e/.results/contrast-${theme}.png`, fullPage: true })
  })
}

// Closes the recorded coverage gap: configuring the reduced-motion project proved nothing about
// behavior. This asserts the REAL computed animation state from the bundle CSS in every project:
// under reduce, index.css collapses all animation/transition durations to 0.01ms so nothing can
// visibly move; without it, the pulse animation must genuinely run. Fail-closed on both branches.
test('animations respect the reduced-motion preference (FE-R16)', async ({ page }) => {
  await page.goto(ENTRY)
  await expect(page.getByText('Simulated local mail')).toBeVisible()
  const probe = await page.evaluate(() => {
    const pulse = document.createElement('div')
    pulse.className = 'animate-pulse' // the skeleton animation class actually shipped in the bundle
    document.body.append(pulse)
    const pulseStyle = getComputedStyle(pulse)
    const transitioned = document.querySelector('.transition') // e.g. the drawer trigger button
    const result = {
      reduce: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      animationName: pulseStyle.animationName,
      animationDuration: pulseStyle.animationDuration.split(',')[0]!.trim(),
      transitionDuration: transitioned ? getComputedStyle(transitioned).transitionDuration.split(',')[0]!.trim() : null,
    }
    pulse.remove()
    return result
  })
  const seconds = (v: string): number => (v.endsWith('ms') ? parseFloat(v) / 1000 : parseFloat(v))
  expect(probe.animationName, 'pulse animation must exist in the bundle CSS').not.toBe('none')
  expect(probe.transitionDuration, 'a transitioned element must be present to measure').not.toBeNull()
  if (probe.reduce) {
    // 0.01ms (sub-millisecond) means no perceivable motion; a vacuous pass is impossible because
    // the same properties are asserted to be genuinely animated when the preference is absent.
    expect(seconds(probe.animationDuration), `animation-duration ${probe.animationDuration}`).toBeLessThanOrEqual(0.001)
    expect(seconds(probe.transitionDuration!), `transition-duration ${probe.transitionDuration}`).toBeLessThanOrEqual(0.001)
  } else {
    expect(seconds(probe.animationDuration), `animation-duration ${probe.animationDuration}`).toBeGreaterThanOrEqual(1)
    expect(seconds(probe.transitionDuration!), `transition-duration ${probe.transitionDuration}`).toBeGreaterThanOrEqual(0.1)
  }
})

test('no request leaves for remote hosts while reading hostile content', async ({ page }) => {
  const external: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.hostname !== '127.0.0.1') external.push(request.url())
  })
  await page.goto(ENTRY)
  await openMailbox(page, 'Fixture inbox')
  await page.locator('a[data-thread]').first().click()
  await expect(page.getByText('alert(1)', { exact: false })).toBeVisible()
  expect(external).toEqual([])
})

// FC web-quality: People, workspace members and Personal Details render the fixture entry's simulated
// V2 ports (src/dev/simulatedPeople.ts) instead of their error states, at desktop and phone width.
for (const width of [1440, 390]) {
  test(`People, workspace members and Personal Details show simulated data at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`${ENTRY}#/people`)
    await expect(page.getByText('Unbound roster verified with the organization gateway.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Current organization grants' })).toBeVisible()
    await expect(page.getByText('Current grants could not be loaded')).toHaveCount(0)
    await page.goto(`${ENTRY}#/settings/workspace/members`)
    await expect(page.getByRole('heading', { name: 'Current organization grants' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save role' }).first()).toBeVisible()
    await page.goto(`${ENTRY}#/settings/profile/personal-details`)
    await expect(page.getByLabel('Display name')).toBeVisible()
    await expect(page.getByText('Personal settings could not be loaded')).toHaveCount(0)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
}

// Failure path: `?production-settings` drops the simulated ports, so the pages keep their honest
// error state rather than inventing data.
test('without simulated ports Personal Details shows its error state, not invented data', async ({ page }) => {
  await page.goto(`${ENTRY}?production-settings#/settings/profile/personal-details`)
  await expect(page.getByText('Personal settings could not be loaded')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})
