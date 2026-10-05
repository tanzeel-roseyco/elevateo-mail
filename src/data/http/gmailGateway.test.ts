import { expect, it, vi } from 'vitest'
import { createHttpClient } from './httpClient'
import { createGmailGateway, googleAuthorizationUrl } from './gmailGateway'

it('only allows the fixed Google authorization page', () => {
  expect(googleAuthorizationUrl.safeParse('https://accounts.google.com/o/oauth2/v2/auth?state=abc').success).toBe(true)
  for (const url of ['https://evil.example/o/oauth2/v2/auth', 'https://accounts.google.com.evil.example/o/oauth2/v2/auth',
    'https://accounts.google.com/wrong', 'https://user@accounts.google.com/o/oauth2/v2/auth', 'http://accounts.google.com/o/oauth2/v2/auth']) {
    expect(googleAuthorizationUrl.safeParse(url).success).toBe(false)
  }
})
it('uses authenticated bounded Gmail routes and rejects malformed status', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ enabled: false }))
    .mockResolvedValueOnce(Response.json({ status: 'progress', imported: 2, deleted: 0 }))
    .mockResolvedValueOnce(Response.json({ enabled: 'true' }))
  const gateway = createGmailGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  expect(await gateway.status()).toEqual({ enabled: false })
  expect(await gateway.sync('mailbox')).toEqual({ status: 'progress', imported: 2, deleted: 0 })
  expect(transport.mock.calls[1]?.[0]).toBe('/v1/mailboxes/mailbox/sync')
  expect(transport.mock.calls[1]?.[1]?.body).toBe('{}')
  await expect(gateway.status()).rejects.toThrow()
})
it('keeps Google scope elevation separate from a mailbox permission change', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({
    authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc', expiresAt: 1234,
  })).mockResolvedValueOnce(Response.json({ enabled: true }))
  const gateway = createGmailGateway(createHttpClient({ baseUrl: '', fetch: transport }))
  await gateway.beginSending('connection')
  await gateway.setSending('mail', true)
  expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({ reconnectId: 'connection', purpose: 'send' })
  expect(transport.mock.calls[1]?.[0]).toBe('/v1/mailboxes/mail/gmail-sending')
  expect(JSON.parse(String(transport.mock.calls[1]?.[1]?.body))).toEqual({ enabled: true })
  expect(() => gateway.sendingStatus('../foreign')).toThrow()
})
