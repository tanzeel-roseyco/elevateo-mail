import { z } from 'zod'

// AIDEV-NOTE: Safe errors expose stable codes, never SQL, provider payloads or credentials.
export class ApiError extends Error {
  constructor(readonly code: string, readonly status = 400) { super(code) }
}
export const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/u)
export async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('')
}
export async function boundedText(request: Request, limit = 131_072): Promise<string> {
  const reader = request.body?.getReader()
  if (!reader) throw new ApiError('body_required')
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let size = 0
  let result = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) { await reader.cancel(); throw new ApiError('body_too_large', 413) }
      result += decoder.decode(chunk.value, { stream: true })
    }
    return result + decoder.decode()
  } finally { reader.releaseLock() }
}
export async function jsonBody(request: Request): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new ApiError('json_required', 415)
  }
  try { return JSON.parse(await boundedText(request)) as unknown }
  catch (error) { if (error instanceof ApiError) throw error; throw new ApiError('invalid_json') }
}
export async function authenticate(request: Request, db: D1Database, now: number): Promise<string> {
  const header = request.headers.get('authorization') ?? ''
  if (!/^Bearer [a-zA-Z0-9_-]{32,256}$/u.test(header)) throw new ApiError('unauthorized', 401)
  const session = await db.prepare('SELECT owner FROM sessions WHERE token_hash=? AND expires_at>?')
    .bind(await sha256(header.slice(7)), now).first<{ owner: string }>()
  if (!session) throw new ApiError('unauthorized', 401)
  return session.owner
}
