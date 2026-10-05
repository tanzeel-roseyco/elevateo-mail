import { z } from 'zod'
import { ApiError, idSchema, jsonBody, type AuthenticatedSession } from './core'
import { admitGmailMailbox } from './gmailAdmission'
import { runGmailSyncPage, type GmailRuntimeServices } from './gmailRuntime'
import type { ProviderFetch } from './providers/http'

export type GmailRouteRuntime = GmailRuntimeServices & { fetcher?: ProviderFetch }
// AIDEV-NOTE: Caller authenticates CSRF/account binding; session commit guards also cover slow provider responses.
export async function gmailRoute(request: Request, path: string, session: AuthenticatedSession,
  db: D1Database, runtime?: GmailRouteRuntime, now = Date.now()): Promise<Response | null> {
  const admission = /^\/v1\/connections\/([a-zA-Z0-9_-]{1,128})\/mailbox$/u.exec(path)
  const sync = /^\/v1\/mailboxes\/([a-zA-Z0-9_-]{1,128})\/sync$/u.exec(path)
  if (path !== '/v1/gmail/status' && !admission && !sync) return null
  if (new URL(request.url).search) throw new ApiError('validation_failed')
  const startedAt = performance.now()
  const clock = () => now + Math.ceil(performance.now() - startedAt)
  const owner = idSchema.parse(session.owner)
  const tokenHash = z.string().regex(/^[a-f0-9]{64}$/u).parse(session.token_hash)
  const active = async () => {
    if (!await db.prepare('SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?')
      .bind(owner, tokenHash, clock()).first()) throw new ApiError('unauthorized', 401)
  }
  await active()
  if (path === '/v1/gmail/status') {
    if (request.method !== 'GET') throw new ApiError('method_not_allowed', 405)
    return Response.json({ enabled: Boolean(runtime) })
  }
  if (request.method !== 'POST') throw new ApiError('method_not_allowed', 405)
  z.object({}).strict().parse(await jsonBody(request))
  await active()
  if (!runtime) throw new ApiError('gmail_disabled', 503)
  const guard = { tokenHash, now: clock }
  return Response.json(admission
    ? await admitGmailMailbox(db, runtime.vault, owner, admission[1]!, guard, runtime.fetcher)
    : await runGmailSyncPage(db, owner, sync![1]!, runtime, clock, guard))
}
