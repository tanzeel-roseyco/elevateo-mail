import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { z } from 'zod'
import { ApiError, jsonBody, sessionCookieName, sha256 } from '../core'
import type { bootstrap } from './bootstrap'

const sessionsSchema = z.object({ alice: z.string().regex(/^[a-zA-Z0-9_-]{32,256}$/u),
  bob: z.string().regex(/^[a-zA-Z0-9_-]{32,256}$/u), expiresAt: z.number().int().positive() }).strict()
const provisionSchema = z.object({ user: z.enum(['alice', 'bob']) }).strict()

// AIDEV-NOTE: This Docker-only proxy issues cookies; its synthetic identity route is absent from Worker bundles.
export async function startBrowserFixture(local: Awaited<ReturnType<typeof bootstrap>>, tokenfile: string, port = 0) {
  if (!existsSync('/.dockerenv')) throw new Error('Browser fixture must run inside Docker')
  const sessions = sessionsSchema.parse(JSON.parse(await readFile(tokenfile, 'utf8')) as unknown)
  const server = createServer((incoming, outgoing) => {
    void handle(incoming, outgoing).catch(() => {
      if (!outgoing.headersSent) outgoing.writeHead(500, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      outgoing.end(JSON.stringify({ error: 'fixture_failure' }))
    })
  })
  async function handle(incoming: IncomingMessage, outgoing: ServerResponse) {
    try {
      const host = incoming.headers.host ?? ''
      if (!/^(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/u.test(host)) throw new ApiError('fixture_host_rejected', 403)
      const url = new URL(incoming.url ?? '/', 'http://' + host)
      const method = incoming.method ?? 'GET'
      const headers = new Headers()
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) for (const item of value) headers.append(name, item)
        else if (value !== undefined) headers.set(name, value)
      }
      const chunks: Buffer[] = []
      let length = 0
      for await (const chunk of incoming) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
        length += bytes.byteLength
        if (length > 131_072) throw new ApiError('body_too_large', 413)
        chunks.push(bytes)
      }
      let body: string | undefined
      try { body = length ? new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)) : undefined }
      catch { throw new ApiError('invalid_json') }
      const request = new Request(url, { method, headers, ...(body !== undefined ? { body } : {}) })
      if (url.pathname === '/__fixture/session') {
        if (url.search) throw new ApiError('invalid_input')
        if (method !== 'POST') throw new ApiError('method_not_allowed', 405)
        const site = headers.get('sec-fetch-site')
        if (headers.get('origin') !== url.origin || headers.get('x-elevateo-csrf') !== '1' ||
          (site && site !== 'same-origin' && site !== 'none')) throw new ApiError('csrf_failed', 403)
        const input = provisionSchema.parse(await jsonBody(request))
        const session = await local.env.DB.prepare('SELECT expires_at FROM sessions WHERE token_hash=? AND owner=? AND expires_at>?')
          .bind(await sha256(sessions[input.user]), input.user, Date.now()).first<{ expires_at: number }>()
        if (!session) throw new ApiError('fixture_session_expired', 401)
        const remaining = Math.floor((Math.min(sessions.expiresAt, session.expires_at) - Date.now()) / 1000)
        if (remaining <= 0) throw new ApiError('fixture_session_expired', 401)
        // Cookies expire with their D1 sessions; a reconnect never silently refreshes or revives a revoked session.
        outgoing.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store',
          'set-cookie': `${sessionCookieName}=${sessions[input.user]}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${remaining}` })
        outgoing.end(JSON.stringify({ provisioned: true, simulated: true }))
        return
      }
      if (!url.pathname.startsWith('/v1/')) throw new ApiError('not_found', 404)
      // Preserve the browser-visible origin, including a same-origin development proxy's Host header.
      const response = await local.mf.dispatchFetch(url.toString(), { method, headers: Object.fromEntries(headers),
        ...(body !== undefined ? { body } : {}) })
      const responseHeaders: Record<string, string> = {}
      response.headers.forEach((value, name) => { responseHeaders[name] = value })
      outgoing.writeHead(response.status, responseHeaders)
      outgoing.end(Buffer.from(await response.arrayBuffer()))
    } catch (error) {
      const known = error instanceof ApiError ? error : error instanceof z.ZodError ? new ApiError('invalid_input') : null
      if (!known) throw error
      outgoing.writeHead(known.status, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      outgoing.end(JSON.stringify({ error: known.code }))
    }
  }
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '0.0.0.0', () => { server.removeListener('error', reject); resolve() })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Fixture socket unavailable')
  return { url: `http://localhost:${address.port}`, close: () => new Promise<void>((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve())
    server.closeIdleConnections()
  }) }
}
