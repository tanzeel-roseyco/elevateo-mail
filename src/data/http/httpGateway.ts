import type { SendContent } from '@/domain/sendLifecycle'
import { capabilitiesResponse, createdIntent, intentResponse, isServerId, mailboxPage, messageDetail, messagePage, quotaResponse, savedResponse, toIntent, toMailbox, toMessageBody, toMessagePage, updatedResponse, type ServerMailbox } from './contract'
import { ApiFailure, type HttpClient } from './httpClient'
import type { ServerGateway } from './ports'

// AIDEV-NOTE: HTTP adapter for ServerGateway. Returns DTOs only: it never writes a cache. Only routes named in the
// integration-v1 contract are called; nothing is invented here.

/** Ids go into URL paths, so a value that is not a server id is refused before any request is made. */
function pathId(value: string): string {
  if (!isServerId(value)) throw new ApiFailure('refused', 'That reference is not valid.', 'validation_failed', 400)
  return value
}

/** Historical mailboxes are kept by the server, so the inventory can exceed ten; three pages is a generous ceiling. */
const MAX_MAILBOX_PAGES = 3
/** The most message summaries one request may ask for, whatever a caller passes. */
const MAX_MESSAGE_LIMIT = 50

export function createHttpGateway(http: HttpClient): ServerGateway {
  return {
    capabilities: () => http.request('GET', '/v1/capabilities', capabilitiesResponse),

    async listMailboxes() {
      const all: ServerMailbox[] = []
      let after: string | undefined
      for (let page = 0; page < MAX_MAILBOX_PAGES; page++) {
        const result = await http.request('GET', `/v1/mailboxes?limit=100${after ? `&after=${pathId(after)}` : ''}`, mailboxPage)
        all.push(...result.items.map(toMailbox))
        if (!result.next) return all
        after = result.next.after
      }
      // More pages remain than this build reads: say so rather than present a cut-off list as the whole inventory.
      throw new ApiFailure('unavailable', 'This account has more mailboxes than this version can list.')
    },

    async updateMailboxPermissions(mailboxId, permissions) {
      await http.request('PATCH', `/v1/mailboxes/${pathId(mailboxId)}/permissions`, updatedResponse, permissions)
    },

    mailboxQuota: (mailboxId) => http.request('GET', `/v1/mailboxes/${pathId(mailboxId)}/quota`, quotaResponse),

    async listMessages({ mailboxId, cursor, limit }) {
      const query = new URLSearchParams({ mailboxId: pathId(mailboxId), limit: String(Math.min(Math.max(1, Math.trunc(limit)), MAX_MESSAGE_LIMIT)) })
      // Both cursor parts are passed back unchanged, as the contract requires.
      if (cursor) {
        query.set('before', String(cursor.before))
        query.set('beforeId', pathId(cursor.beforeId))
      }
      return toMessagePage(await http.request('GET', `/v1/messages?${query.toString()}`, messagePage))
    },

    async getMessage(mailboxId, messageId) {
      return toMessageBody(await http.request('GET', `/v1/messages/${pathId(mailboxId)}/${pathId(messageId)}`, messageDetail))
    },

    createSendRequest: (key: string, content: SendContent) =>
      // `revision: 1`: each immutable request is its own first version; an edit is a new request with a new key.
      http.request('POST', '/v1/send-intents', createdIntent, { ...content, kind: 'manual', revision: 1, idempotencyKey: pathId(key) }),

    async approveSendRequest(intentId, revision) {
      await http.request('POST', `/v1/send-intents/${pathId(intentId)}/approve`, savedResponse, { revision })
    },

    async cancelSendRequest(intentId) {
      await http.request('POST', `/v1/send-intents/${pathId(intentId)}/cancel`, savedResponse)
    },

    async getSendRequest(intentId) {
      return toIntent(await http.request('GET', `/v1/send-intents/${pathId(intentId)}`, intentResponse))
    },
  }
}
