import { z } from 'zod'
import { ApiError, boundedText, idSchema, sha256 } from './core'

// AIDEV-NOTE: This signed fake event contract is not a Gmail push JWT or a Resend/Svix webhook implementation.
const eventSchema = z.object({ id: idSchema, type: z.enum(['bounce', 'complaint', 'reply', 'inbound']),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)), intentId: idSchema.optional(),
  message: z.object({ id: idSchema, threadId: idSchema, subject: z.string().max(998),
    // AIDEV-NOTE: Signed data still needs a renderable JavaScript Date, not merely an integer timestamp.
    body: z.string().max(100_000), at: z.number().int().nonnegative().max(8_640_000_000_000_000) }).strict().optional() }).strict()
export async function captureEvent(request: Request, connectionId: string, env: Env, now: number): Promise<Response> {
  const connection = await env.DB.prepare(`SELECT c.owner,c.mailbox_id,c.secret_hash FROM event_connections c
    JOIN mailboxes m ON m.owner=c.owner AND m.id=c.mailbox_id WHERE c.id=? AND m.provider='fake' AND m.connected=1`)
    .bind(connectionId).first<{ owner: string; mailbox_id: string; secret_hash: string }>()
  if (!connection) throw new ApiError('event_unauthorized', 401)
  const raw = await boundedText(request)
  const timestamp = request.headers.get('x-event-timestamp') ?? ''
  const signature = request.headers.get('x-event-signature') ?? ''
  if (!/^\d{13}$/u.test(timestamp) || Math.abs(now - Number(timestamp)) > 300_000 || !/^[a-f0-9]{64}$/u.test(signature)) {
    throw new ApiError('event_unauthorized', 401)
  }
  // Store only the hashed high-entropy secret; the hash is the HMAC key for the fake protocol.
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(connection.secret_hash),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])
  const bytes = Uint8Array.from(signature.match(/../gu)!, pair => Number.parseInt(pair, 16))
  if (!await crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`${timestamp}.${raw}`))) {
    throw new ApiError('event_unauthorized', 401)
  }
  let parsed: unknown
  try { parsed = JSON.parse(raw) as unknown } catch { throw new ApiError('invalid_json') }
  const event = eventSchema.parse(parsed)
  const hash = await sha256(raw)
  const { owner, mailbox_id: mailboxId } = connection
  const prior = await env.DB.prepare('SELECT payload_hash FROM event_receipts WHERE owner=? AND mailbox_id=? AND event_id=?')
    .bind(owner, mailboxId, event.id).first<{ payload_hash: string }>()
  if (prior && prior.payload_hash !== hash) throw new ApiError('event_conflict', 409)
  if (event.type === 'inbound' && !event.message) throw new ApiError('message_required')
  if (event.type === 'reply' && !event.intentId) throw new ApiError('reply_reference_required')
  const statements = [env.DB.prepare(`INSERT INTO event_receipts(owner,mailbox_id,event_id,payload_hash,at)
    VALUES(?,?,?,?,?) ON CONFLICT(owner,mailbox_id,event_id) DO NOTHING`).bind(owner, mailboxId, event.id, hash, now)]
  if (event.type === 'bounce' || event.type === 'complaint') statements.push(env.DB.prepare(`INSERT INTO suppressions(owner,email,reason,at)
    VALUES(?,?,?,?) ON CONFLICT(owner,email) DO NOTHING`).bind(owner, event.email, event.type, now))
  if (event.type === 'reply') statements.push(env.DB.prepare(`INSERT INTO campaign_stops(owner,campaign_id,email)
    SELECT owner,campaign_id,? FROM send_intents WHERE owner=? AND mailbox_id=? AND id=? AND kind='campaign'
    AND status IN ('accepted','unknown','dispatching') AND EXISTS(SELECT 1 FROM json_each(recipients) WHERE value=?)
    ON CONFLICT(owner,campaign_id,email) DO NOTHING`).bind(event.email, owner, mailboxId, event.intentId!, event.email))
  if (event.message) statements.push(env.DB.prepare(`INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(owner,mailbox_id,id) DO NOTHING`).bind(owner, mailboxId,
      event.message.id, event.message.threadId, event.email, event.message.subject, event.message.body, event.message.at))
  await env.DB.batch(statements)
  return Response.json({ captured: true, simulated: true })
}
export async function unsubscribe(request: Request, token: string, db: D1Database, now: number): Promise<Response> {
  if (!/^[a-zA-Z0-9_-]{32,256}$/u.test(token)) throw new ApiError('invalid_token', 404)
  const row = await db.prepare('SELECT owner,email FROM unsubscribe_tokens WHERE token_hash=?')
    .bind(await sha256(token)).first<{ owner: string; email: string }>()
  if (!row) throw new ApiError('invalid_token', 404)
  // GET never mutates consent: automated link scanners must not silently opt recipients out.
  if (request.method === 'GET') return new Response('<!doctype html><title>Unsubscribe</title><form method="post"><button>Confirm unsubscribe</button></form>',
    { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; form-action 'self'" } })
  if (request.method !== 'POST') throw new ApiError('method_not_allowed', 405)
  await db.batch([
    db.prepare("INSERT INTO suppressions(owner,email,reason,at) VALUES(?,?,'unsubscribe',?) ON CONFLICT(owner,email) DO NOTHING")
      .bind(row.owner, row.email, now),
    db.prepare('UPDATE contacts SET opted_in=0 WHERE owner=? AND email=?').bind(row.owner, row.email),
    db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=? WHERE owner=? AND status IN ('draft','pending')
      AND EXISTS(SELECT 1 FROM json_each(recipients) WHERE value=?)`).bind(now, row.owner, row.email),
  ])
  return Response.json({ unsubscribed: true })
}
