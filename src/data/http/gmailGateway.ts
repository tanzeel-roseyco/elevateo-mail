import { z } from 'zod'
import type { HttpClient } from './httpClient'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const sendingStatus = z.object({ enabled: z.boolean(), authorized: z.boolean(), connectionId: id.nullable(), available: z.boolean() }).strict()
export type GmailSendingStatus = z.infer<typeof sendingStatus>
// AIDEV-NOTE: A server response never authorizes navigation to an arbitrary site.
export const googleAuthorizationUrl = z.string().url().max(16384).refine(value => {
  const url = new URL(value)
  return url.origin === 'https://accounts.google.com' && url.pathname === '/o/oauth2/v2/auth' &&
    !url.username && !url.password && !url.hash
})
export function createGmailGateway(http: HttpClient) {
  return {
    sendingStatus: (mailboxId: string) => http.request('GET', `/v1/mailboxes/${id.parse(mailboxId)}/gmail-sending`, sendingStatus),
    setSending: (mailboxId: string, enabled: boolean) => http.request('POST', `/v1/mailboxes/${id.parse(mailboxId)}/gmail-sending`,
      z.object({ enabled: z.boolean() }).strict(), { enabled: z.boolean().parse(enabled) }),
    beginSending: (connectionId: string) => http.request('POST', '/v1/connections/oauth/begin',
      z.object({ authorizationUrl: googleAuthorizationUrl, expiresAt: z.number().int().safe().positive() }).strict(),
      { reconnectId: id.parse(connectionId), purpose: 'send' }),
    status: () => http.request('GET', '/v1/gmail/status', z.object({ enabled: z.boolean() }).strict()),
    begin: () => http.request('POST', '/v1/connections/oauth/begin', z.object({ authorizationUrl: googleAuthorizationUrl,
      expiresAt: z.number().int().safe().positive() }).strict(), {}),
    complete: (callbackUrl: string) => http.request('POST', '/v1/connections/oauth/complete',
      z.object({ connectionId: id }).strict(), { callbackUrl: z.string().url().max(16384).parse(callbackUrl) }),
    admit: (connectionId: string) => http.request('POST', `/v1/connections/${id.parse(connectionId)}/mailbox`,
      z.object({ id, address: z.string().email().max(320) }).strict(), {}),
    sync: (mailboxId: string) => http.request('POST', `/v1/mailboxes/${id.parse(mailboxId)}/sync`,
      z.object({ status: z.enum(['progress', 'reset', 'caught_up']), imported: z.number().int().safe().nonnegative(),
        deleted: z.number().int().safe().nonnegative() }).strict(), {}),
  }
}
