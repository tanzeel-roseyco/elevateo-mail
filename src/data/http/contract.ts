import { z } from 'zod'
import { SERVER_SEND_STATUSES } from '@/domain/sendLifecycle'

// AIDEV-NOTE: Wire shapes of the server's integration-v1 contract (docs/contracts/integration-v1.md in the server
// worktree). Every response is parsed here; nothing from the network is trusted by a cast.
// Unknown extra fields are dropped rather than rejected, so an additive server change does not break the page.

const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/)
const hash = z.string().regex(/^[a-f0-9]{64}$/)
// Capped at the largest instant a Date can hold, so converting to ISO text can never throw after validation.
const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000)
const flag = z.union([z.literal(0), z.literal(1)])

export const isServerId = (value: string): boolean => id.safeParse(value).success

export const errorResponse = z.object({ error: z.object({ code: z.string(), requestId: z.string() }) })

export const capabilitiesResponse = z.object({
  version: z.literal(1),
  simulated: z.boolean(),
  liveSending: z.boolean(),
  dnsWrites: z.boolean(),
  features: z.object({ mailboxInventory: z.boolean(), messages: z.boolean(), manualSend: z.boolean(), campaignWizard: z.boolean(), inboxSync: z.boolean(), historyImport: z.boolean(), aiBridge: z.boolean() }),
  policy: z.object({ provisional: z.boolean(), windowHours: z.number().int().positive(), mailboxLimit: z.number().int().positive(), userLimit: z.number().int().positive(), users: z.number().int().positive(), connectedMailboxes: z.number().int().nonnegative() }),
  dispatchPaused: z.boolean(),
})
export type Capabilities = z.infer<typeof capabilitiesResponse>

const mailboxRow = z.object({ id, address: z.string(), provider: z.string(), connected: flag, send_enabled: flag, ai_read: flag, ai_draft: flag, ai_send: flag })
export const mailboxPage = z.object({ items: z.array(mailboxRow).max(100), next: z.object({ after: id }).nullable() })

/** Server mailbox as the UI uses it. `id` is issued by the server and is the only handle ever sent back. */
export interface ServerMailbox {
  id: string
  address: string
  provider: string
  connected: boolean
  sendEnabled: boolean
  aiRead: boolean
  aiDraft: boolean
  aiSend: boolean
}
export const toMailbox = (row: z.infer<typeof mailboxRow>): ServerMailbox => ({ id: row.id, address: row.address, provider: row.provider, connected: row.connected === 1, sendEnabled: row.send_enabled === 1, aiRead: row.ai_read === 1, aiDraft: row.ai_draft === 1, aiSend: row.ai_send === 1 })

export type MailboxPermissions = Pick<ServerMailbox, 'connected' | 'sendEnabled' | 'aiRead' | 'aiDraft' | 'aiSend'>

const counters = z.object({ limit: z.number().int().positive(), acceptedUsage: z.number().int().nonnegative(), heldReservations: z.number().int().nonnegative(), remaining: z.number().int().nonnegative(), nextAcceptedReleaseAt: timestamp.nullable(), reservationReleaseUnknown: z.boolean() })
export type QuotaCounters = z.infer<typeof counters>
export const quotaResponse = z.object({ mailboxId: id, policy: z.string(), windowHours: z.number().int().positive(), mailbox: counters, user: counters })
export type MailboxQuota = z.infer<typeof quotaResponse>

const summaryRow = z.object({ id, thread_id: id, mailbox_id: id, sender: z.string(), subject: z.string(), at: timestamp })
export const messagePage = z.object({ items: z.array(summaryRow).max(100), next: z.object({ before: timestamp, beforeId: id }).nullable() })
export type MessageCursor = { before: number; beforeId: string }

export interface MessageSummary {
  id: string
  threadId: string
  mailboxId: string
  sender: string
  subject: string
  /** ISO-8601, converted from the server's Unix milliseconds at this seam. */
  at: string
}
const toSummary = (row: z.infer<typeof summaryRow>): MessageSummary => ({ id: row.id, threadId: row.thread_id, mailboxId: row.mailbox_id, sender: row.sender, subject: row.subject, at: new Date(row.at).toISOString() })
export const toMessagePage = (page: z.infer<typeof messagePage>): { items: MessageSummary[]; next: MessageCursor | null } => ({ items: page.items.map(toSummary), next: page.next })

// The server marks every body as plain text from an untrusted sender; anything else is refused rather than rendered.
export const messageDetail = z.object({ message: summaryRow.extend({ body: z.string().max(100_000) }), contentType: z.literal('text/plain'), trust: z.literal('untrusted-email') })
export interface MessageBody extends MessageSummary {
  body: string
}
export const toMessageBody = (detail: z.infer<typeof messageDetail>): MessageBody => ({ ...toSummary(detail.message), body: detail.message.body })

const status = z.enum(SERVER_SEND_STATUSES)
export const createdIntent = z.object({ id, revision: hash, status })
export type CreatedIntent = z.infer<typeof createdIntent>
export const intentResponse = z.object({
  intent: z.object({ id, revision: hash, status, scheduled_at: timestamp, dispatch_at: timestamp.nullable(), provider_id: z.string().nullable(), error_code: z.string().nullable(), correlation_id: z.string().nullable(), approval_expires_at: timestamp.nullable() }),
})
export interface SendIntent {
  id: string
  revision: string
  status: z.infer<typeof status>
  errorCode: string | null
  /** Diagnostic id to quote to an operator. Never evidence of delivery. */
  correlationId: string | null
  approvalExpiresAt: string | null
}
export const toIntent = ({ intent }: z.infer<typeof intentResponse>): SendIntent => ({ id: intent.id, revision: intent.revision, status: intent.status, errorCode: intent.error_code, correlationId: intent.correlation_id, approvalExpiresAt: intent.approval_expires_at === null ? null : new Date(intent.approval_expires_at).toISOString() })

export const savedResponse = z.object({ saved: z.literal(true) })
export const updatedResponse = z.object({ updated: z.literal(true) })
