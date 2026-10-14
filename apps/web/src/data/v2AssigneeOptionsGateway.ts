import type { FetchLike } from './http/transport'
import { requestJson } from './http/transport'
import { GatewayError } from './errors'
import { CollaborationErrorSchema } from './contract'
import { IdSchema, MailboxAssigneeOptionPageSchema } from './v2Contract'
import type { ReadContext } from './gateway'

/** Prepared V2 read adapter. The route is inactive until its SQL authority and controller pass fleet gates. */
export function createV2AssigneeOptionsGateway(fetchImpl?: FetchLike) {
  return {
    async listMailboxAssigneeOptions(ctx: ReadContext, mailboxId: string,
      query: { cursor?: string; limit?: number }, signal: AbortSignal) {
      const id = IdSchema.parse(mailboxId)
      const params = new URLSearchParams()
      if (query.limit !== undefined) {
        if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 50) {
          throw new GatewayError('transport', 'malformed', 'Invalid assignee option limit.')
        }
        params.set('limit', String(query.limit))
      }
      if (query.cursor !== undefined) {
        if (query.cursor.length < 1 || query.cursor.length > 2048) {
          throw new GatewayError('transport', 'malformed', 'Invalid assignee option cursor.')
        }
        params.set('cursor', query.cursor)
      }
      const encoded = params.toString()
      const suffix = encoded === '' ? '' : `?${encoded}`
      const base = fetchImpl === undefined ? {} : { fetchImpl }
      const page = await requestJson(`/v2/mailboxes/${encodeURIComponent(id)}/assignee-options${suffix}`,
        MailboxAssigneeOptionPageSchema, 16_384, {
          ...base, errorSchema: CollaborationErrorSchema, signal,
          headers: { 'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion },
        })
      if (page.context_id !== ctx.contextId || page.authorization_version !== ctx.authorizationVersion || page.mailbox_id !== id) {
        throw new GatewayError('transport', 'malformed', 'Assignee options changed scope.')
      }
      return page
    },
  }
}
