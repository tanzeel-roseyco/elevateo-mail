import { z } from 'zod'
import type { HttpClient } from './httpClient'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
export const historicalImport = z.object({ messages: z.array(z.object({ id, threadId: id,
  sender: z.email().max(254), subject: z.string().max(998), body: z.string().max(100_000),
  at: z.number().int().nonnegative().max(8_640_000_000_000_000) }).strict()).min(1).max(25) }).strict()
export type HistoricalImport = z.infer<typeof historicalImport>
export function parseHistoricalImport(text: string): HistoricalImport {
  if (new TextEncoder().encode(text).length > 131_072) throw new Error('Choose a JSON file no larger than 128 KiB.')
  const parsed = historicalImport.safeParse(JSON.parse(text) as unknown)
  if (!parsed.success) throw new Error('Expected 1–25 messages with id, threadId, sender, subject, body and at (milliseconds).')
  if (new Set(parsed.data.messages.map(row => row.id)).size !== parsed.data.messages.length) throw new Error('Each import ID must be unique.')
  return parsed.data
}
// AIDEV-NOTE: Revalidate serialized bytes before transport; the shared client binds every request to the current account.
export function createImportGateway(http: HttpClient) {
  return { import(mailboxId: string, value: HistoricalImport) {
    const payload = parseHistoricalImport(JSON.stringify(value))
    return http.request('POST', `/v1/mailboxes/${id.parse(mailboxId)}/import`, z.object({
      processed: z.number().int().min(1).max(25), imported: z.number().int().min(0).max(25),
      unchanged: z.number().int().min(0).max(25) }).strict(), payload)
  } }
}
