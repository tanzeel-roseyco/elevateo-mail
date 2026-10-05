import { z } from 'zod'
import { ApiError, idSchema, jsonBody } from './core'
import { authorizeAiTool, untrustedMailContext } from './policies/ai'
import { SendLedger } from './ledger'

// AIDEV-NOTE: Selected context requires independent read/draft permission; this endpoint grants no shell/FS tools.
export async function aiRoute(request: Request, path: string, owner: string, db: D1Database, now: number): Promise<Response | null> {
  if (request.method !== 'POST' || !['/v1/ai/context', '/v1/ai/drafts'].includes(path)) return null
  const input = z.object({ mailboxId: idSchema, messageIds: z.array(idSchema).min(1).max(20).optional(),
    draft: z.unknown().optional() }).strict().parse(await jsonBody(request))
  const tool = path === '/v1/ai/context' ? 'read' : 'draft'
  const mailbox = await db.prepare('SELECT ai_read,ai_draft FROM mailboxes WHERE owner=? AND id=? AND connected=1')
    .bind(owner, input.mailboxId).first<{ ai_read: number; ai_draft: number }>()
  if (!mailbox || (tool === 'read' ? mailbox.ai_read : mailbox.ai_draft) !== 1) throw new ApiError('ai_scope_denied', 403)
  authorizeAiTool({ ownerId: owner, mailboxIds: [input.mailboxId], tools: [tool], expiresAt: now + 60000 }, owner, input.mailboxId, tool, now)
  if (tool === 'draft') {
    if (!input.draft || typeof input.draft !== 'object' || Array.isArray(input.draft)) throw new ApiError('draft_required')
    const raw = input.draft as Record<string, unknown>
    if (raw.mailboxId !== input.mailboxId || raw.kind !== 'ai') throw new ApiError('ai_scope_denied', 403)
    return Response.json({ ...await new SendLedger(db).create(owner, raw, now), simulated: true }, { status: 201 })
  }
  if (!input.messageIds || input.draft !== undefined) throw new ApiError('message_ids_required')
  const rows = await db.prepare(`SELECT id,subject,body FROM messages WHERE owner=? AND mailbox_id=?
    AND id IN (${input.messageIds.map(() => '?').join(',')}) ORDER BY id`)
    .bind(owner, input.mailboxId, ...input.messageIds).all<{ id: string; subject: string; body: string }>()
  // Bound aggregate context too; twenty individually-valid bodies must not create a 2 MB CLI payload.
  const context = untrustedMailContext(JSON.stringify(rows.results))
  return Response.json({ mailboxId: input.mailboxId, context, tools: mailbox.ai_draft === 1 ? ['read', 'draft'] : ['read'], simulated: true })
}
