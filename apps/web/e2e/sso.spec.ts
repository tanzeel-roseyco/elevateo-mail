// App-level SSO entry against the labelled fixture entry (launch sprint). Scripts the status
// variants through the hash (#/fixtures?getSsoStatus=…), the callback failure through the real
// search string (?sso_error=…) and intercepts the full-page start navigation with a stub page so
// no identity provider is contacted. Screenshots land in e2e/.results for the 1440/390 review.
import { expect, test } from '@playwright/test'

const ENTRY = '/dev-fixtures.html'
const signedOut = (search = '', extra = '') => `${ENTRY}${search}#/fixtures?getSession=unauthenticated${extra}`
const shot = (name: string, project: string) => `e2e/.results/${name}-${project}.png`
const STUB = '<!doctype html><title>IdP stub</title><main><h1>IdP stub reached</h1></main>'

test('single sign-on and password entries: gold primary button, separator, form; SSO starts a top-level navigation', async ({ page }, testInfo) => {
  await page.route('**/v1/auth/sso/start', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: STUB }))
  await page.goto(signedOut())
  const sso = page.getByRole('button', { name: 'Continue with single sign-on' })
  await expect(sso).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused()
  await expect(page.getByRole('separator', { name: 'or' })).toBeVisible()
  await expect(page.getByLabel('Password')).toBeVisible()
  await page.screenshot({ path: shot('sso-and-password', testInfo.project.name), fullPage: true })
  // Keyboard: Tab from the focused heading reaches the SSO button first, with a visible ring.
  await page.keyboard.press('Tab')
  await expect(sso).toBeFocused()
  // Visible focus: the global :focus-visible rule draws a 2px solid semantic gold outline (#a67c00,
  // light scheme). Checking style != 'none' alone would pass a transparent or zero-width ring, so
  // the computed width and colour are asserted, with the blurred (unfocused) heading as the control.
  const ringOf = (el: Element) => {
    const style = getComputedStyle(el)
    return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor }
  }
  const ring = await sso.evaluate(ringOf)
  expect(ring.style).toBe('solid')
  expect(ring.width).toBeGreaterThanOrEqual(2)
  expect(ring.color).toBe('rgb(166, 124, 0)')
  // Negative control: the element that lost focus must not carry the ring any more.
  const blurred = await page.getByRole('heading', { name: 'Sign in' }).evaluate(ringOf)
  expect(blurred.width === 0 || blurred.style === 'none').toBe(true)
  await page.screenshot({ path: shot('sso-focus', testInfo.project.name), fullPage: true })
  const navigated = page.waitForURL('**/v1/auth/sso/start')
  await page.keyboard.press('Enter')
  await navigated
  await expect(page.getByRole('heading', { name: 'IdP stub reached' })).toBeVisible()
  // Same-origin stub, so storage of the app origin is still readable here.
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))
  expect(stored).toEqual({ local: 0, session: 0 })
})

test('single sign-on only: no password fields, explanatory line', async ({ page }, testInfo) => {
  await page.goto(signedOut('', '&getSsoStatus=sso_only'))
  await expect(page.getByRole('button', { name: 'Continue with single sign-on' })).toBeVisible()
  await expect(page.getByText("Use your organization's single sign-on account to continue.")).toBeVisible()
  await expect(page.getByLabel('Password')).toHaveCount(0)
  await page.screenshot({ path: shot('sso-only', testInfo.project.name), fullPage: true })
})

// AIDEV-NOTE: The "Redirecting to sign-in…" locked state is not asserted here: while the top-level
// navigation started by location.assign is pending, Playwright's locators, evaluate and screenshot
// stall until it commits (a stubbed 204 never does; the 200 stub above commits and leaves the page).
// SignInPage.sso.test.tsx covers the locked state and its release.
test('callback failure: generic alert, parameter removed from the address bar', async ({ page }, testInfo) => {
  await page.goto(signedOut('?sso_error=access_denied'))
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Single sign-on was not completed')
  await expect.poll(() => page.evaluate(() => window.location.search)).toBe('')
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/fixtures?getSession=unauthenticated')
  await page.screenshot({ path: shot('sso-landing-error', testInfo.project.name), fullPage: true })
})

test('status failure fails closed with a retry card', async ({ page }, testInfo) => {
  await page.goto(signedOut('', '&getSsoStatus=temporarily_unavailable'))
  await expect(page.getByRole('alert')).toContainText('Sign-in options could not be loaded')
  await expect(page.getByLabel('Password')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.screenshot({ path: shot('sso-status-error', testInfo.project.name), fullPage: true })
})

test('no entry enabled shows the empty state', async ({ page }, testInfo) => {
  await page.goto(signedOut('', '&getSsoStatus=sso_none'))
  await expect(page.getByRole('heading', { name: 'Sign-in is not available' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
  await page.screenshot({ path: shot('sso-none', testInfo.project.name), fullPage: true })
})
