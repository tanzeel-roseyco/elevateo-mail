import { z } from 'zod'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: Navigation accepts only Google's exact authorization endpoint; cookies stay server-managed.
const authorizationUrl = z.string().url().max(8192).refine(value => {
  const url = new URL(value)
  return url.origin === 'https://accounts.google.com' && url.pathname === '/o/oauth2/v2/auth'
    && !url.username && !url.password && !url.hash
})
export function createAuthGateway(http: HttpClient) {
  return {
    status: () => http.request('GET', '/v1/login/status', z.object({ enabled: z.boolean() }).strict()),
    begin: () => http.request('POST', '/v1/login/begin', z.object({ authorizationUrl,
      expiresAt: z.number().int().safe().positive() }).strict(), {}),
  }
}
export function openGoogleSignIn(url: string) {
  window.location.assign(authorizationUrl.parse(url))
}
