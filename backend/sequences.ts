import { z } from 'zod'
import { ApiError, idSchema, sha256 } from './core'
import { intentInsert, SendLedger } from './ledger'
import { mailboxReplyChannel } from './resendReplyRoute'

// AIDEV-NOTE: One atomic batch creates at most three ordinary immutable drafts; approval is never implicit.
export const sequenceInput = z.object({ idempotencyKey: idSchema, mailboxId: idSchema,
  recipient: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  steps: z.array(z.object({ subject: z.string().trim().min(1).max(998).refine(v => !/[\r\n]/u.test(v)),
    body: z.string().min(1).max(100_000), scheduledAt: z.iso.datetime({ offset: true })
      .transform(v => new Date(v).toISOString()) }).strict()).min(1).max(3) }).strict()
type SequenceRow = { id: string; mailbox_id: string; recipient: string; request_hash: string }
export async function sequenceView(db: D1Database, owner: string, row: SequenceRow) {
  const steps = await db.prepare(`SELECT i.id,i.revision,i.status,i.scheduled_at AS scheduledAt
    FROM sequence_steps s JOIN send_intents i ON i.owner=s.owner AND i.id=s.intent_id
    WHERE s.owner=? AND s.sequence_id=? ORDER BY s.step LIMIT 3`).bind(owner, row.id)
    .all<{ id: string; revision: string; status: string; scheduledAt: number }>()
  return { id: row.id, mailboxId: row.mailbox_id, recipient: row.recipient, steps: steps.results }
}
export async function createSequence(db: D1Database, owner: string, campaignId: string, raw: unknown,
  now: number, origin?: string, replyEnv?: unknown) {
  const input = sequenceInput.parse(raw)
  const hash = await sha256(JSON.stringify({ campaignId, ...input }))
  const lookup = () => db.prepare('SELECT * FROM campaign_sequences WHERE owner=? AND idempotency_key=?')
    .bind(owner, input.idempotencyKey).first<SequenceRow>()
  const existing = await lookup()
  if (existing) {
    if (existing.request_hash !== hash) throw new ApiError('idempotency_conflict', 409)
    return sequenceView(db, owner, existing)
  }
  let previous = now
  for (const step of input.steps) {
    const scheduled = Date.parse(step.scheduledAt)
    if (scheduled <= previous || scheduled > now + 30 * 86_400_000) throw new ApiError('sequence_schedule_invalid')
    previous = scheduled
  }
  const campaign = await db.prepare('SELECT 1 FROM campaigns WHERE owner=? AND id=?').bind(owner, campaignId).first()
  if (!campaign) throw new ApiError('campaign_not_found', 404)
  const eligible = await db.prepare(`SELECT 1 FROM contacts c WHERE c.owner=? AND c.email=? AND c.opted_in=1
    AND length(trim(c.consent_source))>0 AND NOT EXISTS(SELECT 1 FROM suppressions s WHERE s.owner=c.owner AND s.email=c.email)
    AND NOT EXISTS(SELECT 1 FROM campaign_stops x WHERE x.owner=c.owner AND x.campaign_id=? AND x.email=c.email)`)
    .bind(owner, input.recipient, campaignId).first()
  if (!eligible) throw new ApiError('recipient_not_eligible', 409)
  const id = crypto.randomUUID(), ledger = new SendLedger(db, origin, await mailboxReplyChannel(db, replyEnv, owner, input.mailboxId))
  const prepared = await Promise.all(input.steps.map((step, index) => ledger.prepare(owner, {
    ...step, mailboxId: input.mailboxId, to: [input.recipient], kind: 'campaign', campaignId,
    revision: 1, idempotencyKey: `sequence-${id}-${index}` }, now)))
  const statements = [db.prepare(`INSERT INTO campaign_sequences
    (owner,id,campaign_id,idempotency_key,request_hash,mailbox_id,recipient,created_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,idempotency_key) DO NOTHING`)
    .bind(owner, id, campaignId, input.idempotencyKey, hash, input.mailboxId, input.recipient, now)]
  for (const [index, step] of prepared.entries()) {
    statements.push(intentInsert(db, step.values, id), ...step.tokenStatements,
      db.prepare(`INSERT INTO sequence_steps(owner,sequence_id,step,intent_id,predecessor_id)
        SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campaign_sequences WHERE owner=? AND id=?)`)
        .bind(owner, id, index, step.id, prepared[index - 1]?.id ?? null, owner, id))
  }
  await db.batch(statements)
  const saved = await lookup()
  if (!saved || saved.request_hash !== hash) throw new ApiError('idempotency_conflict', 409)
  return sequenceView(db, owner, saved)
}
