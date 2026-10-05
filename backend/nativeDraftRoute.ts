import { z } from 'zod'
import { ApiError, idSchema, jsonBody, sha256, type AuthenticatedSession } from './core'
import { untrustedMailContext } from './policies/ai'

const opaque = z.string().regex(/^[a-f0-9]{64}$/u)
const selected = z.array(idSchema).min(1).max(20).refine(ids => new Set(ids).size === ids.length)
type Ticket = { owner: string; session_hash: string; request_id: string; mailbox_id: string;
  message_ids: string; instruction: string; expires_at: number }
const secret = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('')
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } })

async function binding(db: D1Database, row: Ticket, now: number) {
  const result = await db.prepare(`SELECT a.account_id FROM accounts a JOIN sessions s ON s.owner=a.owner
    JOIN mailboxes m ON m.owner=a.owner WHERE a.owner=? AND s.token_hash=? AND s.expires_at>?
    AND m.id=? AND m.connected=1 AND m.ai_read=1 AND m.ai_draft=1`)
    .bind(row.owner, row.session_hash, now, row.mailbox_id).first<{ account_id: string }>()
  if (!result || row.expires_at <= now) throw new ApiError('native_draft_expired', 401)
  return { accountId: result.account_id, sessionGeneration: await sha256(`native-draft:${row.session_hash}`),
    requestId: row.request_id, mailboxId: row.mailbox_id, expiresAt: row.expires_at }
}

export async function issueNativeDraft(request: Request, session: AuthenticatedSession, db: D1Database, now: number) {
  const started = performance.now()
  const input = z.object({ mailboxId: idSchema, messageIds: selected, instruction: z.string().trim().min(1).max(4000),
    requestId: idSchema }).strict().parse(await jsonBody(request))
  now += Math.max(0, Math.floor(performance.now() - started))
  const row: Ticket = { owner: session.owner, session_hash: session.token_hash, request_id: input.requestId,
    mailbox_id: input.mailboxId, message_ids: JSON.stringify(input.messageIds), instruction: input.instruction,
    expires_at: Math.min(now + 60_000, session.expires_at) }
  await binding(db, row, now)
  const ticket = secret()
  // AIDEV-NOTE: Bounded outstanding tickets prevent abandoned desktop handoffs accumulating indefinitely.
  await db.prepare('DELETE FROM native_draft_tickets WHERE expires_at<=?').bind(now).run()
  const inserted = await db.prepare(`INSERT INTO native_draft_tickets
    (ticket_hash,owner,session_hash,request_id,mailbox_id,message_ids,instruction,expires_at)
    SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM native_draft_tickets WHERE owner=?)<10`)
    .bind(await sha256(ticket), row.owner, row.session_hash, row.request_id, row.mailbox_id, row.message_ids,
      row.instruction, row.expires_at, row.owner).run()
  if (!inserted.meta.changes) throw new ApiError('native_draft_limit', 429)
  return reply({ ticket, requestId: row.request_id, expiresAt: row.expires_at }, 201)
}

// AIDEV-NOTE: Native redeems a one-use capability; renderer origin/cookies can never authenticate this route.
export async function redeemNativeDraft(request: Request, path: string, db: D1Database, now: number): Promise<Response | null> {
  const started = performance.now()
  const currentTime = () => now + Math.max(0, Math.floor(performance.now() - started))
  if (!['/v1/ai/native/redeem', '/v1/ai/native/check'].includes(path)) return null
  if (request.method !== 'POST' || new URL(request.url).search ||
    ['origin', 'sec-fetch-site', 'cookie', 'authorization'].some(name => request.headers.has(name))) {
    throw new ApiError('native_request_denied', 403)
  }
  const check = path.endsWith('/check')
  const raw = await jsonBody(request)
  const input = check ? z.object({ lease: opaque, requestId: idSchema }).strict().parse(raw)
    : z.object({ ticket: opaque, requestId: idSchema }).strict().parse(raw)
  const token = 'lease' in input ? input.lease : input.ticket
  const row = await db.prepare(`SELECT * FROM native_draft_tickets WHERE ${check ? 'lease_hash' : 'ticket_hash'}=?
    AND request_id=? AND expires_at>? ${check ? '' : 'AND lease_hash IS NULL'}`)
    .bind(await sha256(token), input.requestId, currentTime()).first<Ticket>()
  if (!row) throw new ApiError('native_draft_expired', 401)
  const identity = await binding(db, row, currentTime())
  if (check) return reply(identity)
  const ids = selected.parse(JSON.parse(row.message_ids))
  const messages = await db.prepare(`SELECT id,subject,body FROM messages WHERE owner=? AND mailbox_id=?
    AND id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(row.owner, row.mailbox_id, ...ids)
    .all<{ id: string; subject: string; body: string }>()
  if (messages.results.length !== ids.length) throw new ApiError('native_context_changed', 409)
  const context = JSON.stringify(untrustedMailContext(JSON.stringify(messages.results)))
  if (new TextEncoder().encode(context + row.instruction).byteLength > 90_000) throw new ApiError('body_too_large', 413)
  const lease = secret()
  // AIDEV-NOTE: Context loading may race revocation; consume only while the same session/grants remain valid.
  const redeemed = await db.prepare(`UPDATE native_draft_tickets SET lease_hash=? WHERE ticket_hash=?
    AND lease_hash IS NULL AND expires_at>? AND EXISTS(SELECT 1 FROM sessions s JOIN mailboxes m ON m.owner=s.owner
      WHERE s.token_hash=native_draft_tickets.session_hash AND s.owner=native_draft_tickets.owner
      AND s.expires_at>? AND m.id=native_draft_tickets.mailbox_id AND m.connected=1 AND m.ai_read=1 AND m.ai_draft=1)`)
    .bind(await sha256(lease), await sha256(token), currentTime(), currentTime()).run()
  if (!redeemed.meta.changes) throw new ApiError('native_draft_expired', 401)
  return reply({ ...identity, instruction: row.instruction, context, lease })
}
