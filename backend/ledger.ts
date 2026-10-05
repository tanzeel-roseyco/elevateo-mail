import { sequenceActivationProof } from './sequenceActivation'
import { resolveReply } from './gmailReply'
import { resendReplyEnvelope, type ReplyChannel } from './resendReplyEnvelope'
import { ApiError, sha256 } from './core'
import { z } from 'zod'
import { recipientCount, sendInputSchema } from './policies/send'
import { envelopeSchema, type SendEnvelope, type SendProvider } from './providers/ports'
import { campaignEnvelope, campaignOrigin, campaignTokenStatement } from './campaignEnvelope'

// AIDEV-NOTE: D1 triggers own atomic admission; the immutable intent row is also the durable outbox.
export interface IntentRow {
  owner: string; id: string; mailbox_id: string; revision: string; envelope: string;
  status: string; scheduled_at: number; dispatch_at: number | null; updated_at: number;
  recipients: string; recipient_count: number; kind: string; envelope_hash: string | null
}
const dispatchBindingSchema = z.discriminatedUnion('provider', [
  z.object({ provider: z.literal('fake') }).strict(),
  z.object({ provider: z.literal('resend'), credentialId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u),
    credentialRevision: z.number().int().positive().safe() }).strict(),
  z.object({ provider: z.literal('gmail'), credentialId: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u),
    credentialRevision: z.number().int().positive().safe(), grantEpoch: z.number().int().positive().safe(),
    permissionGeneration: z.number().int().nonnegative().safe() }).strict(),
])
export type DispatchBinding = z.infer<typeof dispatchBindingSchema>
// AIDEV-NOTE: Sequence batches reuse the canonical insert; their ownership gate prevents losing retry batches.
export function intentInsert(db: D1Database, values: (string | number | null)[], sequenceId?: string) {
  const gate = sequenceId === undefined ? ' WHERE 1' : ' WHERE EXISTS(SELECT 1 FROM campaign_sequences WHERE owner=? AND id=?)'
  return db.prepare(`INSERT INTO send_intents
    (owner,id,mailbox_id,idempotency_key,revision,envelope,recipients,recipient_count,kind,campaign_id,scheduled_at,updated_at,envelope_hash,created_at)
    SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?${gate} ON CONFLICT(owner,idempotency_key) DO NOTHING`)
    .bind(...values, ...(sequenceId === undefined ? [] : [values[0]!, sequenceId]))
}
const bindingMatch = `EXISTS(SELECT 1 FROM send_bindings b WHERE b.owner=send_intents.owner
  AND b.intent_id=send_intents.id AND b.provider=? AND (b.provider='fake'
  OR (b.provider='resend' AND b.credential_id=? AND b.credential_revision=?)
  OR (b.provider='gmail' AND b.credential_id=? AND b.grant_epoch=? AND b.permission_generation=?
    AND EXISTS(SELECT 1 FROM provider_credentials c WHERE c.owner=b.owner AND c.id=b.credential_id
      AND c.revision=? AND c.grant_epoch=b.grant_epoch AND c.sealed IS NOT NULL))))`
