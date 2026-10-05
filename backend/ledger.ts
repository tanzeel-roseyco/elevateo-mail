import { ApiError, sha256 } from './core'
import { recipientCount, sendInputSchema } from './policies/send'
import { envelopeSchema, type SendEnvelope, type SendProvider } from './providers/ports'

// AIDEV-NOTE: D1 triggers own atomic admission; the immutable intent row is also the durable outbox.
export interface IntentRow {
  owner: string; id: string; mailbox_id: string; revision: string; envelope: string;
  status: string; scheduled_at: number; dispatch_at: number | null; updated_at: number;
  recipients: string; recipient_count: number; kind: string; envelope_hash: string | null
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
      (owner,id,mailbox_id,idempotency_key,revision,envelope,recipients,recipient_count,kind,campaign_id,scheduled_at,updated_at,envelope_hash)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner,idempotency_key) DO NOTHING`)
      .bind(owner, id, input.mailboxId, input.idempotencyKey, revision, JSON.stringify(envelope),
        JSON.stringify(recipients), recipientCount(input), input.kind, input.campaignId ?? null, scheduledAt, now,
        await sha256(JSON.stringify(envelope))).run()
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
  private async envelope(row: IntentRow): Promise<SendEnvelope> {
    // AIDEV-NOTE: The independent immutable digest detects valid-shaped corruption; legacy undigested rows fail closed.
    if (!row.envelope_hash || await sha256(row.envelope) !== row.envelope_hash) throw new Error('envelope_digest_mismatch')
    const envelope = envelopeSchema.parse(JSON.parse(row.envelope) as unknown)
    if (envelope.owner !== row.owner || envelope.id !== row.id || envelope.mailboxId !== row.mailbox_id ||
      envelope.revision !== row.revision || envelope.kind !== row.kind ||
      JSON.stringify([...envelope.to, ...envelope.cc, ...envelope.bcc]) !== row.recipients ||
      envelope.to.length + envelope.cc.length + envelope.bcc.length !== row.recipient_count) {
      throw new Error('envelope_identity_mismatch')
    }
    return envelope
  }
  async dispatch(owner: string, id: string, provider: SendProvider, now: number): Promise<void> {
    const pending = await this.db.prepare("SELECT * FROM send_intents WHERE owner=? AND id=? AND status='pending'")
      .bind(owner, id).first<IntentRow>()
    if (!pending) return
    let envelope: SendEnvelope
    try { envelope = await this.envelope(pending) }
    catch {
      // AIDEV-NOTE: Invalid unclaimed data proves no call occurred; invalid unknown data must retain its reservation.
      await this.db.prepare(`UPDATE send_intents SET status='rejected',error_code='invalid_envelope',correlation_id=?,updated_at=?
        WHERE owner=? AND id=? AND status='pending'`).bind(crypto.randomUUID(), now, owner, id).run()
      return
    }
    const claim = await this.db.prepare(`UPDATE send_intents SET status='dispatching',dispatch_at=?,updated_at=?,attempts=attempts+1
      WHERE owner=? AND id=? AND status='pending' AND scheduled_at<=? RETURNING *`).bind(now, now, owner, id, now)
      .first<IntentRow>()
    if (!claim) return
    // AIDEV-NOTE: Once claimed, cancellation cannot recall an external call. A crashed claim becomes unknown, never pending.
    let outcome: Awaited<ReturnType<SendProvider['send']>>
    try { outcome = await provider.send(envelope) }
    catch { outcome = { status: 'unknown' } }
    await this.db.prepare(`UPDATE send_intents SET status=?,provider_id=?,error_code=?,correlation_id=?,updated_at=?,reconcile_at=?
      WHERE owner=? AND id=? AND status IN ('dispatching','unknown') AND dispatch_at=?`)
      .bind(outcome.status, outcome.status === 'accepted' ? outcome.providerId : null,
        outcome.status === 'rejected' ? 'provider_rejected' : outcome.status === 'unknown' ? 'provider_outcome_unknown' : null,
        outcome.status === 'accepted' ? null : crypto.randomUUID(), now, now, owner, id, claim.dispatch_at).run()
  }
  async reconcile(owner: string, id: string, provider: SendProvider, now: number): Promise<void> {
    const row = await this.db.prepare("SELECT * FROM send_intents WHERE owner=? AND id=? AND status='unknown'")
      .bind(owner, id).first<IntentRow>()
    if (!row) return
    let outcome: Awaited<ReturnType<SendProvider['reconcile']>> = { status: 'unknown' }
    let code = 'reconciliation_unknown'
    let envelope: SendEnvelope | undefined
    try { envelope = await this.envelope(row) }
    catch { code = 'invalid_envelope' }
    if (envelope) {
      try { outcome = await provider.reconcile(envelope) }
      catch { code = 'reconciliation_unavailable' }
    }
    // Absence of a provider receipt is not proof of rejection. Only positive acceptance releases uncertainty.
    if (outcome.status === 'accepted') await this.db.prepare(`UPDATE send_intents SET status='accepted',provider_id=?,updated_at=?,error_code=NULL
      WHERE owner=? AND id=? AND status='unknown'`).bind(outcome.providerId, now, owner, id).run()
    else await this.db.prepare(`UPDATE send_intents SET error_code=?,correlation_id=COALESCE(correlation_id,?),
      reconcile_attempts=reconcile_attempts+1,reconcile_at=? WHERE owner=? AND id=? AND status='unknown'`)
      .bind(code, crypto.randomUUID(), now + 300_000, owner, id).run()
  }
  async recover(now: number): Promise<void> {
    await this.db.prepare(`UPDATE send_intents SET status='unknown',updated_at=?,error_code='dispatch_interrupted',
      correlation_id=COALESCE(correlation_id,?),reconcile_at=? WHERE rowid IN
      (SELECT rowid FROM send_intents WHERE status='dispatching' AND updated_at<? ORDER BY updated_at,id LIMIT 100)`)
      .bind(now, crypto.randomUUID(), now, now - 60_000).run()
    await this.db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=?
      WHERE rowid IN (SELECT rowid FROM send_intents WHERE status='pending' AND approval_expires_at<=?
      ORDER BY approval_expires_at,id LIMIT 100)`).bind(now, now).run()
  }
}
