import { extractReplyHeaders } from '../gmailReply'
import { z } from 'zod'
import { ApiError, idSchema } from '../core'
import { GmailCursorExpired, type GmailSyncProvider, type GmailSyncRequest } from '../gmailSync'
import type { ProviderFetch } from './http'
import { gmailRequest } from './gmailHttp'

const cursor = z.string().regex(/^\d+$/u).max(128)
const pageToken = z.string().min(1).max(2048)
const requestSchema = z.object({ subject: z.string().min(1).max(256), mode: z.enum(['full', 'history']),
  cursor: cursor.nullable(), pageToken: pageToken.nullable(), limit: z.literal(25) }).strict()
const continuation = z.object({ v: z.literal(1), p: pageToken.nullable(), o: z.number().int().min(0).max(5000),
  h: z.string().regex(/^[a-f0-9]{64}$/u).nullable() }).strict()
function encodeContinuation(p: string | null, o = 0, h: string | null = null) {
  return pageToken.parse(JSON.stringify({ v: 1, p, o, h }))
}
const reference = z.object({ id: idSchema })
const listSchema = z.object({ messages: z.array(reference).max(25).optional(), nextPageToken: pageToken.optional() })
const event = z.object({ message: reference })
const historySchema = z.object({ historyId: cursor, nextPageToken: pageToken.optional(), history: z.array(z.object({
  id: cursor, messagesAdded: z.array(event).max(100).optional(), messagesDeleted: z.array(event).max(100).optional(),
})).max(25).optional() })
const partSchema = z.object({ mimeType: z.string().max(256), filename: z.string().max(1024).optional(),
  body: z.object({ data: z.string().max(65536).optional(), attachmentId: z.string().max(2048).optional() }).optional(),
  parts: z.array(z.unknown()).max(50).optional(), headers: z.array(z.object({
    name: z.string().max(256), value: z.string().max(8192),
  })).max(200).optional() })

// AIDEV-NOTE: Only inline UTF-8/plain ASCII text is indexed; attachments and HTML are never decoded as display content.
function plainText(root: unknown): string {
  const pending = [{ value: root, depth: 0 }]; const texts: string[] = []; let visited = 0
  while (pending.length) {
    const item = pending.pop()!
    if (++visited > 50 || item.depth > 10) throw new ApiError('gmail_mime_limit', 502)
    const part = partSchema.parse(item.value)
    if (part.filename) continue
    if (part.mimeType.toLowerCase() === 'text/plain') {
      if (part.body?.attachmentId) throw new ApiError('gmail_body_attachment_unsupported', 502)
      const type = part.headers?.find(header => header.name.toLowerCase() === 'content-type')?.value ?? ''
      const charset = /charset\s*=\s*"?([^;"\s]+)/iu.exec(type)?.[1]?.toLowerCase()
      if (charset && !['utf-8', 'utf8', 'us-ascii', 'ascii'].includes(charset)) throw new ApiError('gmail_charset_unsupported', 502)
      const encoded = part.body?.data ?? ''
      if (!/^[A-Za-z0-9_-]*={0,2}$/u.test(encoded)) throw new ApiError('gmail_body_invalid', 502)
      try { texts.push(new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(
        atob(encoded.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0)))) }
      catch { throw new ApiError('gmail_body_invalid', 502) }
    }
    for (const child of [...(part.parts ?? [])].reverse()) pending.push({ value: child, depth: item.depth + 1 })
  }
  // AIDEV-NOTE: No plain-text part is unsupported, whereas a present but empty text/plain part is valid mail.
  if (texts.length === 0) throw new ApiError('gmail_plaintext_missing', 502)
  return texts.join('\n')
}
function messageFrom(raw: unknown, expectedId: string) {
  const message = z.object({ id: z.literal(expectedId), threadId: idSchema,
    labelIds: z.array(z.string().max(256)).max(100).default([]),
    // AIDEV-NOTE: Quarantine timestamps outside Date's range before they can poison inbox rendering.
    internalDate: z.string().regex(/^\d+$/u).transform(Number).pipe(z.number().int().nonnegative().max(8_640_000_000_000_000)), payload: partSchema }).parse(raw)
  const headers = message.payload.headers ?? []
  const from = headers.find(header => header.name.toLowerCase() === 'from')?.value ?? ''
  const sender = z.email().max(254).parse((/<([^<>]+)>\s*$/u.exec(from)?.[1] ?? from).trim())
  const subject = z.string().max(998).parse(headers.find(header => header.name.toLowerCase() === 'subject')?.value ?? '')
  // AIDEV-NOTE: Incremental notifications must exclude sent/archive mail; absence of labels fails closed.
  const replyHeaders = extractReplyHeaders(headers)
  return { id: message.id, threadId: message.threadId, sender, subject, body: plainText(message.payload), at: message.internalDate,
    ...(replyHeaders ? { replyHeaders } : {}),
    ...(message.labelIds.includes('INBOX') ? { inbox: true } : {}) }
}

