import { z } from 'zod'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: Enrichment is optional; no lookup is automatic and a profile never creates consent.
const revision = z.number().int().positive().safe()
const connectionResponse = z.object({ connection: z.object({ revision, revoked: z.union([z.literal(0), z.literal(1)]) }).strict().nullable() }).strict()
const field = z.string().max(512).nullable()
const profileResponse = z.object({ profile: z.object({ fullName: field, title: field, company: field, companyDomain: field, location: field }).strict().nullable(), source: z.literal('hunter') }).strict()
export type HunterProfile = z.infer<typeof profileResponse>['profile']
export type HunterConnection = z.infer<typeof connectionResponse>['connection']
export function createHunterGateway(http: HttpClient) {
  return {
    status: () => http.request('GET', '/v1/hunter/status', z.object({ enabled: z.boolean() }).strict()),
    connection: () => http.request('GET', '/v1/hunter/connection', connectionResponse),
    save: (apiKey: string, current: number | null) => http.request('POST', '/v1/hunter/connection', connectionResponse,
      { apiKey: z.string().trim().min(1).max(8192).regex(/^[\x21-\x7e]+$/u).parse(apiKey), revision: revision.nullable().parse(current) }),
    revoke: (current: number) => http.request('POST', '/v1/hunter/connection/revoke', connectionResponse, { revision: revision.parse(current) }),
    enrich: (email: string) => http.request('POST', '/v1/hunter/enrich', profileResponse,
      { email: z.string().trim().email().max(254).parse(email).toLowerCase(), acknowledgeCreditUse: true }),
  }
}
