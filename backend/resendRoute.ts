import { z } from 'zod'
import { ApiError, idSchema, jsonBody, type AuthenticatedSession } from './core'
import { admitResendSender } from './resendAdmission'
import { resendCredentialMetadata, revokeResendCredential } from './resendCredentials'
import type { ResendRuntime } from './resendConfig'

const revision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
const key = z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u)
// AIDEV-NOTE: Worker must authenticate CSRF/account binding first; guards cover session expiry during provider reads.
export async function resendRoute(request: Request, path: string, session: AuthenticatedSession,
  db: D1Database, runtimeSource?: ResendRuntime | (() => Promise<ResendRuntime | undefined>), now = Date.now()): Promise<Response | null> {
  const base = '/v1/resend/connections'
  const match = /^\/v1\/resend\/connections\/([a-zA-Z0-9_-]{1,128})(\/sender|\/replace|\/revoke)?$/u.exec(path)
  if (path !== '/v1/resend/status' && path !== base && !match) return null
  if (new URL(request.url).search) throw new ApiError('validation_failed')
  const started = performance.now()
  const clock = () => now + Math.ceil(performance.now() - started)
  const owner = idSchema.parse(session.owner)
  const tokenHash = z.string().regex(/^[a-f0-9]{64}$/u).parse(session.token_hash)
  const active = async () => {
    if (!await db.prepare('SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?')
      .bind(owner, tokenHash, clock()).first()) throw new ApiError('unauthorized', 401)
  }
  const respond = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
  await active()
  const resolveRuntime = () => typeof runtimeSource === 'function' ? runtimeSource() : runtimeSource
  if (path === '/v1/resend/status') {
    if (request.method !== 'GET') throw new ApiError('method_not_allowed', 405)
    return respond({ enabled: Boolean(await resolveRuntime()) })
  }
  const id = match?.[1]
  if (request.method === 'GET' && !match?.[2]) {
    if (id) return respond(await resendCredentialMetadata(db, owner, id))
    // AIDEV-NOTE: Credentials cap is ten including tombstones; select metadata explicitly, never sealed material.
    const result = await db.prepare('SELECT id,revision,sealed IS NULL AS revoked FROM resend_credentials WHERE owner=? ORDER BY id LIMIT 10')
      .bind(owner).all()
    return respond({ connections: result.results })
  }
  const guard = { tokenHash, now: clock }
  if (id && match?.[2] === '/revoke' && request.method === 'POST') {
    const body = z.object({ revision }).strict().parse(await jsonBody(request))
    await revokeResendCredential(db, owner, id, body.revision, guard)
    return respond(await resendCredentialMetadata(db, owner, id))
  }
  // AIDEV-NOTE: Only new credentials and domain verification need working encryption configuration.
  const runtime = await resolveRuntime()
  if (!runtime) throw new ApiError('resend_disabled', 503)
  if (path === base && request.method === 'POST') {
    const body = z.object({ apiKey: key }).strict().parse(await jsonBody(request))
    const created = await runtime.vault.create(owner, body, guard)
    return respond(await runtime.vault.metadata(owner, created), 201)
  }
  if (id && match?.[2] === '/sender' && request.method === 'POST') {
    const body = await jsonBody(request)
    await active()
    return respond(await admitResendSender(db, runtime.vault, runtime.verifier, owner, id, body, guard))
  }
  if (id && match?.[2] === '/replace' && request.method === 'POST') {
    const body = z.object({ revision, apiKey: key }).strict().parse(await jsonBody(request))
    await runtime.vault.replace(owner, id, body.revision, { apiKey: body.apiKey }, guard)
    return respond(await runtime.vault.metadata(owner, id))
  }
  throw new ApiError('method_not_allowed', 405)
}