function bindingValues(input: DispatchBinding): (string | number | null)[] {
  const binding = dispatchBindingSchema.parse(input)
  return [binding.provider, binding.provider === 'resend' ? binding.credentialId : null,
    binding.provider === 'resend' ? binding.credentialRevision : null,
    binding.provider === 'gmail' ? binding.credentialId : null,
    binding.provider === 'gmail' ? binding.grantEpoch : null,
    binding.provider === 'gmail' ? binding.permissionGeneration : null,
    binding.provider === 'gmail' ? binding.credentialRevision : null]
}
export class SendLedger {
  private readonly unsubscribeOrigin?: string
  constructor(private readonly db: D1Database, unsubscribeOrigin?: string, private readonly replyChannel?: ReplyChannel, private readonly sequenceEnv?: unknown) {
    this.unsubscribeOrigin = unsubscribeOrigin === undefined ? undefined : campaignOrigin(unsubscribeOrigin)
  }
  async prepare(owner: string, raw: unknown, now: number) {
    const input = sendInputSchema.parse(raw)
    const mailbox = await this.db.prepare('SELECT address,provider FROM mailboxes WHERE owner=? AND id=?')
      .bind(owner, input.mailboxId).first<{ address: string; provider: string }>()
    if (!mailbox) throw new ApiError('mailbox_not_found', 404)
    if (mailbox.provider === 'gmail' && input.kind !== 'manual') throw new ApiError('gmail_manual_only', 409)
    const reply = await resolveReply(this.db, owner, input, mailbox.provider)
    const id = crypto.randomUUID()
    const recipients = [...input.to, ...input.cc, ...input.bcc]
    const scheduledAt = input.scheduledAt ? Date.parse(input.scheduledAt) : now
    if (scheduledAt > now + 30 * 86_400_000) throw new ApiError('schedule_too_far')
    const canonical = JSON.stringify({ ...input, scheduledAt: input.scheduledAt ?? null })
    const revision = await sha256(canonical)
    const envelope: SendEnvelope = { id, owner, mailboxId: input.mailboxId, from: mailbox.address,
      to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject, body: input.body, kind: input.kind, revision, ...(reply ? { reply } : {}) }
    const replyPrepared = await resendReplyEnvelope(this.db, envelope, mailbox.provider, this.replyChannel)
    const prepared = await campaignEnvelope(replyPrepared.envelope, mailbox.provider, this.unsubscribeOrigin)
    envelopeSchema.parse(prepared.envelope)
    return { id, revision, input, tokenStatements: [...campaignTokenStatement(this.db, owner, id, prepared.token), ...replyPrepared.statements],
      values: [owner, id, input.mailboxId, input.idempotencyKey, revision, JSON.stringify(prepared.envelope),
        JSON.stringify(recipients), recipientCount(input), input.kind, input.campaignId ?? null, scheduledAt, now,
        await sha256(JSON.stringify(prepared.envelope)), now] }
  }
  async create(owner: string, raw: unknown, now: number): Promise<{ id: string; revision: string; status: string }> {
    // AIDEV-NOTE: Retry returns the original immutable footer; origin changes never rewrite an approved draft.
    const input = sendInputSchema.parse(raw)
    const revision = await sha256(JSON.stringify({ ...input, scheduledAt: input.scheduledAt ?? null }))
    const existing = await this.db.prepare('SELECT id,revision,status FROM send_intents WHERE owner=? AND idempotency_key=?')
      .bind(owner, input.idempotencyKey).first<{ id: string; revision: string; status: string }>()
    if (existing) {
      if (existing.revision !== revision) throw new ApiError('idempotency_conflict', 409)
      return existing
    }
    const { values, tokenStatements } = await this.prepare(owner, raw, now)
    await this.db.batch([intentInsert(this.db, values), ...tokenStatements])
    const saved = await this.db.prepare('SELECT id,revision,status FROM send_intents WHERE owner=? AND idempotency_key=?')
      .bind(owner, input.idempotencyKey).first<{ id: string; revision: string; status: string }>()
    if (!saved || saved.revision !== revision) throw new ApiError('idempotency_conflict', 409)
    return saved
  }
  async approve(owner: string, id: string, revision: string, now: number, ttl: number): Promise<void> {
    const result = await this.db.prepare(`UPDATE send_intents SET approved_revision=?,approval_expires_at=?,
      status='pending',updated_at=?,sequence_proof=? WHERE owner=? AND id=? AND revision=? AND status='draft'`)
      .bind(revision, Math.max(now, await this.scheduledAt(owner, id)) + ttl, now, await sequenceActivationProof(this.db, this.sequenceEnv, owner, id), owner, id, revision).run()
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
    if (!result.meta.changes) {
      // AIDEV-NOTE: Check existence only after the atomic transition fails; foreign IDs must look absent.
      const exists = await this.db.prepare('SELECT 1 FROM send_intents WHERE owner=? AND id=?').bind(owner, id).first()
      if (!exists) throw new ApiError('intent_not_found', 404)
      throw new ApiError('already_in_flight_or_missing', 409)
    }
  }
  async envelope(row: IntentRow): Promise<SendEnvelope> {
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
  // AIDEV-NOTE: Trusted resolvers must pair the adapter with its exact credential; omitted binding is fake-only.
  async dispatch(owner: string, id: string, provider: SendProvider, now: number,
    binding: DispatchBinding = { provider: 'fake' }): Promise<void> {
    const values = bindingValues(binding)
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
    const claim = await this.db.prepare(`UPDATE send_intents SET status='dispatching',dispatch_at=?,updated_at=?,attempts=attempts+1,sequence_proof=?
      WHERE owner=? AND id=? AND status='pending' AND scheduled_at<=? AND ${bindingMatch} RETURNING *`)
      .bind(now, now, await sequenceActivationProof(this.db, this.sequenceEnv, owner, id), owner, id, now, ...values)
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
  async reconcile(owner: string, id: string, provider: SendProvider, now: number,
    binding: DispatchBinding = { provider: 'fake' }): Promise<void> {
    // AIDEV-NOTE: Reconciliation uses the original provider identity, never the mailbox's replacement connection.
    const row = await this.db.prepare(`SELECT * FROM send_intents WHERE owner=? AND id=? AND status='unknown' AND ${bindingMatch}`)
      .bind(owner, id, ...bindingValues(binding)).first<IntentRow>()
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