// AIDEV-NOTE: Caller binds token and subject from the same vault revision; requests can never select a remote host/user.
export class GmailReadProvider implements GmailSyncProvider {
  constructor(private readonly accessToken: string, private readonly subject: string,
    private readonly fetcher: ProviderFetch = fetch) {
    z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u).parse(accessToken)
    z.string().min(1).max(256).parse(subject)
  }
  private async get(path: string, params: Record<string, string> = {}, allowOversized = false) {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`)
    url.search = new URLSearchParams(params).toString()
    const response = await gmailRequest(this.fetcher, url.href, this.accessToken)
    if (!response) throw new ApiError('gmail_response_unavailable', 502)
    if (response.status === 401) throw new ApiError('gmail_credentials_expired', 401)
    if (response.status !== 200 && response.status !== 404) throw new ApiError('gmail_request_failed', 502)
    if (response.oversized && !allowOversized) throw new ApiError('gmail_response_too_large', 502)
    return response
  }
  async read(input: GmailSyncRequest): Promise<unknown> {
    try { return await this.page(input) }
    catch (error) {
      if (error instanceof ApiError || error instanceof GmailCursorExpired) throw error
      throw new ApiError('gmail_response_invalid', 502)
    }
  }
  private async page(input: GmailSyncRequest) {
    const request = requestSchema.parse(input)
    if (request.subject !== this.subject || (request.mode === 'history' && !request.cursor) ||
      (request.pageToken && !request.cursor)) throw new ApiError('gmail_sync_request_invalid')
    let watermark = request.cursor
    const changes = new Map<string, 'added' | 'deleted'>(); let next: string | null; let offset = 0
    if (request.mode === 'full') {
      // AIDEV-NOTE: Capture before listing; later history replay closes changes that occur during the full scan.
      if (!watermark) {
        const profile = await this.get('profile')
        if (profile.status !== 200) throw new ApiError('gmail_profile_unavailable', 502)
        watermark = z.object({ historyId: cursor }).parse(profile.body).historyId
      }
      const response = await this.get('messages', { maxResults: '25', includeSpamTrash: 'true',
        ...(request.pageToken ? { pageToken: request.pageToken } : {}) })
      if (response.status !== 200) throw new ApiError('gmail_list_unavailable', 502)
      const page = listSchema.parse(response.body); next = page.nextPageToken ?? null
      for (const message of page.messages ?? []) changes.set(message.id, 'added')
    } else {
      const resume = request.pageToken ? continuation.parse(JSON.parse(request.pageToken)) : { p: null, o: 0, h: null }
      const response = await this.get('history', { startHistoryId: request.cursor!, maxResults: '25',
        ...(resume.p ? { pageToken: resume.p } : {}) })
      if (response.status === 404) throw new GmailCursorExpired()
      const page = historySchema.parse(response.body); next = page.nextPageToken ? encodeContinuation(page.nextPageToken) : null; watermark = page.historyId
      const records = [...(page.history ?? [])].sort((a, b) => BigInt(a.id) < BigInt(b.id) ? -1 : BigInt(a.id) > BigInt(b.id) ? 1 : 0)
      for (const record of records) {
        for (const item of record.messagesAdded ?? []) changes.set(item.message.id, 'added')
        for (const item of record.messagesDeleted ?? []) changes.set(item.message.id, 'deleted')
      }
      // AIDEV-NOTE: Persist only offset/token/hash; refetch and fingerprint the bounded page before resuming its changes.
      // AIDEV-NOTE: The mailbox's current historyId can advance without changing this page; exclude that watermark.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([
        request.cursor, resume.p, page.nextPageToken ?? null, [...changes],
      ])))
      const hash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
      offset = resume.o
      if ((offset > 0 && resume.h !== hash) || offset > changes.size) throw new GmailCursorExpired()
      if (offset + 25 < changes.size) next = encodeContinuation(resume.p, offset + 25, hash)
    }
    const messages: ReturnType<typeof messageFrom>[] = []; const deleted: string[] = []
    const incomplete: { id: string; reason: 'message_content_unsupported' }[] = []
    for (const [id, kind] of [...changes].slice(offset, offset + 25)) {
      if (kind === 'deleted') { deleted.push(id); continue }
      const response = await this.get(`messages/${encodeURIComponent(id)}`, { format: 'full' }, true)
      if (response.status === 404) { if (request.mode === 'history') deleted.push(id); continue }
      if (response.oversized) { incomplete.push({ id, reason: 'message_content_unsupported' }); continue }
      // AIDEV-NOTE: Permanent content failures are durable issues, not a poison pill that stalls the entire mailbox.
      try { messages.push(messageFrom(response.body, id)) }
      catch (error) {
        if (!(error instanceof z.ZodError) && !(error instanceof ApiError)) throw error
        incomplete.push({ id, reason: 'message_content_unsupported' })
      }
    }
    return { messages, deleted, cursor: watermark, next, ...(incomplete.length ? { incomplete } : {}) }
  }
}
