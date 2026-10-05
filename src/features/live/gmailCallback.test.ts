import { expect, it, vi } from 'vitest'
import { captureGmailCallback } from './gmailCallback'

it('removes callback secrets immediately and leaves unrelated locations untouched', () => {
  const history = { replaceState: vi.fn() }
  const href = 'https://app.example/connections/gmail/callback?code=private&state=random'
  expect(captureGmailCallback({ href, pathname: '/connections/gmail/callback', search: '?code=private&state=random' }, history)).toBe(href)
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/connections/gmail/callback')
  history.replaceState.mockClear()
  expect(captureGmailCallback({ href: 'https://app.example/mail', pathname: '/mail', search: '' }, history)).toBeNull()
  expect(history.replaceState).not.toHaveBeenCalled()
})
