import type { SendContent } from '@/domain/sendLifecycle'
import type { Capabilities, CreatedIntent, CurrentUser, MailboxPermissions, MailboxQuota, MessageBody, MessageCursor, MessageSummary, Replacement, SavedSend, SendCursor, SendIntent, SendSummary, ServerMailbox } from './contract'

// AIDEV-NOTE: Port for API-backed mode. Unlike the demo MailroomGateway there is no sendMessage → threadId: a send is
// created, approved and then tracked as a separate server-owned request. Implementations return DTOs and own no cache.

export interface MessageQuery {
  mailboxId: string
  cursor: MessageCursor | null
  limit: number
}

export const FIXTURE_USERS = ['alice', 'bob'] as const
export type FixtureUser = (typeof FIXTURE_USERS)[number]

export interface ServerGateway {
  /** Who the browser's session cookie belongs to. A 401 means there is no valid session. */
  me(): Promise<CurrentUser>
  /** Ends the current session on the server and expires its cookie. */
  logout(): Promise<void>
  capabilities(): Promise<Capabilities>
  /** Connected operational inventory only, at most ten. History is fetched explicitly. */
  listMailboxes(): Promise<ServerMailbox[]>
  listMailboxHistory(after: string | null): Promise<{ items: ServerMailbox[]; next: { after: string } | null }>
  getMailbox(id: string): Promise<ServerMailbox | null>
  /** Replaces all five flags at once; the caller must send the full current set. */
  updateMailboxPermissions(mailboxId: string, permissions: MailboxPermissions): Promise<void>
  mailboxQuota(mailboxId: string): Promise<MailboxQuota>
  /** One page of summaries, newest first. Bodies are never included. */
  listMessages(query: MessageQuery): Promise<{ items: MessageSummary[]; next: MessageCursor | null }>
  getMessage(mailboxId: string, messageId: string): Promise<MessageBody>
  /** One page of the account's saved send requests, newest first, without content. */
  listSendRequests(cursor: SendCursor | null, limit: number): Promise<{ items: SendSummary[]; next: SendCursor | null }>
  /** Exact owner-scoped recovery lookup; null confirms the key is absent. No message content is returned. */
  lookupSendRequest(key: string): Promise<SendSummary | null>
  /** The exact saved content of one request. */
  getSendContent(intentId: string): Promise<SavedSend>
  /** Optional AI seam; shares the idempotent key ledger but must never fall back to a manual draft. */
  createAiDraft?(key: string, content: SendContent): Promise<CreatedIntent>
  /** Idempotent on `key`: repeating it with identical content returns the request already saved, in its current state. */
  createSendRequest(key: string, content: SendContent): Promise<CreatedIntent>
  /**
   * Atomically cancels `intentId` (which must still be at `revision`) and saves one successor under `key`. Repeating
   * identical input returns the same successor; a different successor is refused with `replacement_conflict`.
   */
  replaceSendRequest(intentId: string, revision: string, key: string, content: SendContent): Promise<Replacement>
  /** Approves exactly the saved version named by `revision`. Not idempotent: after a lost answer, inspect instead. */
  approveSendRequest(intentId: string, revision: string): Promise<void>
  cancelSendRequest(intentId: string): Promise<void>
  getSendRequest(intentId: string): Promise<SendIntent>
}

/** Only the Docker fixture offers this. Production has no sign-in route yet, so production builds are given none. */
export interface FixtureSignIn {
  provision(user: FixtureUser): Promise<void>
}
