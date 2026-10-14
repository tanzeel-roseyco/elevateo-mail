import { z } from 'zod'
import type { FetchLike } from './http/transport'
import { requestJson } from './http/transport'
import { GatewayError } from './errors'
import { CollaborationErrorSchema } from './contract'
import type { ReadContext } from './gateway'

const id = z.uuid()
const summary = z.strictObject({
  id,
  filename: z.string().min(1).max(255).refine((value) => value === value.trim() &&
    value !== '.' && value !== '..' && new TextEncoder().encode(value).byteLength <= 255 &&
    Array.from(value).every((character) => {
      const code = character.codePointAt(0)
      return code !== undefined && code >= 32 && code !== 127 && character !== '/' && character !== '\\'
    })),
  content_type: z.enum(['application/pdf', 'image/png', 'image/jpeg', 'text/plain']),
  byte_size: z.number().int().min(0).max(10 * 1024 * 1024),
  scan_status: z.enum(['pending_scan', 'clean', 'malware', 'scan_failed', 'rejected']),
}).refine((item) => item.scan_status === 'rejected' ? item.byte_size === 0 : item.byte_size > 0)
export const InboxAttachmentPageSchema = z.strictObject({
  items: z.array(summary).max(50), next_cursor: id.nullable(),
})

const segment = (value: string): string => encodeURIComponent(id.parse(value))
const scopePath = (mailboxId: string, threadId: string, messageId: string): string =>
  `/v2/mailboxes/${segment(mailboxId)}/threads/${segment(threadId)}/messages/${segment(messageId)}/attachments`
const headers = (ctx: ReadContext): Record<string, string> => ({
  'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion,
})
const maxBytes = 10 * 1024 * 1024

/** Prepared private read port. The production shell does not inject it until the Rails routes are accepted. */
export function createV2AttachmentGateway(fetchImpl: FetchLike = fetch) {
  return {
    listInboxAttachments(ctx: ReadContext, mailboxId: string, threadId: string, messageId: string,
      query: { cursor?: string; limit: number }, signal: AbortSignal) {
      if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) {
        throw new GatewayError('transport', 'malformed', 'Invalid attachment page limit.')
      }
      const params = new URLSearchParams({ limit: String(query.limit) })
      if (query.cursor !== undefined) params.set('cursor', id.parse(query.cursor))
      return requestJson(`${scopePath(mailboxId, threadId, messageId)}?${params}`, InboxAttachmentPageSchema, 65_536,
        { fetchImpl, errorSchema: CollaborationErrorSchema, headers: headers(ctx), signal })
    },
    async downloadCleanInboxAttachment(ctx: ReadContext, mailboxId: string, threadId: string, messageId: string,
      attachmentId: string, signal: AbortSignal): Promise<Blob> {
      const path = `${scopePath(mailboxId, threadId, messageId)}/${segment(attachmentId)}/content`
      const timeout = AbortSignal.timeout(10_000)
      const combined = AbortSignal.any([signal, timeout])
      let response: Response
      try {
        response = await fetchImpl(path, { method: 'GET', headers: headers(ctx), credentials: 'same-origin',
          cache: 'no-store', redirect: 'manual', signal: combined })
      } catch {
        const code = timeout.aborted ? 'timeout' : signal.aborted ? 'aborted' : 'network'
        throw new GatewayError('transport', code, 'Attachment download failed.')
      }
      if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
        void response.body?.cancel().catch(() => undefined)
        throw new GatewayError('transport', 'redirected', 'Attachment download redirected.')
      }
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => undefined)
        const code = response.status === 401 ? 'unauthenticated' :
          response.status === 404 || response.status === 423 ? 'not_available' : 'temporarily_unavailable'
        throw new GatewayError('api', code, 'Attachment unavailable.', { status: response.status })
      }
      const length = response.headers.get('Content-Length')
      if (response.headers.get('Content-Type') !== 'application/octet-stream' ||
        response.headers.get('Cache-Control') !== 'no-store' ||
        response.headers.get('X-Content-Type-Options') !== 'nosniff' ||
        !response.headers.get('Content-Disposition')?.startsWith('attachment; filename=') ||
        !length || !/^[1-9][0-9]*$/.test(length) || Number(length) > maxBytes || !response.body) {
        void response.body?.cancel().catch(() => undefined)
        throw new GatewayError('transport', 'malformed', 'Attachment response was invalid.')
      }
      const reader = response.body.getReader()
      const chunks: ArrayBuffer[] = []
      let received = 0
      let complete = false
      try {
        for (;;) {
          const part = await reader.read()
          if (part.done) { complete = true; break }
          received += part.value.byteLength
          if (received > maxBytes) throw new GatewayError('transport', 'oversized', 'Attachment exceeded its size limit.')
          chunks.push(new Uint8Array(part.value).buffer)
        }
      } catch (error) {
        if (error instanceof GatewayError) throw error
        const code = timeout.aborted ? 'timeout' : signal.aborted ? 'aborted' : 'network'
        throw new GatewayError('transport', code, 'Attachment download failed.')
      } finally {
        if (!complete) void reader.cancel().catch(() => undefined)
        reader.releaseLock()
      }
      if (received !== Number(length)) throw new GatewayError('transport', 'malformed', 'Attachment length changed.')
      return new Blob(chunks, { type: 'application/octet-stream' })
    },
  }
}
