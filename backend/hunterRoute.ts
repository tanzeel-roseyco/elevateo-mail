import { z } from 'zod'
import { ApiError, jsonBody, type AuthenticatedSession } from './core'
import { hunterKey, hunterMetadata, hunterRevision, revokeHunter } from './hunterCredentials'
import type { HunterRuntime } from './hunterConfig'

// AIDEV-NOTE: Mount after auth/CSRF/account binding; metadata/revocation never need a decryptable key.
export async function hunterRoute(request: Request, path: string, session: AuthenticatedSession, db: D1Database,
  runtimeSource: () => Promise<HunterRuntime | undefined>, now = Date.now()): Promise<Response | null> {
  if (!['/v1/hunter/status', '/v1/hunter/connection', '/v1/hunter/connection/revoke', '/v1/hunter/enrich'].includes(path)) return null
  if (new URL(request.url).search) throw new ApiError('validation_failed')
  const started = performance.now(), owner = session.owner
  const clock = () => now + Math.ceil(performance.now() - started)
  const guard = { tokenHash: session.token_hash, now: clock }
  const active = async () => {
    if (!await db.prepare('SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?')
      .bind(owner, guard.tokenHash, clock()).first()) throw new ApiError('unauthorized', 401)
  }
  const respond = (value: unknown) => Response.json(value, { headers: { 'cache-control': 'no-store' } })
  await active()
  if (path === '/v1/hunter/connection' && request.method === 'GET') return respond({ connection: await hunterMetadata(db, owner) })
  if (path === '/v1/hunter/connection/revoke' && request.method === 'POST') {
    const body = z.object({ revision: hunterRevision }).strict().parse(await jsonBody(request))
    await revokeHunter(db, owner, body.revision, guard)
    return respond({ connection: await hunterMetadata(db, owner) })
  }
  const runtime = await runtimeSource()
  if (path === '/v1/hunter/status' && request.method === 'GET') return respond({ enabled: Boolean(runtime) })
  if (request.method !== 'POST' || path === '/v1/hunter/status') throw new ApiError('method_not_allowed', 405)
  if (!runtime) throw new ApiError('hunter_disabled', 503)
  if (path === '/v1/hunter/connection') {
    const body = z.object({ apiKey: hunterKey, revision: hunterRevision.nullable() }).strict().parse(await jsonBody(request))
    await runtime.vault.save(owner, body.apiKey, body.revision, guard)
    return respond({ connection: await hunterMetadata(db, owner) })
  }
  const body = z.object({ email: z.email().max(254), acknowledgeCreditUse: z.literal(true) }).strict().parse(await jsonBody(request))
  await active()
  const contact = await db.prepare('SELECT email FROM contacts WHERE owner=? AND email=?').bind(owner, body.email).first()
  if (!contact) throw new ApiError('contact_not_found', 404)
  const credential = await runtime.vault.read(owner)
  await active()
  const profile = await runtime.lookup(body.email, credential.apiKey)
  // AIDEV-NOTE: A removed contact, revoked key or expired session must not expose a late provider result.
  await active()
  if (!await db.prepare(`SELECT 1 FROM hunter_credentials h JOIN contacts c ON c.owner=h.owner
    WHERE h.owner=? AND h.revision=? AND h.sealed IS NOT NULL AND c.email=?`)
    .bind(owner, credential.revision, body.email).first()) throw new ApiError('connection_changed', 409)
  return respond({ profile, source: 'hunter' })
}
