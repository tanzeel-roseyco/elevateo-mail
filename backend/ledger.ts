import { ApiError, sha256 } from './core'
import { recipientCount, sendInputSchema } from './policies/send'
import { envelopeSchema, type SendEnvelope, type SendProvider } from './providers/ports'

// AIDEV-NOTE: D1 triggers own atomic admission; the immutable intent row is also the durable outbox.
export interface IntentRow {
  owner: string; id: string; mailbox_id: string; revision: string; envelope: string;
  status: string; scheduled_at: number; dispatch_at: number | null; updated_at: number
}
export class SendLedger {
  constructor(private readonly db: D1Database) {}
  async create(owner: string, raw: unknown, now: number): Promise<{ id: string; revision: string; status: string }> {
    const input = sendInputSchema.parse(raw)
    const mailbox = await this.db.prepare('SELECT address FROM mailboxes WHERE owner=? AND id=?')
      .bind(owner, input.mailboxId).first<{ address: string }>()
    if (!mailbox) throw new ApiError('mailbox_not_found', 404)
    const id = crypto.randomUUID()
    const recipients = [...input.to, ...input.cc, ...input.bcc]
    const scheduledAt = input.scheduledAt ? Date.parse(input.scheduledAt) : now
    if (scheduledAt > now + 30 * 86_400_000) throw new ApiError('schedule_too_far')
    const canonical = JSON.stringify({ ...input, scheduledAt: input.scheduledAt ?? null })
    const revision = await sha256(canonical)
    const envelope: SendEnvelope = { id, owner, mailboxId: input.mailboxId, from: mailbox.address,
      to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, body: input.body, kind: input.kind, revision }
    envelopeSchema.parse(envelope)
    await this.db.prepare(`INSERT INTO send_intents
      (owner,id,mailbox_id,idempotency_key,revision,envelope,recipients,recipient_count,kind,campaign_id,scheduled_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,idempotency_key) DO NOTHING`)
      .bind(owner, id, input.mailboxId, input.idempotencyKey, revision, JSON.stringify(envelope),
        JSON.stringify(recipients), recipientCount(input), input.kind, input.campaignId ?? null, scheduledAt, now).run()
    const saved = await this.db.prepare('SELECT id,revision,status FROM send_intents WHERE owner=? AND idempotency_key=?')
      .bind(owner, input.idempotencyKey).first<{ id: string; revision: string; status: string }>()
    if (!saved || saved.revision !== revision) throw new ApiError('idempotency_conflict', 409)
    return saved
  }
  async approve(owner: string, id: string, revision: string, now: number, ttl: number): Promise<void> {
    const result = await this.db.prepare(`UPDATE send_intents SET approved_revision=?,approval_expires_at=?,
      status='pending',updated_at=? WHERE owner=? AND id=? AND revision=? AND status='draft'`)
      .bind(revision, Math.max(now, await this.scheduledAt(owner, id)) + ttl, now, owner, id, revision).run()
    if (!result.meta.changes) throw new ApiError('approval_conflict', 409)
  }
  private async scheduledAt(owner: string, id: string): Promise<number> {
    const row = await this.db.prepare('SELECT scheduled_at FROM send_intents WHERE owner=? AND id=?')
      .bind(owner, id).first<{ scheduled_at: number }>()
    if (!row) throw new ApiError('intent_not_found', 404)
    return row.scheduled_at
  }
  async cancel(owner: string, id: string, now: number): Promise<void> {
    const result = await this.db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=?
      WHERE owner=? AND id=? AND status IN ('draft','pending')`).bind(now, owner, id).run()
    if (!result.meta.changes) throw new ApiError('already_in_flight_or_missing', 409)
  }
  async dispatch(owner: string, id: string, provider: SendProvider, now: number): Promise<void> {
    const claim = await this.db.prepare(`UPDATE send_intents SET status='dispatching',dispatch_at=?,updated_at=?,attempts=attempts+1
      WHERE owner=? AND id=? AND status='pending' AND scheduled_at<=? RETURNING *`).bind(now, now, owner, id, now)
      .first<IntentRow>()
    if (!claim) return
    // AIDEV-NOTE: Once claimed, cancellation cannot recall an external call. A crashed claim becomes unknown, never pending.
    let outcome: Awaited<ReturnType<SendProvider['send']>>
    try { outcome = await provider.send(envelopeSchema.parse(JSON.parse(claim.envelope) as unknown)) }
    catch { outcome = { status: 'unknown' } }
    await this.db.prepare(`UPDATE send_intents SET status=?,provider_id=?,error_code=?,updated_at=?
      WHERE owner=? AND id=? AND status IN ('dispatching','unknown') AND dispatch_at=?`)
      .bind(outcome.status, outcome.status === 'accepted' ? outcome.providerId : null,
        outcome.status === 'rejected' ? outcome.code : null, now, owner, id, claim.dispatch_at).run()
  }
  async reconcile(owner: string, id: string, provider: SendProvider, now: number): Promise<void> {
    const row = await this.db.prepare("SELECT * FROM send_intents WHERE owner=? AND id=? AND status='unknown'")
      .bind(owner, id).first<IntentRow>()
    if (!row) return
    const outcome = await provider.reconcile(envelopeSchema.parse(JSON.parse(row.envelope) as unknown))
    // Absence of a provider receipt is not proof of rejection. Only positive acceptance releases uncertainty.
    if (outcome.status === 'accepted') await this.db.prepare(`UPDATE send_intents SET status='accepted',provider_id=?,updated_at=?
      WHERE owner=? AND id=? AND status='unknown'`).bind(outcome.providerId, now, owner, id).run()
  }
  async recover(now: number): Promise<void> {
    await this.db.prepare(`UPDATE send_intents SET status='unknown',updated_at=?
      WHERE status='dispatching' AND updated_at<?`).bind(now, now - 60_000).run()
    await this.db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=?
      WHERE status='pending' AND approval_expires_at<=?`).bind(now, now).run()
  }
}
