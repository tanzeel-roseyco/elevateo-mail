import { z } from 'zod'
import { messagePage, toMessagePage, type MessageCursor } from './contract'
import type { HttpClient } from './httpClient'

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
const query = z.string().trim().min(3).max(100)
const response = messagePage.extend({ search: z.object({ scope: z.literal('subject_sender'),
  scanned: z.number().int().min(0).max(1000), scanLimit: z.literal(1000) }).strict() })
// AIDEV-NOTE: Search is explicit and bounded; empty results may still have an older scan window to request.
export function createSearchGateway(http: HttpClient) {
  return { async search(mailboxId: string, text: string, cursor: MessageCursor | null) {
    const mailbox = id.parse(mailboxId)
    const params = new URLSearchParams({ mailboxId: mailbox, q: query.parse(text), limit: '25' })
    if (cursor) {
      params.set('before', String(z.number().int().safe().nonnegative().parse(cursor.before)))
      params.set('beforeId', id.parse(cursor.beforeId))
    }
    const result = await http.request('GET', `/v1/messages/search?${params}`, response)
    if (result.items.length > 25 || result.items.some(item => item.mailbox_id !== mailbox)) throw new Error('Invalid search response.')
    return { ...toMessagePage(result), search: result.search }
  } }
}
export type SearchPage = Awaited<ReturnType<ReturnType<typeof createSearchGateway>['search']>>
