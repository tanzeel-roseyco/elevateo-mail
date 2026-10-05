import { expect, test } from '@playwright/test'
import { reset } from './support'

// AIDEV-NOTE: This proves browser Strict-cookie behavior through the real route, with a Docker-only identity stub.
test('cross-site login callback hands off safely to the same-origin session exchange', async ({ page, context }) => {
  await reset()
  await page.goto('/')
  const origin = new URL(page.url()).origin
  const begun = await page.evaluate(async () => {
    const response = await fetch('/__fixture/login/begin', { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: '{}' })
    return response.ok
  })
  expect(begun).toBe(true)
  const before = (await context.cookies()).map(({ name, httpOnly, secure, sameSite }) => ({ name, httpOnly, secure, sameSite }))
    .find(cookie => cookie.name === '__Host-elevateo_login')
  expect(before).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('__Host-elevateo_login')

  // Capture the history replacement before fetch without retaining authorization codes or any cookie values.
  await page.addInitScript(() => {
    const original = history.replaceState.bind(history)
    history.replaceState = (data: unknown, unused: string, url?: string | URL | null) => {
      original(data, unused, url)
      if (location.pathname === '/login/callback' && !location.search) sessionStorage.setItem('fixture.callback-cleaned', 'yes')
    }
  })
  const callback = `${origin}/login/callback?code=synthetic&state=synthetic`
  await page.goto(`data:text/html,<a href="${callback.replaceAll('&', '&amp;')}">Complete synthetic login</a>`)
  const callbackRequest = page.waitForRequest(request => request.url() === callback)
  const completion = page.waitForRequest(request => new URL(request.url()).pathname === '/v1/login/complete')
  await page.getByRole('link', { name: 'Complete synthetic login' }).click()
  const initial = await callbackRequest
  expect(((await initial.headerValue('cookie')) ?? '').includes('__Host-elevateo_login=')).toBe(false)
  const exchange = await completion
  expect(exchange.method()).toBe('POST')
  expect(await exchange.headerValue('origin')).toBe(origin)
  expect(await exchange.headerValue('sec-fetch-site')).toBe('same-origin')
  expect((await exchange.headerValue('cookie'))?.includes('__Host-elevateo_login=')).toBe(true)
  await expect(page.getByRole('heading', { name: 'Inbox', exact: true })).toBeVisible()
  expect(new URL(page.url()).search).toBe('')
  expect(await page.evaluate(() => sessionStorage.getItem('fixture.callback-cleaned'))).toBe('yes')
  const cookies = (await context.cookies()).map(({ name, httpOnly, secure, sameSite }) => ({ name, httpOnly, secure, sameSite }))
  expect(cookies.some(cookie => cookie.name === '__Host-elevateo_login')).toBe(false)
  const session = cookies.find(cookie => cookie.name === '__Host-elevateo_session')
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict' })
  expect(await page.evaluate(() => document.cookie)).not.toContain('__Host-elevateo_session')
})
