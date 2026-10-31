# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: sso.spec.ts >> single sign-on and password entries: gold primary button, separator, form; SSO starts a top-level navigation
- Location: e2e/sso.spec.ts:12:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: "rgb(169, 133, 58)"
Received: "rgb(166, 124, 0)"
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - main [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: Elevateo Co.
      - heading "Sign in" [level=1] [ref=e10]
      - status [ref=e12]:
        - generic [ref=e16]: Your session ended. Sign in again to continue.
      - button "Continue with single sign-on" [active] [ref=e18]
      - separator "or" [ref=e21]
      - generic [ref=e24]:
        - generic [ref=e25]:
          - generic [ref=e26]: Email address
          - textbox "Email address" [ref=e28]
        - generic [ref=e29]:
          - generic [ref=e30]:
            - generic [ref=e31]: Password
            - button "Forgot your password?" [ref=e32]
          - textbox "Password" [ref=e33]
        - button "Sign in" [ref=e34]
      - paragraph [ref=e35]: Sign in securely to this Elevateo Mail installation.
  - note: Development fixtures — synthetic data only. Nothing is sent, received or saved.
```

# Test source

```ts
  1  | // App-level SSO entry against the labelled fixture entry (launch sprint). Scripts the status
  2  | // variants through the hash (#/fixtures?getSsoStatus=…), the callback failure through the real
  3  | // search string (?sso_error=…) and intercepts the full-page start navigation with a stub page so
  4  | // no identity provider is contacted. Screenshots land in e2e/.results for the 1440/390 review.
  5  | import { expect, test } from '@playwright/test'
  6  |
  7  | const ENTRY = '/dev-fixtures.html'
  8  | const signedOut = (search = '', extra = '') => `${ENTRY}${search}#/fixtures?getSession=unauthenticated${extra}`
  9  | const shot = (name: string, project: string) => `e2e/.results/${name}-${project}.png`
  10 | const STUB = '<!doctype html><title>IdP stub</title><main><h1>IdP stub reached</h1></main>'
  11 |
  12 | test('single sign-on and password entries: gold primary button, separator, form; SSO starts a top-level navigation', async ({ page }, testInfo) => {
  13 |   await page.route('**/v1/auth/sso/start', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: STUB }))
  14 |   await page.goto(signedOut())
  15 |   const sso = page.getByRole('button', { name: 'Continue with single sign-on' })
  16 |   await expect(sso).toBeVisible()
  17 |   await expect(page.getByRole('heading', { name: 'Sign in' })).toBeFocused()
  18 |   await expect(page.getByRole('separator', { name: 'or' })).toBeVisible()
  19 |   await expect(page.getByLabel('Password')).toBeVisible()
  20 |   await page.screenshot({ path: shot('sso-and-password', testInfo.project.name), fullPage: true })
  21 |   // Keyboard: Tab from the focused heading reaches the SSO button first, with a visible ring.
  22 |   await page.keyboard.press('Tab')
  23 |   await expect(sso).toBeFocused()
  24 |   // Visible focus: the global :focus-visible rule draws a 2px solid gold-600 outline (#a9853a,
  25 |   // light scheme). Checking style != 'none' alone would pass a transparent or zero-width ring, so
  26 |   // the computed width and colour are asserted, with the blurred (unfocused) heading as the control.
  27 |   const ringOf = (el: Element) => {
  28 |     const style = getComputedStyle(el)
  29 |     return { style: style.outlineStyle, width: parseFloat(style.outlineWidth), color: style.outlineColor }
  30 |   }
  31 |   const ring = await sso.evaluate(ringOf)
  32 |   expect(ring.style).toBe('solid')
  33 |   expect(ring.width).toBeGreaterThanOrEqual(2)
> 34 |   expect(ring.color).toBe('rgb(169, 133, 58)')
     |                      ^ Error: expect(received).toBe(expected) // Object.is equality
  35 |   // Negative control: the element that lost focus must not carry the ring any more.
  36 |   const blurred = await page.getByRole('heading', { name: 'Sign in' }).evaluate(ringOf)
  37 |   expect(blurred.width === 0 || blurred.style === 'none').toBe(true)
  38 |   await page.screenshot({ path: shot('sso-focus', testInfo.project.name), fullPage: true })
  39 |   const navigated = page.waitForURL('**/v1/auth/sso/start')
  40 |   await page.keyboard.press('Enter')
  41 |   await navigated
  42 |   await expect(page.getByRole('heading', { name: 'IdP stub reached' })).toBeVisible()
  43 |   // Same-origin stub, so storage of the app origin is still readable here.
  44 |   const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))
  45 |   expect(stored).toEqual({ local: 0, session: 0 })
  46 | })
  47 |
  48 | test('single sign-on only: no password fields, explanatory line', async ({ page }, testInfo) => {
  49 |   await page.goto(signedOut('', '&getSsoStatus=sso_only'))
  50 |   await expect(page.getByRole('button', { name: 'Continue with single sign-on' })).toBeVisible()
  51 |   await expect(page.getByText("Use your organization's single sign-on account to continue.")).toBeVisible()
  52 |   await expect(page.getByLabel('Password')).toHaveCount(0)
  53 |   await page.screenshot({ path: shot('sso-only', testInfo.project.name), fullPage: true })
  54 | })
  55 |
  56 | // AIDEV-NOTE: The "Redirecting to sign-in…" locked state is not asserted here: while the top-level
  57 | // navigation started by location.assign is pending, Playwright's locators, evaluate and screenshot
  58 | // stall until it commits (a stubbed 204 never does; the 200 stub above commits and leaves the page).
  59 | // SignInPage.sso.test.tsx covers the locked state and its release.
  60 | test('callback failure: generic alert, parameter removed from the address bar', async ({ page }, testInfo) => {
  61 |   await page.goto(signedOut('?sso_error=access_denied'))
  62 |   const alert = page.getByRole('alert')
  63 |   await expect(alert).toContainText('Single sign-on was not completed')
  64 |   await expect.poll(() => page.evaluate(() => window.location.search)).toBe('')
  65 |   await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/fixtures?getSession=unauthenticated')
  66 |   await page.screenshot({ path: shot('sso-landing-error', testInfo.project.name), fullPage: true })
  67 | })
  68 |
  69 | test('status failure fails closed with a retry card', async ({ page }, testInfo) => {
  70 |   await page.goto(signedOut('', '&getSsoStatus=temporarily_unavailable'))
  71 |   await expect(page.getByRole('alert')).toContainText('Sign-in options could not be loaded')
  72 |   await expect(page.getByLabel('Password')).toHaveCount(0)
  73 |   await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  74 |   await page.screenshot({ path: shot('sso-status-error', testInfo.project.name), fullPage: true })
  75 | })
  76 |
  77 | test('no entry enabled shows the empty state', async ({ page }, testInfo) => {
  78 |   await page.goto(signedOut('', '&getSsoStatus=sso_none'))
  79 |   await expect(page.getByRole('heading', { name: 'Sign-in is not available' })).toBeVisible()
  80 |   await expect(page.getByRole('button', { name: 'Check again' })).toBeVisible()
  81 |   await page.screenshot({ path: shot('sso-none', testInfo.project.name), fullPage: true })
  82 | })
  83 |
```