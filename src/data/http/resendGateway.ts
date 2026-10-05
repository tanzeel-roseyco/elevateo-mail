import { z } from 'zod'
import type { HttpClient } from './httpClient'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
const key = z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u)
const metadata = z.object({ id, revision, revoked: z.union([z.literal(0), z.literal(1)]) }).strict()
export type ResendConnectionMetadata = z.infer<typeof metadata>
// AIDEV-NOTE: Strict metadata responses reject leaked keys; secrets go only into authenticated mutation bodies.
export function createResendGateway(http: HttpClient) {
  const path = (value: string) => `/v1/resend/connections/${id.parse(value)}`
  return {
    status: () => http.request('GET', '/v1/resend/status', z.object({ enabled: z.boolean() }).strict()),
    list: () => http.request('GET', '/v1/resend/connections', z.object({ connections: z.array(metadata).max(10) }).strict()),
    create: (apiKey: string) => http.request('POST', '/v1/resend/connections', metadata, { apiKey: key.parse(apiKey) }),
    replace: (value: string, version: number, apiKey: string) => http.request('POST', `${path(value)}/replace`, metadata,
      { revision: revision.parse(version), apiKey: key.parse(apiKey) }),
    revoke: (value: string, version: number) => http.request('POST', `${path(value)}/revoke`, metadata, { revision: revision.parse(version) }),
    admit: (value: string, address: string, domainId: string) => http.request('POST', `${path(value)}/sender`,
      z.object({ id, address: z.string().email().max(254) }).strict(),
      { address: z.string().trim().toLowerCase().pipe(z.string().email().max(254)).parse(address), domainId: id.parse(domainId) }),
  }
}
