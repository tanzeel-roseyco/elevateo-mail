import { z } from 'zod'
import { ApiError } from './core'
import { messageSearchInput, messageSearchPage, summary } from './contracts/v1'

const scanLimit = 1000
type SearchRow = z.infer<typeof summary> & { matched: number }
// AIDEV-NOTE: LIMIT bounds indexed metadata reads before filtering; LIKE in WHERE would permit unbounded scans.
export async function searchRoute(request: Request, path: string, owner: string, env: Env): Promise<Response | null> {
  if (path !== '/v1/messages/search' || request.method !== 'GET') return null
  const params = new URL(request.url).searchParams
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new ApiError('validation_failed')
  const input = messageSearchInput.parse(Object.fromEntries(params))
  if (!await env.DB.prepare('SELECT id FROM mailboxes WHERE owner=? AND id=?').bind(owner, input.mailboxId).first()) {
    throw new ApiError('mailbox_not_found', 404)
  }
  const pattern = `%${input.q.replace(/[\\%_]/gu, '\\$&')}%`
  const values: (string | number)[] = [pattern, pattern, owner, input.mailboxId]
  const cursorFilter = input.before === undefined ? '' : ' AND (at,id)<(?,?)'
  if (input.before !== undefined) values.push(input.before, input.beforeId!)
  const rows = (await env.DB.prepare(`SELECT id,thread_id,mailbox_id,sender,subject,at,
    (subject LIKE ? ESCAPE '\\' OR sender LIKE ? ESCAPE '\\') AS matched
    FROM messages WHERE owner=? AND mailbox_id=?${cursorFilter} ORDER BY at DESC,id DESC LIMIT ${scanLimit}`)
    .bind(...values).all<SearchRow>()).results
  const items: z.infer<typeof summary>[] = []
  let last: SearchRow | undefined
  let processed = 0
  for (const row of rows) {
    last = row; processed++
    if (row.matched) {
      const item = { id: row.id, thread_id: row.thread_id, mailbox_id: row.mailbox_id,
        sender: row.sender, subject: row.subject, at: row.at }
      items.push(item)
      if (items.length === input.limit) break
    }
  }
  // AIDEV-NOTE: Stop at the last processed match so overflow matches remain reachable on the next request.
  const more = processed < rows.length || rows.length === scanLimit
  return Response.json(messageSearchPage.parse({ items, next: more && last ? { before: last.at, beforeId: last.id } : null,
    search: { scope: 'subject_sender', scanned: rows.length, scanLimit }, simulated: true }))
}
