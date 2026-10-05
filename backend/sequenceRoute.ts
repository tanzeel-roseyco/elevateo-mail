import { z } from 'zod'
import { ApiError, idSchema, jsonBody } from './core'
import { sequenceActivationAvailable } from './resendReplyRoute'
import { createSequence, sequenceView } from './sequences'

// AIDEV-NOTE: Availability is deployment-level; each approval/dispatch separately proves its immutable channel.
export async function sequenceRoute(request: Request, path: string, owner: string, db: D1Database,
  now: number, origin?: string, replyEnv?: unknown): Promise<Response | null> {
  const match = /^\/v1\/campaigns\/([a-zA-Z0-9_-]+)\/sequences(?:\/([a-zA-Z0-9_-]+)\/cancel)?$/u.exec(path)
  if (!match) return null
  const availability = { liveActivationAvailable: sequenceActivationAvailable(replyEnv, owner) }
  const campaignId = idSchema.parse(match[1]), sequenceId = match[2] ? idSchema.parse(match[2]) : null
  const params = new URL(request.url).searchParams
  if (request.method === 'POST') {
    if (params.size) throw new ApiError('validation_failed')
    const input = await jsonBody(request)
    if (!sequenceId) return Response.json({ sequence: await createSequence(db, owner, campaignId, input, now, origin, replyEnv),
      ...availability }, { status: 201 })
    z.object({}).strict().parse(input)
    const row = await db.prepare('SELECT * FROM campaign_sequences WHERE owner=? AND campaign_id=? AND id=?')
      .bind(owner, campaignId, sequenceId).first<{ id: string; mailbox_id: string; recipient: string; request_hash: string }>()
    if (!row) throw new ApiError('sequence_not_found', 404)
    await db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=? WHERE owner=? AND status IN ('draft','pending')
      AND id IN (SELECT intent_id FROM sequence_steps WHERE owner=? AND sequence_id=?)`)
      .bind(now, owner, owner, sequenceId).run()
    return Response.json({ sequence: await sequenceView(db, owner, row), ...availability })
  }
  if (request.method !== 'GET' || sequenceId) return null
  if (new Set(params.keys()).size !== [...params.keys()].length) throw new ApiError('validation_failed')
  const query = z.object({ after: idSchema.optional(), limit: z.coerce.number().int().min(1).max(25).default(10) })
    .strict().parse(Object.fromEntries(params))
  const rows = await db.prepare(`SELECT * FROM campaign_sequences WHERE owner=? AND campaign_id=? AND id>?
    ORDER BY id LIMIT ?`).bind(owner, campaignId, query.after ?? '', query.limit + 1)
    .all<{ id: string; mailbox_id: string; recipient: string; request_hash: string }>()
  const page = rows.results.slice(0, query.limit)
  const items = await Promise.all(page.map(row => sequenceView(db, owner, row)))
  return Response.json({ items, next: rows.results.length > query.limit ? page.at(-1)!.id : null, ...availability })
}
