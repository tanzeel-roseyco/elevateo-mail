import { z } from 'zod'
import { ApiError, idSchema, jsonBody, type AuthenticatedSession } from './core'
import type { ConnectionOAuth } from './connectionOAuth'

// AIDEV-NOTE: Credential metadata only; tokens never cross HTTP. Caller authenticates origin, CSRF and account binding.
export async function connectionRoute(request: Request, path: string, session: AuthenticatedSession,
  db: D1Database, oauth?: ConnectionOAuth, now = Date.now(), sendOauth?: ConnectionOAuth): Promise<Response | null> {
  if (!path.startsWith('/v1/connections')) return null
  const startedAt = performance.now()
  // AIDEV-NOTE: Body reads may outlive a session; refresh the injected epoch with monotonic elapsed time before writes.
  const clock = () => now + Math.ceil(performance.now() - startedAt)
  const owner = idSchema.parse(session.owner)
  const hash = z.string().regex(/^[a-f0-9]{64}$/u).parse(session.token_hash)
  const active = 'EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)'
  const guard = () => [owner, hash, clock()]
  if (!await db.prepare(`SELECT 1 WHERE ${active}`).bind(...guard()).first()) throw new ApiError('unauthorized', 401)
  const params = new URL(request.url).searchParams
  if (path === '/v1/connections' && request.method === 'GET') {
    if (new Set(params.keys()).size !== [...params.keys()].length) throw new ApiError('validation_failed')
    const query = z.object({ after: idSchema.optional(), limit: z.coerce.number().int().min(1).max(100).default(25) })
      .strict().parse(Object.fromEntries(params))
    const rows = await db.prepare(`SELECT id,provider,subject,revision,sealed IS NULL AS revoked
      FROM provider_credentials WHERE owner=? AND id>? ORDER BY id LIMIT ?`)
      .bind(owner, query.after ?? '', query.limit + 1).all<{ id: string; provider: string; subject: string; revision: number; revoked: number }>()
    const items = rows.results.slice(0, query.limit).map(row => ({ ...row, revoked: Boolean(row.revoked) }))
    return Response.json({ items, next: rows.results.length > query.limit ? { after: items.at(-1)!.id } : null })
  }
  if (params.size) throw new ApiError('validation_failed')
  if (request.method === 'POST' && path === '/v1/connections/oauth/begin') {
    const input = z.object({ reconnectId: idSchema.optional(), purpose: z.enum(['read', 'send']).default('read') })
      .strict().parse(await jsonBody(request))
    const selected = input.purpose === 'send' ? sendOauth : oauth
    if (!selected) throw new ApiError('connection_oauth_disabled', 503)
    if (input.purpose === 'send' && !input.reconnectId) throw new ApiError('connection_required')
    return Response.json(await selected.begin(owner, hash, clock(), input.reconnectId))
  }
  if (request.method === 'POST' && path === '/v1/connections/oauth/complete') {
    const input = z.object({ callbackUrl: z.string().url().max(16_384) }).strict().parse(await jsonBody(request))
    const selected = sendOauth && await sendOauth.matches(owner, hash, input.callbackUrl, clock()) ? sendOauth : oauth
    if (!selected) throw new ApiError('connection_oauth_disabled', 503)
    return Response.json(await selected.complete(owner, hash, input.callbackUrl, clock()))
  }
  const revoke = /^\/v1\/connections\/([a-zA-Z0-9_-]{1,128})\/revoke$/u.exec(path)
  if (revoke && request.method === 'POST') {
    z.object({}).strict().parse(await jsonBody(request))
    const commitGuard = guard()
    // AIDEV-NOTE: One transaction disables matching mailbox access and tombstones tokens, invalidating sync and token CAS.
    const result = await db.batch([
      db.prepare(`UPDATE mailboxes SET connected=0,send_enabled=0,ai_read=0,ai_draft=0,ai_send=0
        WHERE owner=? AND EXISTS(SELECT 1 FROM provider_credentials c WHERE c.owner=mailboxes.owner
        AND c.id=? AND c.provider=mailboxes.provider AND c.subject=mailboxes.subject) AND ${active}`)
        .bind(owner, revoke[1]!, ...commitGuard),
      db.prepare(`UPDATE provider_credentials SET sealed=NULL,revision=revision+1 WHERE owner=? AND id=? AND ${active}`)
        .bind(owner, revoke[1]!, ...commitGuard),
    ])
    if (!result[1]!.meta.changes) throw new ApiError('connection_not_found', 404)
    return Response.json({ revoked: true })
  }
  const permission = /^\/v1\/connections\/([a-zA-Z0-9_-]{1,128})\/mailboxes\/([a-zA-Z0-9_-]{1,128})\/permissions$/u.exec(path)
  if (permission && request.method === 'PATCH') {
    const input = z.object({ aiRead: z.boolean(), aiDraft: z.boolean() }).strict().parse(await jsonBody(request))
    // AIDEV-NOTE: Selection cannot reconnect a mailbox, grant send, or attach an arbitrary mailbox to a credential.
    const result = await db.prepare(`UPDATE mailboxes SET ai_read=?,ai_draft=? WHERE owner=? AND id=? AND connected=1
      AND EXISTS(SELECT 1 FROM provider_credentials c WHERE c.owner=mailboxes.owner AND c.id=?
      AND c.provider=mailboxes.provider AND c.subject=mailboxes.subject AND c.sealed IS NOT NULL) AND ${active}`)
      .bind(Number(input.aiRead), Number(input.aiDraft), owner, permission[2]!, permission[1]!, ...guard()).run()
    if (!result.meta.changes) throw new ApiError('connection_mailbox_not_found', 404)
    return Response.json({ updated: true })
  }
  return null
}
