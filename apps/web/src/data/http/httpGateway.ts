import type { MailroomGateway, PageQuery, ReadContext, ThreadFilter } from '../gateway'
import { MAX_BYTES, MailboxPageSchema, SessionSchema, ThreadDetailPageSchema, ThreadPageSchema } from '../contract'
import { requestJson, type FetchLike } from './transport'

function contextHeaders(ctx: ReadContext): Record<string, string> {
  return { 'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion }
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value))
  const encoded = search.toString()
  return encoded === '' ? '' : `?${encoded}`
}

/** Production gateway. Fixture code must never be imported from this module graph. */
export function createHttpGateway(fetchImpl?: FetchLike): MailroomGateway {
  const base = fetchImpl === undefined ? {} : { fetchImpl }
  return {
    getSession(signal) {
      return requestJson('/v1/session', SessionSchema, MAX_BYTES.session, { ...base, signal })
    },
    listMailboxes(ctx, q: PageQuery, signal) {
      return requestJson(`/v1/mailboxes${query({ cursor: q.cursor, limit: q.limit })}`, MailboxPageSchema, MAX_BYTES.mailboxes, { ...base, headers: contextHeaders(ctx), signal })
    },
    listThreads(ctx, mailboxId, q: PageQuery & { filter?: ThreadFilter }, signal) {
      return requestJson(
        `/v1/mailboxes/${encodeURIComponent(mailboxId)}/threads${query({ cursor: q.cursor, limit: q.limit, filter: q.filter })}`,
        ThreadPageSchema,
        MAX_BYTES.threads,
        { ...base, headers: contextHeaders(ctx), signal },
      )
    },
    getThread(ctx, threadId, mailboxId, q: PageQuery, signal) {
      return requestJson(
        `/v1/threads/${encodeURIComponent(threadId)}${query({ mailbox_id: mailboxId, cursor: q.cursor, limit: q.limit })}`,
        ThreadDetailPageSchema,
        MAX_BYTES.thread,
        { ...base, headers: contextHeaders(ctx), signal },
      )
    },
  }
}
