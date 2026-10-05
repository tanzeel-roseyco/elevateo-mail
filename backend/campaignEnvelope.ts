import { ApiError, sha256 } from './core'
import type { SendEnvelope } from './providers/ports'

// AIDEV-NOTE: Footer is assembled before envelope hashing; the raw bearer token exists only inside that envelope.
export function campaignOrigin(value: string): string {
  let url: URL
  try { url = new URL(value) } catch { throw new ApiError('unsubscribe_origin_invalid') }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
      value.length > 2048) throw new ApiError('unsubscribe_origin_invalid')
  return url.origin
}

export async function campaignEnvelope(envelope: SendEnvelope, provider: string, origin?: string) {
  if (provider !== 'resend' || envelope.kind !== 'campaign') return { envelope, token: null }
  // AIDEV-NOTE: Even disabled-provider drafts need an opt-out; later activation cannot repair approved content.
  if (!origin) throw new ApiError('unsubscribe_origin_required', 503)
  if (envelope.to.length !== 1 || envelope.cc.length || envelope.bcc.length) throw new ApiError('recipient_shape_unsupported')
  const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')
  const body = `${envelope.body}\n\nUnsubscribe: ${campaignOrigin(origin)}/unsubscribe/${raw}`
  if (body.length > 100_000) throw new ApiError('campaign_body_too_large')
  return { envelope: { ...envelope, body }, token: { hash: await sha256(raw), email: envelope.to[0]! } }
}

export function campaignTokenStatement(db: D1Database, owner: string, id: string,
  token: { hash: string; email: string } | null): D1PreparedStatement[] {
  if (!token) return []
  // AIDEV-NOTE: Losing idempotency/replacement inserts cannot leave orphan tokens; batch with the intent INSERT.
  return [db.prepare(`INSERT INTO unsubscribe_tokens(token_hash,owner,email)
    SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM send_intents WHERE owner=? AND id=?)
    ON CONFLICT(token_hash) DO NOTHING`).bind(token.hash, owner, token.email, owner, id)]
}
