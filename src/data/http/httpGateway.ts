import type { SendContent } from '@/domain/sendLifecycle'
import { capabilitiesResponse, createdIntent, currentUserResponse, fixtureSessionResponse, intentResponse, isServerId, logoutResponse, mailboxPage, messageDetail, messagePage, quotaResponse, replacementResponse, savedResponse, sendContentResponse, sendRequestPage, toCurrentUser, toIntent, toMailbox, toMessageBody, toMessagePage, toSavedSend, toSendPage, updatedResponse, type ServerMailbox } from './contract'
import { ApiFailure, type HttpClient } from './httpClient'
import type { FixtureSignIn, ServerGateway } from './ports'

// AIDEV-NOTE: The explicit HTTP adapter: one method per contract route, DTOs out, no cache and no fallback data.

/** Ids go into URL paths, so a value that is not a server id is refused before any request is made. */
function pathId(value: string): string {
  if (!isServerId(value)) throw new ApiFailure('refused', 'That reference is not valid.', 'validation_failed', 400)
  return value
}

/** Historical mailboxes are kept by the server, so the inventory can exceed ten; three pages is a generous ceiling. */
const MAX_MAILBOX_PAGES = 3
/** The most message or send-request summaries one request may ask for, whatever a caller passes. */
const MAX_MESSAGE_LIMIT = 50
const clampLimit = (limit: number): string => String(Number.isFinite(limit) ? Math.min(Math.max(1, Math.trunc(limit)), MAX_MESSAGE_LIMIT) : 1)
// `revision: 1`: each immutable request is its own first version; an edit is a new request with a new key.
const draftBody = (key: string, content: SendContent) => ({ ...content, kind: 'manual', revision: 1, idempotencyKey: pathId(key) })

export function createHttpGateway(http: HttpClient): ServerGateway {
  return {
    me: async () => toCurrentUser(await http.request('GET', '/v1/me', currentUserResponse)),

    async logout() {
      await http.request('POST', '/v1/session/logout', logoutResponse)
    },

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
      const query = new URLSearchParams({ mailboxId: pathId(mailboxId), limit: clampLimit(limit) })
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

    async listSendRequests(cursor, limit) {
      const query = new URLSearchParams({ limit: clampLimit(limit) })
      if (cursor) {
        query.set('before', String(cursor.before))
        query.set('beforeId', pathId(cursor.beforeId))
      }
      return toSendPage(await http.request('GET', `/v1/send-intents?${query.toString()}`, sendRequestPage))
    },

    getSendContent: async (intentId) => toSavedSend(await http.request('GET', `/v1/send-intents/${pathId(intentId)}/content`, sendContentResponse)),

    createSendRequest: (key, content) => http.request('POST', '/v1/send-intents', createdIntent, draftBody(key, content)),

    replaceSendRequest: (intentId, revision, key, content) => http.request('POST', `/v1/send-intents/${pathId(intentId)}/replace`, replacementResponse, { revision, draft: draftBody(key, content) }),

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

export function createFixtureSignIn(http: HttpClient): FixtureSignIn {
  return {
    async provision(user) {
      await http.request('POST', '/__fixture/session', fixtureSessionResponse, { user })
    },
  }
}
