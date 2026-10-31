import { expect, test } from '@playwright/test'

// AIDEV-NOTE: Synthetic responses exercise the production gateway and sign-out UI; no backend is contacted.
const session = {
  context_id: 'context_pwa_0123456789', authorization_version: 'authz_pwa_0123456789',
  actor: { id: '00000000-0000-4000-8000-0000000000a1', display_name: 'PWA test user' },
  organization: { id: '00000000-0000-4000-8000-0000000000b1', name: 'PWA test organization' },
  simulation_mode: true, csrf_token: 'pwa_test_token_0123456789',
}
for (const logoutFails of [false, true]) {
  test(`sign-out clears records and hides every window; network failure=${logoutFails}`, async ({ page, context }) => {
    let signedOut = false
    let logoutCalls = 0
    await context.route('**/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
      if (path === '/v1/auth/logout') {
        logoutCalls++
        if (logoutFails) return route.abort('failed')
        signedOut = true
        return json({ local_revoked: true, upstream_status: 'complete' })
      }
      if (path === '/v1/session' && !signedOut) return json(session)
      if (path === '/v1/auth/sso/status') return json({ enabled: false, provider: null, password_login_enabled: true })
      if (path === '/v1/mailboxes') return json({ context_id: session.context_id, authorization_version: session.authorization_version, items: [], next_cursor: null })
      return json({ code: 'unauthenticated', message: 'Sign in to continue.', request_id: 'pwa-test-request' }, 401)
    })
    await page.goto('/')
    const second = await context.newPage()
    await second.goto('/')
    for (const tab of [page, second]) {
      await expect(tab.getByRole('button', { name: 'Account and sign-out' })).toBeVisible()
      await tab.evaluate(() => {
        localStorage.setItem('elevateo.settings.account', 'private')
        sessionStorage.setItem('elevateo.approval-recovery.v1', 'private-binding')
      })
    }
    await page.getByRole('button', { name: 'Account and sign-out' }).click()
    await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click()
    await expect(second.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Account and sign-out' })).toHaveCount(0)
    for (const tab of [page, second]) {
      expect(await tab.evaluate(() => localStorage.getItem('elevateo.settings.account'))).toBeNull()
      expect(await tab.evaluate(() => sessionStorage.getItem('elevateo.approval-recovery.v1'))).toBeNull()
    }
    expect(logoutCalls).toBe(1)
    if (logoutFails) {
      await page.waitForTimeout(1000)
      expect(logoutCalls).toBe(1)
    }
  })
}
