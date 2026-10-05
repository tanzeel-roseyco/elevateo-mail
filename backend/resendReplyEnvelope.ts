import { z } from 'zod'
import { sha256 } from './core'
import type { SendEnvelope } from './providers/ports'

// AIDEV-NOTE: Approved receiving subdomains only; this module never changes DNS or root MX records.
export const replyChannelSchema = z.object({ owner: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
  credentialId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/u),
  domain: z.string().max(189).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.){2,}[a-z]{2,63}$/u)
    .refine(value => value !== 'in.elevateoco.com'),
}).strict()
export type ReplyChannel = z.infer<typeof replyChannelSchema> & { fingerprint?: string }
export async function resendReplyEnvelope(db: D1Database, envelope: SendEnvelope, provider: string, channel?: ReplyChannel) {
  if (!channel || provider !== 'resend' || envelope.kind !== 'campaign') return { envelope, statements: [] }
  const { fingerprint, ...raw } = channel
  const config = replyChannelSchema.parse(raw)
  const channelHash = z.string().regex(/^[a-f0-9]{64}$/u).optional().parse(fingerprint)
  if (config.owner !== envelope.owner) return { envelope, statements: [] }
  const sender = await db.prepare('SELECT credential_id FROM resend_senders WHERE owner=? AND mailbox_id=?')
    .bind(envelope.owner, envelope.mailboxId).first<{ credential_id: string }>()
  if (sender?.credential_id !== config.credentialId) return { envelope, statements: [] }
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  // AIDEV-NOTE: Losing idempotency inserts cannot orphan correlation rows; token stays in immutable envelope only.
  const statement = db.prepare(`INSERT INTO resend_reply_tokens(owner,intent_id,credential_id,domain,token_hash)
    SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM send_intents WHERE owner=? AND id=?)
    ON CONFLICT(owner,intent_id) DO NOTHING`)
    .bind(envelope.owner, envelope.id, config.credentialId, config.domain, await sha256(token), envelope.owner, envelope.id)
  return { envelope: { ...envelope, resendReplyTo: `${token}@${config.domain}`, ...(channelHash ? { resendReplyChannelHash: channelHash } : {}) }, statements: [statement] }
}
