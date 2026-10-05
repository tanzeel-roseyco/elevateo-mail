import { z } from 'zod'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: Only public credential metadata enters the browser; strict schemas reject accidental token exposure.
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const connection = z.object({ id, provider: id, subject: z.string().min(1).max(256),
  revision: z.number().int().safe().positive(), revoked: z.boolean() }).strict()
const page = z.object({ items: z.array(connection).max(25), next: z.object({ after: id }).strict().nullable() }).strict()
export type ConnectionPage = z.infer<typeof page>
export function createConnectionsGateway(http: HttpClient) {
  return {
    list(after: string | null = null) {
      return http.request('GET', `/v1/connections?limit=25${after ? `&after=${encodeURIComponent(id.parse(after))}` : ''}`, page)
    },
    revoke(value: string) {
      return http.request('POST', `/v1/connections/${id.parse(value)}/revoke`, z.object({ revoked: z.literal(true) }).strict(), {})
    },
  }
}
