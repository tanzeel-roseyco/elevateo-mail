import { z } from 'zod'
import { sha256, ApiError } from './core'
import { replyChannelSchema } from './resendReplyEnvelope'
import { rawBody, resendWebhookSecret } from './resendEventRoute'
import { ingestResendReply } from './resendReplies'
const schema = z.record(z.string().regex(/^[A-Za-z0-9_-]{24,128}$/u),
  replyChannelSchema.extend({ secret: resendWebhookSecret })).refine(value => Object.keys(value).length <= 100)
// AIDEV-NOTE: Trusted deployment config binds webhook authority; browser input cannot choose domains or owners.
function channels(env: unknown) {
  try {
    const value = z.object({ RESEND_REPLY_ENDPOINTS: z.string().max(90_000).optional() }).parse(env ?? {}).RESEND_REPLY_ENDPOINTS
    return value === undefined ? {} : schema.parse(JSON.parse(value) as unknown)
  } catch { throw new ApiError('resend_reply_configuration_invalid', 503) }
}
export async function resendReplyChannel(env: unknown, owner: string, credentialId: string) {
  const matches = Object.entries(channels(env)).filter(([, value]) => value.owner === owner && value.credentialId === credentialId)
  if (matches.length > 1) throw new ApiError('resend_reply_configuration_invalid', 503)
  const entry = matches[0]
  if (!entry) return undefined
  const [endpoint, match] = entry
  return { owner: match.owner, credentialId: match.credentialId, domain: match.domain,
    fingerprint: await sha256(JSON.stringify([endpoint, owner, credentialId, match.domain, match.secret])) }
}
export async function mailboxReplyChannel(db: D1Database, env: unknown, owner: string, mailboxId: string) {
  const binding = await db.prepare('SELECT credential_id FROM resend_senders WHERE owner=? AND mailbox_id=?')
    .bind(owner, mailboxId).first<{ credential_id: string }>()
  return binding ? resendReplyChannel(env, owner, binding.credential_id) : undefined
}
export async function resendReplyRoute(request: Request, db: D1Database, env: unknown, now = Date.now()) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/v1/resend/replies/')) return undefined
  const match = /^\/v1\/resend\/replies\/([A-Za-z0-9_-]{24,128})$/u.exec(url.pathname)
  if (!match) throw new ApiError('not_found', 404)
  if (request.method !== 'POST') throw new ApiError('method_not_allowed', 405)
  if (url.search) throw new ApiError('validation_failed')
  const configured = channels(env)
  const channel = Object.hasOwn(configured, match[1]!) ? configured[match[1]!] : undefined
  if (!channel) throw new ApiError('not_found', 404)
  const result = await ingestResendReply(db, channel, await rawBody(request), {
    id: request.headers.get('svix-id') ?? '', timestamp: request.headers.get('svix-timestamp') ?? '',
    signature: request.headers.get('svix-signature') ?? '',
  }, now)
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
}


export function sequenceActivationAvailable(env: unknown, owner: string): boolean {
  const enabled = z.object({ RESEND_SEQUENCES_ENABLED: z.enum(['true', 'false']).default('false') }).parse(env ?? {})
  return enabled.RESEND_SEQUENCES_ENABLED === 'true' && Object.values(channels(env)).some(value => value.owner === owner)
}
