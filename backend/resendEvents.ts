import { z } from 'zod'
import { ApiError, idSchema, sha256 } from './core'
import { verifySvix } from './providers/svix'

const text = z.string().max(2048)
const eventSchema = z.object({ type: z.enum(['email.sent', 'email.delivered', 'email.bounced', 'email.complained']),
  created_at: z.string().max(64).datetime({ offset: true }),
  data: z.object({ email_id: z.string().uuid(), created_at: z.string().max(64).datetime({ offset: true }),
    from: z.email().max(254), to: z.array(z.email().max(254)).length(1), subject: z.string().max(998),
    tags: z.object({ elevateo_intent_id: idSchema }).strict(), message_id: text.optional(),
    bounce: z.object({ type: text, subType: text, message: text, diagnosticCode: z.array(text).max(10).optional() }).strict().optional(),
  }).strict(),
}).strict().refine(event => event.type !== 'email.bounced' || event.data.bounce !== undefined)
const endpointSchema = z.object({ owner: idSchema, credentialId: idSchema, secret: z.string().max(512) }).strict()
export type ResendEventEndpoint = z.infer<typeof endpointSchema>

// AIDEV-NOTE: Endpoint identity is trusted server configuration; signed payload fields never choose an owner.
export async function ingestResendEvent(db: D1Database, endpoint: ResendEventEndpoint, input: Uint8Array,
  headers: { id: string; timestamp: string; signature: string }, now = Date.now()): Promise<{ captured: true }> {
  const config = endpointSchema.parse(endpoint)
  if (!(input instanceof Uint8Array) || input.byteLength > 65_536) throw new ApiError('body_too_large', 413)
  // Copy once so callers cannot change authenticated bytes while Web Crypto is awaiting verification.
  const raw = new Uint8Array(input)
  if (!await verifySvix(raw, headers, config.secret, now)) throw new ApiError('event_unauthorized', 401)
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown }
  catch { throw new ApiError('invalid_json') }
  const event = eventSchema.parse(parsed)
  const { owner, credentialId } = config
  const intentId = event.data.tags.elevateo_intent_id
  const email = event.data.to[0]
  const hash = await sha256(new TextDecoder().decode(raw))
  // AIDEV-NOTE: Snapshot correlation remains valid after grant revocation; late complaints must still suppress.
  const match = await db.prepare(`SELECT i.id FROM send_intents i JOIN send_bindings b ON b.owner=i.owner AND b.intent_id=i.id
    WHERE i.owner=? AND i.id=? AND b.provider='resend' AND b.credential_id=? AND b.address=?
    AND i.kind='campaign' AND i.recipient_count=1 AND json_extract(i.envelope,'$.to[0]')=?
    AND json_array_length(i.envelope,'$.cc')=0 AND json_array_length(i.envelope,'$.bcc')=0
    AND i.status IN ('dispatching','unknown','accepted') AND (i.provider_id IS NULL OR i.provider_id=?)`)
    .bind(owner, intentId, credentialId, event.data.from, email, event.data.email_id).first()
  if (!match) throw new ApiError('event_correlation_failed', 409)
  const statements = [
    db.prepare(`INSERT INTO resend_event_receipts(owner,credential_id,event_id,payload_hash,intent_id,provider_id,at)
      VALUES(?,?,?,?,?,?,?) ON CONFLICT(owner,credential_id,event_id) DO NOTHING`)
      .bind(owner, credentialId, headers.id, hash, intentId, event.data.email_id, now),
    db.prepare(`INSERT INTO resend_message_links(owner,credential_id,provider_id,intent_id) VALUES(?,?,?,?)
      ON CONFLICT(owner,credential_id,provider_id) DO NOTHING`).bind(owner, credentialId, event.data.email_id, intentId),
  ]
  if (event.type === 'email.sent' || event.type === 'email.delivered') statements.push(db.prepare(`UPDATE send_intents
    SET status='accepted',provider_id=?,updated_at=?,error_code=NULL WHERE owner=? AND id=? AND status IN ('dispatching','unknown')`)
    .bind(event.data.email_id, now, owner, intentId))
  else statements.push(
    db.prepare(`INSERT INTO suppressions(owner,email,reason,at) VALUES(?,?,?,?) ON CONFLICT(owner,email) DO NOTHING`)
      .bind(owner, email, event.type === 'email.bounced' ? 'bounce' : 'complaint', now),
    db.prepare('UPDATE contacts SET opted_in=0 WHERE owner=? AND email=?').bind(owner, email),
    db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=? WHERE owner=? AND status IN ('draft','pending')
      AND EXISTS(SELECT 1 FROM json_each(recipients) WHERE value=?)`).bind(now, owner, email),
  )
  // AIDEV-NOTE: D1 batch rolls back receipt, correlation and effects together on replay or correlation conflicts.
  await db.batch(statements)
  return { captured: true }
}
