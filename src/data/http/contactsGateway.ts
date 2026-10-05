import { z } from 'zod'
import type { HttpClient } from './httpClient'

// AIDEV-NOTE: This gateway owns contact transport; imports never erase suppression or invent consent evidence.
const address = z.string().trim().toLowerCase().pipe(z.email().max(254))
export const contactImport = z.array(z.object({ email: address,
  consentSource: z.string().trim().min(1).max(1024), optedIn: z.boolean() }).strict()).min(1).max(500)
const page = z.object({ items: z.array(z.object({ email: address, consent_source: z.string(),
  opted_in: z.union([z.literal(0), z.literal(1)]), suppression: z.string().nullable() }).strict()).max(100),
  next: address.nullable() }).strict()
export type ContactPage = z.infer<typeof page>
export function createContactsGateway(http: HttpClient) {
  return {
    list(after: string | null = null): Promise<ContactPage> {
      return http.request('GET', `/v1/contacts?limit=25${after ? `&after=${encodeURIComponent(address.parse(after))}` : ''}`, page)
    },
    import(input: unknown) {
      const rows = contactImport.parse(input)
      if (new Set(rows.map(row => row.email)).size !== rows.length) throw new Error('Each email address must appear only once.')
      return http.request('POST', '/v1/contacts/import', z.object({ processed: z.number().int().min(1).max(500) }).strict(), rows)
    },
  }
}
