import { z } from 'zod'
import { ApiError, idSchema } from './core'
import { ingestResendEvent } from './resendEvents'

const endpointId = z.string().regex(/^[A-Za-z0-9_-]{24,128}$/u)
export const resendWebhookSecret = z.string().max(512).regex(/^whsec_[A-Za-z0-9+/]+={0,2}$/u).refine(value => {
  try {
    const encoded = value.slice(6), decoded = atob(encoded)
    return decoded.length >= 16 && decoded.length <= 128 &&
      btoa(decoded).replace(/=+$/u, '') === encoded.replace(/=+$/u, '')
  } catch { return false }
})
const endpoints = z.record(endpointId, z.object({ owner: idSchema, credentialId: idSchema, secret: resendWebhookSecret }).strict())
  .refine(value => Object.keys(value).length >= 1 && Object.keys(value).length <= 100)

// AIDEV-NOTE: Only this public route parses webhook secrets; payloads cannot select tenant authority.
function configuredEndpoints(env: unknown) {
  try {
    const raw = z.object({ RESEND_EVENT_ENDPOINTS: z.string().max(90_000).optional() }).parse(env).RESEND_EVENT_ENDPOINTS
    return raw === undefined ? undefined : endpoints.parse(JSON.parse(raw) as unknown)
  } catch { throw new ApiError('resend_event_configuration_invalid', 503) }
}

export async function rawBody(request: Request): Promise<Uint8Array> {
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError('body_required')
  // AIDEV-NOTE: Fixed storage also bounds memory when a sender streams arbitrarily many tiny chunks.
  const buffer = new Uint8Array(65_536)
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return buffer.subarray(0, size)
      if (size + value.byteLength > buffer.byteLength) {
        await reader.cancel()
        throw new ApiError('body_too_large', 413)
      }
      buffer.set(value, size)
      size += value.byteLength
    }
  } finally { reader.releaseLock() }
}

export async function resendEventRoute(request: Request, db: D1Database, env: unknown, now = Date.now()): Promise<Response | undefined> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/v1/resend/events/')) return undefined
  const match = /^\/v1\/resend\/events\/([A-Za-z0-9_-]{24,128})$/u.exec(url.pathname)
  if (!match) throw new ApiError('not_found', 404)
  if (request.method !== 'POST') throw new ApiError('method_not_allowed', 405)
  if (url.search) throw new ApiError('validation_failed')
  const map = configuredEndpoints(env)
  const endpoint = map && Object.hasOwn(map, match[1]!) ? map[match[1]!] : undefined
  if (!endpoint) throw new ApiError('not_found', 404)
  const result = await ingestResendEvent(db, endpoint, await rawBody(request), {
    id: request.headers.get('svix-id') ?? '', timestamp: request.headers.get('svix-timestamp') ?? '',
    signature: request.headers.get('svix-signature') ?? '',
  }, now)
  return Response.json(result, { headers: { 'cache-control': 'no-store' } })
}
