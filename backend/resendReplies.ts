import { z } from 'zod'
import { ApiError, sha256 } from './core'
import { verifySvix } from './providers/svix'
import { replyChannelSchema, type ReplyChannel } from './resendReplyEnvelope'

const eventSchema = z.object({ type: z.literal('email.received'), created_at: z.iso.datetime({ offset: true }),
  data: z.object({ email_id: z.uuid(), created_at: z.iso.datetime({ offset: true }), from: z.email().max(254),
    to: z.array(z.email().max(254)).min(1).max(30), received_for: z.array(z.email().max(254)).max(30).optional(),
  }).passthrough(),
}).strict()
// AIDEV-NOTE: Signed receipt proves receipt, not sender authenticity. Correlation can only STOP campaign sends.
export async function ingestResendReply(db: D1Database, channel: ReplyChannel & { secret: string }, input: Uint8Array,
  headers: { id: string; timestamp: string; signature: string }, now = Date.now()) {
  const config = replyChannelSchema.parse({ owner: channel.owner, credentialId: channel.credentialId, domain: channel.domain })
  if (!(input instanceof Uint8Array) || input.byteLength > 65_536) throw new ApiError('body_too_large', 413)
  const raw = new Uint8Array(input)
  if (!await verifySvix(raw, headers, channel.secret, now)) throw new ApiError('event_unauthorized', 401)
  let parsed: unknown
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)) as unknown }
  catch { throw new ApiError('invalid_json') }
  const event = eventSchema.parse(parsed)
  const addresses = [...new Set((event.data.received_for ?? event.data.to).map(value => value.toLowerCase()))]
  const targets = addresses.filter(value => value.endsWith(`@${config.domain}`) && /^[a-f0-9]{64}@/u.test(value))
  if (targets.length !== 1) throw new ApiError('reply_correlation_failed', 409)
  const hash = await sha256(targets[0]!.split('@')[0]!)
  const source = await db.prepare(`SELECT i.id,i.campaign_id,json_extract(i.envelope,'$.to[0]') recipient
    FROM resend_reply_tokens t JOIN send_intents i ON i.owner=t.owner AND i.id=t.intent_id
    JOIN send_bindings b ON b.owner=i.owner AND b.intent_id=i.id
    WHERE t.owner=? AND t.credential_id=? AND t.domain=? AND t.token_hash=? AND b.provider='resend'
    AND b.credential_id=t.credential_id AND i.kind='campaign' AND i.campaign_id IS NOT NULL
    AND i.status IN ('dispatching','unknown','accepted') AND i.dispatch_at<=?
    AND lower(json_extract(i.envelope,'$.to[0]'))=? AND json_extract(i.envelope,'$.resendReplyTo')=?`)
    .bind(config.owner, config.credentialId, config.domain, hash, Date.parse(event.data.created_at),
      event.data.from.toLowerCase(), targets[0]).first<{ id: string; campaign_id: string; recipient: string }>()
  if (!source) throw new ApiError('reply_correlation_failed', 409)
  // AIDEV-NOTE: Receipt and stop/cancellation commit atomically; existing ledger guards fence later claims.
  await db.batch([
    db.prepare(`INSERT INTO resend_reply_receipts VALUES(?,?,?,?,?,?,?)
      ON CONFLICT(owner,credential_id,event_id) DO NOTHING`)
      .bind(config.owner, config.credentialId, headers.id, await sha256(new TextDecoder().decode(raw)), source.id, event.data.email_id, now),
    db.prepare(`INSERT INTO campaign_stops(owner,campaign_id,email) VALUES(?,?,?) ON CONFLICT DO NOTHING`)
      .bind(config.owner, source.campaign_id, source.recipient),
    db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=? WHERE owner=? AND campaign_id=?
      AND status IN ('draft','pending') AND EXISTS(SELECT 1 FROM json_each(recipients) WHERE value=?)`)
      .bind(now, config.owner, source.campaign_id, source.recipient),
  ])
  return { captured: true as const }
}
