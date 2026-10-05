import { createAiGateway } from './aiGateway'
import { sendContentSchema, type SendContent } from '@/domain/sendLifecycle'
import { capabilitiesResponse, createdIntent, currentUserResponse, fixtureSessionResponse, intentResponse, isServerId, logoutResponse, mailboxPage, messageDetail, messagePage, quotaResponse, replacementResponse, savedResponse, sendContentResponse, sendLookupResponse, sendRequestPage, toCurrentUser, toIntent, toMailbox, toMessageBody, toMessagePage, toSavedSend, toSendLookup, toSendPage, updatedResponse } from './contract'
import { ApiFailure, type HttpClient } from './httpClient'
import type { FixtureSignIn, ServerGateway } from './ports'

// AIDEV-NOTE: The explicit HTTP adapter: one method per contract route, DTOs out, no cache and no fallback data.

/** Ids go into URL paths, so a value that is not a server id is refused before any request is made. */
function pathId(value: string): string {
  if (!isServerId(value)) throw new ApiFailure('refused', 'That reference is not valid.', 'validation_failed', 400)
  return value
}

/** The most message or send-request summaries one request may ask for, whatever a caller passes. */
const MAX_MESSAGE_LIMIT = 50
const clampLimit = (limit: number): string => String(Number.isFinite(limit) ? Math.min(Math.max(1, Math.trunc(limit)), MAX_MESSAGE_LIMIT) : 1)
// `revision: 1`: each immutable request is its own first version; an edit is a new request with a new key.
const draftBody = (key: string, content: SendContent) => ({ ...sendContentSchema.parse(content), kind: 'manual', revision: 1, idempotencyKey: pathId(key) })

export function createHttpGateway(http: HttpClient): ServerGateway {
  return {
    me: async () => toCurrentUser(await http.request('GET', '/v1/me', currentUserResponse)),

    async logout() {
      await http.request('POST', '/v1/session/logout', logoutResponse)
    },

    capabilities: () => http.request('GET', '/v1/capabilities', capabilitiesResponse),

    async listMailboxes() {
      const result = await http.request('GET', '/v1/mailboxes?connected=true&limit=10', mailboxPage)
      if (result.next || result.items.length > 10 || result.items.some((m) => !m.connected)) throw new ApiFailure('unavailable', 'The connected mailbox inventory is invalid.')
      return result.items.map(toMailbox)
    },

    async listMailboxHistory(after) {
      const result = await http.request('GET', `/v1/mailboxes?connected=false&limit=25${after ? `&after=${pathId(after)}` : ''}`, mailboxPage)
      if (result.items.length > 25 || result.items.some((m) => m.connected)) throw new ApiFailure('unavailable', 'The mailbox history response is invalid.')
      return { items: result.items.map(toMailbox), next: result.next }
    },

    async getMailbox(id) {
      const result = await http.request('GET', `/v1/mailboxes?id=${pathId(id)}&limit=1`, mailboxPage)
      if (result.next || result.items.some((m) => m.id !== id)) throw new ApiFailure('unavailable', 'The mailbox response did not match this request.')
      return result.items[0] ? toMailbox(result.items[0]) : null
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

    async lookupSendRequest(key) {
      const query = new URLSearchParams({ idempotencyKey: pathId(key) })
      const found = toSendLookup(await http.request('GET', `/v1/send-intents/lookup?${query}`, sendLookupResponse))
      if (found && found.idempotencyKey !== key) throw new ApiFailure('unavailable', 'The recovery response did not match this request.')
      return found
    },

    getSendContent: async (intentId) => toSavedSend(await http.request('GET', `/v1/send-intents/${pathId(intentId)}/content`, sendContentResponse)),

    createAiDraft: (key, content) => createAiGateway(http).saveDraft(key, content),
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
