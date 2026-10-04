import type { SendContent } from '@/domain/sendLifecycle'
import type { Capabilities, CreatedIntent, MailboxPermissions, MailboxQuota, MessageBody, MessageCursor, MessageSummary, SendIntent, ServerMailbox } from './contract'

// AIDEV-NOTE: Port for API-backed mode. Unlike the demo MailroomGateway there is no sendMessage → threadId: a send is
// created, approved and then tracked as a separate server-owned request. Implementations return DTOs and own no cache.

export interface MessageQuery {
  mailboxId: string
  cursor: MessageCursor | null
  limit: number
}

export interface ServerGateway {
  capabilities(): Promise<Capabilities>
  /** Connected and historical mailboxes, with server-issued ids. */
  listMailboxes(): Promise<ServerMailbox[]>
  /** Replaces all five flags at once; the caller must send the full current set. */
  updateMailboxPermissions(mailboxId: string, permissions: MailboxPermissions): Promise<void>
  mailboxQuota(mailboxId: string): Promise<MailboxQuota>
  /** One page of summaries, newest first. Bodies are never included. */
  listMessages(query: MessageQuery): Promise<{ items: MessageSummary[]; next: MessageCursor | null }>
  getMessage(mailboxId: string, messageId: string): Promise<MessageBody>
  /** Idempotent on `key`: repeating it with identical content returns the request already saved, in its current state. */
  createSendRequest(key: string, content: SendContent): Promise<CreatedIntent>
  /** Approves exactly the saved version named by `revision`. Not idempotent: after a lost answer, inspect instead. */
  approveSendRequest(intentId: string, revision: string): Promise<void>
  cancelSendRequest(intentId: string): Promise<void>
  getSendRequest(intentId: string): Promise<SendIntent>
}
