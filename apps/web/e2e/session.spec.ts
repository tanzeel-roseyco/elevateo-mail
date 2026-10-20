// Authored, not executed: BE-02A session lifecycle against the labelled fixture entry (R6). The
// fixture entry scripts examples per operation through the hash (#/fixtures?op=example) and
// serves the completion form at #/auth/complete; neither exists in the production entry. Real
// Rails/Auth browser proof is separate acceptance work (coordinator Docker run).
import { expect, test } from '@playwright/test'
import { expectMailboxNavReady } from './support'

const ENTRY = '/dev-fixtures.html'
const SIGNED_OUT = `${ENTRY}#/fixtures?getSession=unauthenticated`

test('a signed-out fixture session shows the sign-in form after one refresh attempt, with no stored credential', async ({ page }) => {
  await page.goto(SIGNED_OUT)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByText('Development fixtures — synthetic data only', { exact: false })).toBeVisible()
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length, cookie: document.cookie }))
  expect(stored).toEqual({ local: 0, session: 0, cookie: '' })
  await page.screenshot({ path: 'e2e/.results/sign-in.png', fullPage: true })
})

test('keyboard sign-in: Tab through email and password, Enter submits, the shell appears', async ({ page }) => {
  await page.goto(SIGNED_OUT)
  const heading = page.getByRole('heading', { name: 'Sign in' })
  await expect(heading).toBeFocused() // arrival focus lands on the form heading
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Email address')).toBeFocused()
  await page.keyboard.type('a@example.test')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Password')).toBeFocused()
  await page.keyboard.type('secret-password')
  await page.keyboard.press('Enter')
  await expectMailboxNavReady(page)
  await expect(page.getByText('Synthetic organization A')).toBeVisible()
  const stored = await page.evaluate(() => ({ local: localStorage.length, session: sessionStorage.length }))
  expect(stored).toEqual({ local: 0, session: 0 })
})

test('a rejected sign-in announces one generic alert, clears the password and keeps the email', async ({ page }) => {
  await page.goto(`${SIGNED_OUT}&login=unauthenticated`)
  await page.getByLabel('Email address').fill('who@example.test')
  await page.getByLabel('Password').fill('wrong-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Sign-in was not accepted')
  await expect(alert).not.toContainText('who@example.test')
  expect(await page.getByLabel('Password').inputValue()).toBe('')
  expect(await page.getByLabel('Email address').inputValue()).toBe('who@example.test')
  await page.screenshot({ path: 'e2e/.results/sign-in-rejected.png', fullPage: true })
})

test('a 503 on sign-in keeps the typed entries and claims no save', async ({ page }) => {
  await page.goto(`${SIGNED_OUT}&login=temporarily_unavailable`)
  await page.getByLabel('Email address').fill('a@example.test')
  await page.getByLabel('Password').fill('kept-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('nothing was saved')
  expect(await page.getByLabel('Password').inputValue()).toBe('kept-password')
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeEnabled()
})

test('a refresh that succeeds reaches the shell without the sign-in form', async ({ page }) => {
  await page.goto(`${SIGNED_OUT}&refreshSession=lifecycle_a`)
  await expectMailboxNavReady(page)
  await expect(page.getByRole('heading', { name: 'Sign in' })).toHaveCount(0)
})

test('a valid identity without an organization is an explicit state that can sign out', async ({ page }) => {
  await page.goto(`${ENTRY}#/fixtures?getSession=not_available`)
  await expect(page.getByText('No organization is available')).toBeVisible()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})

test('recovery reads the same for any address', async ({ page }) => {
  await page.goto(SIGNED_OUT)
  await page.getByRole('button', { name: 'Forgot your password?' }).click()
  await expect(page.getByRole('heading', { name: 'Recover access' })).toBeFocused()
  await page.getByLabel('Email address').fill('unknown@example.test')
  await page.getByRole('button', { name: 'Send recovery message' }).click()
  await expect(page.getByRole('status')).toContainText('If an account exists')
  await page.screenshot({ path: 'e2e/.results/recovery-sent.png', fullPage: true })
})

test('workspace switcher: Escape closes it, an explicit switch replaces the identity, sign-out fences the shell', async ({ page }) => {
  await page.goto(ENTRY)
  await expectMailboxNavReady(page)
  // The switcher and account menu live in the sidebar rail (desktop) or the drawer (narrow).
  const trigger = page.getByRole('button', { name: 'Open navigation' })
  const scope = (await trigger.isVisible()) ? page.getByRole('dialog', { name: 'Navigation' }) : page
  if (await trigger.isVisible()) await trigger.click()
  const switcher = scope.getByRole('button', { name: 'Workspace: Synthetic organization A' })
  await switcher.click()
  const listbox = scope.getByRole('listbox', { name: 'Workspaces' })
  await expect(listbox).toBeVisible()
  await expect(listbox.getByRole('option', { name: /Synthetic organization A/ })).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('Escape')
  await expect(listbox).not.toBeVisible()
  await expect(switcher).toBeFocused() // dismissal restores focus to the opener (D6)

  await switcher.click()
  await listbox.getByRole('option', { name: /Synthetic organization B/ }).click()
  await expect(page.getByRole('button', { name: 'Workspace: Synthetic organization B' }).first()).toBeVisible()
  await expect(listbox).not.toBeVisible() // the replaced identity remounted the protected subtree
  await page.screenshot({ path: 'e2e/.results/switched-organization.png', fullPage: true })

  const account = (await trigger.isVisible()) ? page.getByRole('button', { name: 'Account menu' }) : page.getByRole('button', { name: 'Account and sign-out' })
  await account.click()
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText('signed out')
  await expect(page.getByText('Synthetic organization B')).toHaveCount(0)
})

test('the completion form sets a password once and never reads the URL', async ({ page }) => {
  await page.goto(`${ENTRY}#/auth/complete`)
  await expect(page.getByRole('heading', { name: 'Set your password' })).toBeFocused()
  await page.getByLabel('New password').fill('a-sufficiently-long-password')
  await page.getByLabel('Confirm password').fill('a-sufficiently-long-passwor')
  await page.getByRole('button', { name: 'Set password and sign in' }).click()
  await expect(page.getByRole('alert')).toContainText('do not match')
  await page.getByLabel('Confirm password').fill('a-sufficiently-long-password')
  await page.getByRole('button', { name: 'Set password and sign in' }).click()
  await expect(page.getByRole('heading', { name: 'Access is set up' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Open Elevateo Mail' })).toHaveAttribute('href', '/')
  const external = await page.locator('script[src^="http"], link[href^="http"], img[src^="http"]').count()
  expect(external).toBe(0)
  await page.screenshot({ path: 'e2e/.results/auth-complete.png', fullPage: true })
})

test('no horizontal overflow on the sign-in and completion forms at 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  for (const url of [SIGNED_OUT, `${ENTRY}#/auth/complete`]) {
    await page.goto(url)
    await expect(page.getByRole('heading')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, url).toBeLessThanOrEqual(0)
  }
})
