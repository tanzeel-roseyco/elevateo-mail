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
export const sessionCookieName = '__Host-elevateo_session'
export type AuthenticatedSession = { owner: string; expires_at: number; token_hash: string }

// AIDEV-NOTE: Cookies require same-origin mutation proof; bearer compatibility is for non-browser tooling.
export async function authenticateSession(request: Request, db: D1Database, now: number): Promise<AuthenticatedSession> {
  const authorization = request.headers.get('authorization')
  const cookies = (request.headers.get('cookie') ?? '').split(';').map(value => value.trim())
    .filter(value => value.startsWith(sessionCookieName + '='))
  if (cookies.length > 1 || (cookies.length && authorization)) throw new ApiError('unauthorized', 401)
  let token: string
  if (cookies.length) {
    token = cookies[0]!.slice(sessionCookieName.length + 1)
    const site = request.headers.get('sec-fetch-site')
    const origin = request.headers.get('origin')
    const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(request.method)
    if ((site && site !== 'same-origin' && site !== 'none') ||
      (origin !== null && origin !== new URL(request.url).origin) ||
      (unsafe && (origin !== new URL(request.url).origin || request.headers.get('x-elevateo-csrf') !== '1'))) {
      throw new ApiError('csrf_failed', 403)
    }
  } else {
    if (request.headers.has('sec-fetch-site') || !authorization || !/^Bearer [a-zA-Z0-9_-]{32,256}$/u.test(authorization)) {
      throw new ApiError('unauthorized', 401)
    }
    token = authorization.slice(7)
  }
  if (!/^[a-zA-Z0-9_-]{32,256}$/u.test(token)) throw new ApiError('unauthorized', 401)
  const session = await db.prepare('SELECT owner,expires_at,token_hash FROM sessions WHERE token_hash=? AND expires_at>?')
    .bind(await sha256(token), now).first<AuthenticatedSession>()
  if (!session) throw new ApiError('unauthorized', 401)
  const expectedAccount = request.headers.get('x-elevateo-account')
  // AIDEV-NOTE: Bind tab requests to /me identity before any mutation; cookies may change in another tab.
  // /me is the explicit refresh boundary. Headerless non-browser fixtures retain bearer compatibility.
  if (expectedAccount !== null && !(request.method === 'GET' && new URL(request.url).pathname === '/v1/me')) {
    if (!/^[a-f0-9]{32}$/u.test(expectedAccount)) throw new ApiError('unauthorized', 401)
    const account = await db.prepare('SELECT account_id FROM accounts WHERE owner=?')
      .bind(session.owner).first<{ account_id: string }>()
    if (account?.account_id !== expectedAccount) throw new ApiError('unauthorized', 401)
  }
  return session
}
export async function authenticate(request: Request, db: D1Database, now: number): Promise<string> {
  return (await authenticateSession(request, db, now)).owner
}
