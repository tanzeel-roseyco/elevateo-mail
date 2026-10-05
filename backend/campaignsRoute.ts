import { z } from 'zod'
import { ApiError, idSchema, jsonBody, sha256 } from './core'
import { createdIntent } from './contracts/v1'
import { SendLedger } from './ledger'
import { mailboxReplyChannel } from './resendReplyRoute'

// AIDEV-NOTE: Campaign preparation creates immutable drafts only; ledger approval/dispatch own every send policy.
export async function campaignsRoute(request: Request, path: string, owner: string, db: D1Database, now: number, unsubscribeOrigin?: string, replyEnv?: unknown): Promise<Response | null> {
  if (path === '/v1/campaigns' && request.method === 'GET') {
    const params = new URL(request.url).searchParams
    if (new Set(params.keys()).size !== [...params.keys()].length) throw new ApiError('validation_failed')
    const query = z.object({ after: idSchema.optional(), limit: z.coerce.number().int().min(1).max(100).default(25) })
      .strict().parse(Object.fromEntries(params))
    const rows = await db.prepare('SELECT id,status FROM campaigns WHERE owner=? AND id>? ORDER BY id LIMIT ?')
      .bind(owner, query.after ?? '', query.limit + 1).all<{ id: string; status: string }>()
    const items = rows.results.slice(0, query.limit)
    return Response.json({ items, next: rows.results.length > query.limit ? items.at(-1)!.id : null, simulated: true })
  }
  const match = /^\/v1\/campaigns\/([a-zA-Z0-9_-]+)\/drafts$/u.exec(path)
  if (!match || request.method !== 'POST') return null
  if (new URL(request.url).search) throw new ApiError('validation_failed')
  const campaignId = idSchema.parse(match[1])
  const input = z.object({ mailboxId: idSchema, recipient: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    subject: z.string().trim().min(1).max(998).refine(value => !/[\r\n]/u.test(value)),
    body: z.string().min(1).max(100_000),
    scheduledAt: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString()).optional() }).strict().parse(await jsonBody(request))
  const campaign = await db.prepare('SELECT id FROM campaigns WHERE owner=? AND id=?').bind(owner, campaignId).first()
  if (!campaign) throw new ApiError('campaign_not_found', 404)
  const eligible = await db.prepare(`SELECT c.email FROM contacts c WHERE c.owner=? AND c.email=? AND c.opted_in=1
    AND length(trim(c.consent_source))>0 AND NOT EXISTS(SELECT 1 FROM suppressions s WHERE s.owner=c.owner AND s.email=c.email)
    AND NOT EXISTS(SELECT 1 FROM campaign_stops x WHERE x.owner=c.owner AND x.campaign_id=? AND x.email=c.email)`)
    .bind(owner, input.recipient, campaignId).first()
  if (!eligible) throw new ApiError('recipient_not_eligible', 409)
  // AIDEV-NOTE: Stable content identity makes lost-response retries safe without storing draft text in browser storage.
  const idempotencyKey = `campaign-${await sha256(JSON.stringify({ campaignId, ...input }))}`
  // AIDEV-NOTE: A retry can recover its existing draft after its due time; new scheduled drafts must be future.
  if (input.scheduledAt && Date.parse(input.scheduledAt) <= now) {
    const existing = await db.prepare('SELECT id,revision,status FROM send_intents WHERE owner=? AND idempotency_key=?')
      .bind(owner, idempotencyKey).first()
    if (existing) return Response.json(createdIntent.parse({ ...existing, simulated: true }), { status: 201 })
    throw new ApiError('schedule_must_be_future')
  }
  const result = await new SendLedger(db, unsubscribeOrigin, await mailboxReplyChannel(db, replyEnv, owner, input.mailboxId)).create(owner, { mailboxId: input.mailboxId, to: [input.recipient],
    subject: input.subject, body: input.body, kind: 'campaign', revision: 1, campaignId, idempotencyKey,
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}) }, now)
  return Response.json(createdIntent.parse({ ...result, simulated: true }), { status: 201 })
}
