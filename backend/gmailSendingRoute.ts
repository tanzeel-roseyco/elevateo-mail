import { z } from 'zod'
import { ApiError, jsonBody, type AuthenticatedSession } from './core'
import type { GmailRuntime } from './gmailConfig'

export const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send'
// AIDEV-NOTE: Disabling needs no decryption; enabling binds verified scopes to the exact credential revision.
export async function gmailSendingRoute(request: Request, path: string, session: AuthenticatedSession,
  db: D1Database, runtime: () => Promise<GmailRuntime | undefined>, now = Date.now()): Promise<Response | null> {
  const match = /^\/v1\/mailboxes\/([a-zA-Z0-9_-]{1,128})\/gmail-sending$/u.exec(path)
  if (!match) return null
  if (new URL(request.url).search) throw new ApiError('validation_failed')
  const start = performance.now()
  const clock = () => now + Math.ceil(performance.now() - start)
  const mailbox = await db.prepare("SELECT subject,send_enabled FROM mailboxes WHERE owner=? AND id=? AND provider='gmail'")
    .bind(session.owner, match[1]).first<{ subject: string; send_enabled: number }>()
  if (!mailbox) throw new ApiError('mailbox_not_found', 404)
  if (!['GET', 'POST'].includes(request.method)) throw new ApiError('method_not_allowed', 405)
  const input = request.method === 'POST' ? z.object({ enabled: z.boolean() }).strict().parse(await jsonBody(request)) : undefined
  const guard = 'EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)'
  if (input?.enabled === false) {
    const result = await db.prepare(`UPDATE mailboxes SET send_enabled=0,ai_send=0 WHERE owner=? AND id=? AND ${guard}`)
      .bind(session.owner, match[1], session.owner, session.token_hash, clock()).run()
    if (!result.meta.changes) throw new ApiError('unauthorized', 401)
    return Response.json({ enabled: false })
  }
  const services = await runtime()
  const connection = await db.prepare("SELECT id FROM provider_credentials WHERE owner=? AND provider='gmail' AND subject=? AND sealed IS NOT NULL")
    .bind(session.owner, mailbox.subject).first<{ id: string }>()
  const credential = services && connection ? await services.vault.read(session.owner, connection.id) : undefined
  const authorized = Boolean(credential?.credential.scopes.includes(gmailSendScope))
  const available = Boolean(services?.sendOauth)
  if (!input) return Response.json({ enabled: mailbox.send_enabled === 1, authorized, available, connectionId: connection?.id ?? null })
  if (!available || !authorized || !credential || !connection) throw new ApiError('gmail_sending_unavailable', 409)
  // AIDEV-NOTE: The upsert and permission transition share one batch; reconnect/refresh races fail closed.
  const committed = await db.batch([
    db.prepare(`INSERT INTO gmail_send_permissions(owner,mailbox_id,credential_id,grant_epoch)
      SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM provider_credentials WHERE owner=? AND id=? AND revision=? AND sealed IS NOT NULL)
      AND ${guard} ON CONFLICT(owner,mailbox_id) DO UPDATE SET credential_id=excluded.credential_id,grant_epoch=excluded.grant_epoch`)
      .bind(session.owner, match[1], connection.id, credential.grantEpoch, session.owner, connection.id, credential.revision,
        session.owner, session.token_hash, clock()),
    db.prepare(`UPDATE mailboxes SET send_enabled=1 WHERE owner=? AND id=? AND connected=1 AND verified=1 AND ${guard}
      AND EXISTS(SELECT 1 FROM gmail_send_permissions g JOIN provider_credentials c ON c.owner=g.owner AND c.id=g.credential_id
        WHERE g.owner=mailboxes.owner AND g.mailbox_id=mailboxes.id AND c.id=? AND c.revision=?
        AND g.grant_epoch=c.grant_epoch AND c.provider='gmail' AND c.subject=mailboxes.subject AND c.sealed IS NOT NULL)`)
      .bind(session.owner, match[1], session.owner, session.token_hash, clock(), connection.id, credential.revision),
  ])
  // AIDEV-NOTE: D1 counts permission-generation trigger writes too; any positive change means admission succeeded.
  if (!committed[1]?.meta.changes) throw new ApiError('connection_changed', 409)
  return Response.json({ enabled: true })
}
