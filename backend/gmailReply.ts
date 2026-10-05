import { z } from 'zod'
import { ApiError, idSchema } from './core'
import type { SendInput } from './policies/send'

// AIDEV-NOTE: Conservative RFC msg-id subset excludes whitespace/header injection; unsupported sources remain readable.
const atom = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
const messageId = z.string().max(254).regex(new RegExp(`^<${atom}(?:\\.${atom})*@${atom}(?:\\.${atom})*>$`, 'u'))
export const replyHeadersSchema = z.object({ messageId, references: z.array(messageId).max(20) }).strict()
export const replyEnvelopeSchema = z.object({ sourceId: idSchema, threadId: idSchema,
  inReplyTo: messageId, references: z.array(messageId).min(1).max(21) }).strict()
export function extractReplyHeaders(headers: { name: string; value: string }[]) {
  const ids = headers.filter(item => item.name.toLowerCase() === 'message-id')
  const refs = headers.filter(item => item.name.toLowerCase() === 'references')
  if (ids.length !== 1 || refs.length > 1) return undefined
  const parsed = replyHeadersSchema.safeParse({ messageId: ids[0]!.value.trim(),
    references: refs.length ? refs[0]!.value.trim().split(/\s+/u) : [] })
  return parsed.success ? parsed.data : undefined
}
export async function resolveReply(db: D1Database, owner: string, input: SendInput, provider: string) {
  if (!input.replyToMessageId) return undefined
  if (provider !== 'gmail' || input.kind !== 'manual') throw new ApiError('reply_source_unavailable', 409)
  const row = await db.prepare(`SELECT m.sender,m.subject,m.thread_id,m.gmail_reply FROM messages m
    WHERE m.owner=? AND m.mailbox_id=? AND m.id=? AND m.gmail_epoch IS NOT NULL
    AND NOT EXISTS(SELECT 1 FROM gmail_sync_issues i WHERE i.owner=m.owner AND i.mailbox_id=m.mailbox_id AND i.message_id=m.id)`)
    .bind(owner, input.mailboxId, input.replyToMessageId).first<{ sender: string; subject: string; thread_id: string; gmail_reply: string | null }>()
  let headers: z.infer<typeof replyHeadersSchema>
  try { headers = replyHeadersSchema.parse(JSON.parse(row?.gmail_reply ?? 'null')) }
  catch { throw new ApiError('reply_source_unavailable', 409) }
  if (!row || !row.subject || /[\r\n]/u.test(row.subject)) throw new ApiError('reply_source_unavailable', 409)
  // AIDEV-NOTE: Reject UI drift instead of silently sending to an address/content the human did not review.
  if (input.to.length !== 1 || input.to[0] !== row.sender.toLowerCase() || input.cc.length || input.bcc.length || input.subject !== row.subject) {
    throw new ApiError('reply_identity_changed', 409)
  }
  return replyEnvelopeSchema.parse({ sourceId: input.replyToMessageId, threadId: row.thread_id,
    inReplyTo: headers.messageId, references: [...headers.references, headers.messageId] })
}
