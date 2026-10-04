import { z } from 'zod'
import { EMAIL_PATTERN } from './schema'

// AIDEV-NOTE: Pure rules for the API-backed send lifecycle. The server owns state; this only names and orders it.
// Approval is not sending, and provider acceptance is not delivery: no label here may imply otherwise.

/** States the backend reports for a send intent (backend/migrations/0001_foundation.sql). */
export const SERVER_SEND_STATUSES = ['draft', 'pending', 'dispatching', 'accepted', 'rejected', 'unknown', 'cancelled'] as const
export type ServerSendStatus = (typeof SERVER_SEND_STATUSES)[number]

/**
 * `local_draft` exists only in this browser. `unconfirmed` means a create request was started but no response was
 * seen, so the server may or may not hold it; it is resolved by re-sending the SAME idempotency key, never a new one.
 */
export const SEND_STATUSES = ['local_draft', 'unconfirmed', ...SERVER_SEND_STATUSES] as const
export type SendStatus = (typeof SEND_STATUSES)[number]

export const MAX_RECIPIENTS = 30
export const MAX_SUBJECT = 998
export const MAX_BODY = 100_000

export const sendContentSchema = z.object({
  mailboxId: z.string(),
  to: z.array(z.string()),
  cc: z.array(z.string()),
  bcc: z.array(z.string()),
  subject: z.string(),
  body: z.string(),
})
export type SendContent = z.infer<typeof sendContentSchema>

export const sendRecordSchema = z.object({
  /** Idempotency key, generated once in the browser. It identifies this request for its whole life. */
  key: z.string().min(1).max(128),
  content: sendContentSchema,
  createdAt: z.string(),
  status: z.enum(SEND_STATUSES),
  /** Server id and content hash, known once the server has confirmed the request. */
  intentId: z.string().nullable(),
  revision: z.string().nullable(),
  errorCode: z.string().nullable(),
  /** Server diagnostic id for a rejected or unknown outcome; quoted to an operator, never shown as proof of delivery. */
  correlationId: z.string().nullable(),
  /** When the server status was last read successfully. */
  checkedAt: z.string().nullable(),
  /** Last refusal or failure the person should see, in plain words. Cleared by the next successful step. */
  notice: z.string().nullable(),
})
export type SendRecord = z.infer<typeof sendRecordSchema>

export function newSendRecord(key: string, content: SendContent, nowIso: string): SendRecord {
  return { key, content, createdAt: nowIso, status: 'local_draft', intentId: null, revision: null, errorCode: null, correlationId: null, checkedAt: null, notice: null }
}

export type SendTone = 'neutral' | 'success' | 'warn' | 'danger' | 'accent'
export interface SendStatusView {
  label: string
  tone: SendTone
  /** One sentence saying exactly what is and is not known. */
  meaning: string
}

const VIEWS: Record<SendStatus, SendStatusView> = {
  local_draft: { label: 'Draft', tone: 'neutral', meaning: 'Saved in this browser only. Nothing has been submitted.' },
  unconfirmed: { label: 'Not confirmed', tone: 'warn', meaning: 'The request was submitted but no answer came back. Check again: the same request is looked up, never a second one.' },
  draft: { label: 'Awaiting approval', tone: 'accent', meaning: 'The server holds this exact version. Nothing is sent until you approve it.' },
  pending: { label: 'Queued', tone: 'neutral', meaning: 'Approved and waiting in the server queue. Approval is not sending: it has not been handed to the provider yet.' },
  dispatching: { label: 'Sending', tone: 'neutral', meaning: 'The server is handing the message to the provider. It can no longer be cancelled.' },
  accepted: { label: 'Accepted by provider', tone: 'success', meaning: 'The provider accepted the message. Acceptance is not delivery: nothing here confirms it reached an inbox.' },
  rejected: { label: 'Rejected', tone: 'danger', meaning: 'The provider refused the message. It was not sent.' },
  cancelled: { label: 'Cancelled', tone: 'neutral', meaning: 'This request was cancelled or its approval expired before it was handed to the provider. It was not sent.' },
  unknown: { label: 'Outcome unknown', tone: 'warn', meaning: 'The server could not confirm whether the provider received it. Do not send it again: it may already have gone. Its place in the daily limit stays held.' },
}

export function sendStatusView(status: SendStatus): SendStatusView {
  return VIEWS[status]
}

/** No further change can come from the server. `unknown` is not settled: server reconciliation may still resolve it. */
export function isSettled(status: SendStatus): boolean {
  return status === 'accepted' || status === 'rejected' || status === 'cancelled'
}

export const canApprove = (status: SendStatus): boolean => status === 'draft'
/** The server refuses cancellation once a provider call may have started. */
export const canCancel = (status: SendStatus): boolean => status === 'draft' || status === 'pending'
/** Content is immutable on the server; editing means cancelling this request and approving a new one. */
export const canEdit = (status: SendStatus): boolean => status === 'local_draft' || canCancel(status)

export const MAX_POLL_ATTEMPTS = 30

/**
 * Delay before the next automatic status check, or null to stop. Bounded on purpose: a page left open must not poll
 * forever. Queued/sending back off from 1.5s to 10s for about four minutes. `unknown` is never polled automatically
 * (integration-v1 contract): it is checked only when the person asks.
 */
export function nextPollDelay(status: SendStatus, attempt: number): number | null {
  if (status !== 'pending' && status !== 'dispatching') return null
  return attempt >= MAX_POLL_ATTEMPTS ? null : Math.min(10_000, 1_500 + attempt * 1_000)
}

export type ContentCheck = { ok: true; content: SendContent } | { ok: false; errors: Array<{ field: keyof SendContent; message: string }> }

const clean = (list: string[]): string[] => [...new Set(list.map((a) => a.trim().toLowerCase()).filter(Boolean))]

/** Mirrors the server's admission rules so mistakes are caught before a request; the server remains the authority. */
export function checkSendContent(raw: SendContent): ContentCheck {
  const errors: Array<{ field: keyof SendContent; message: string }> = []
  const to = clean(raw.to)
  // An address counts once: the server removes a CC/BCC that repeats an earlier recipient.
  const cc = clean(raw.cc).filter((a) => !to.includes(a))
  const bcc = clean(raw.bcc).filter((a) => !to.includes(a) && !cc.includes(a))
  const subject = raw.subject.trim()
  const mailboxId = raw.mailboxId.trim()
  if (!mailboxId) errors.push({ field: 'mailboxId', message: 'Choose the mailbox to send from.' })
  if (to.length === 0) errors.push({ field: 'to', message: 'Add at least one recipient in To.' })
  for (const field of ['to', 'cc', 'bcc'] as const) {
    const bad = { to, cc, bcc }[field].find((a) => a.length > 254 || !EMAIL_PATTERN.test(a))
    if (bad) errors.push({ field, message: `"${bad}" is not a full email address.` })
  }
  if (to.length + cc.length + bcc.length > MAX_RECIPIENTS) errors.push({ field: 'to', message: `A message can have at most ${MAX_RECIPIENTS} recipients across To, CC and BCC.` })
  if (!subject) errors.push({ field: 'subject', message: 'Add a subject.' })
  else if (subject.length > MAX_SUBJECT || /[\r\n]/.test(subject)) errors.push({ field: 'subject', message: `The subject must be one line of at most ${MAX_SUBJECT} characters.` })
  if (!raw.body) errors.push({ field: 'body', message: 'Write a message.' })
  else if (raw.body.length > MAX_BODY) errors.push({ field: 'body', message: `The message is longer than ${MAX_BODY.toLocaleString('en-GB')} characters.` })
  return errors.length > 0 ? { ok: false, errors } : { ok: true, content: { mailboxId, to, cc, bcc, subject, body: raw.body } }
}

export const recipientCount = (content: Pick<SendContent, 'to' | 'cc' | 'bcc'>): number => new Set([...content.to, ...content.cc, ...content.bcc].map((a) => a.trim().toLowerCase()).filter(Boolean)).size

// Stable error codes from the backend (backend/worker.ts, ledger.ts, resources.ts). Unknown codes get a generic line.
const ERROR_TEXT: Record<string, string> = {
  quota_exceeded: 'The server refused this: the mailbox does not have enough remaining capacity, counting sends already accepted and requests still held. Nothing was sent, and it is still awaiting approval.',
  owner_quota_exceeded: 'The server refused this: your account does not have enough remaining capacity across all mailboxes, counting sends already accepted and requests still held. Nothing was sent, and it is still awaiting approval.',
  mailbox_identity_conflict: 'That provider account is already connected under a different address.',
  internal_error: 'The server hit an error. Check the saved state before trying again.',
  not_found: 'The server does not offer that.',
  mailbox_permission: 'The server refused this: the mailbox is disconnected or is not allowed to send. Nothing was sent.',
  approval_conflict: 'The server did not approve this version: the request has changed state or is not the version shown. Check its status.',
  approval_expired: 'The approval expired before the message was handed to the provider. Nothing was sent.',
  approval_required: 'This version has not been approved.',
  already_in_flight_or_missing: 'It can no longer be cancelled: it is already being sent, has finished, or does not exist.',
  idempotency_conflict: 'The server already holds a different message under this request. Nothing was changed.',
  suppressed: 'The server refused this: a recipient is on the do-not-contact list. Nothing was sent.',
  consent_or_reply_stop: 'The server refused this: a recipient has not opted in or has replied to this campaign. Nothing was sent.',
  campaign_paused: 'The server refused this: the campaign is not running.',
  dispatch_paused: 'Sending is paused on the server.',
  mailbox_not_found: 'That mailbox does not exist for this account.',
  mailbox_limit: 'This account already has the maximum number of mailboxes.',
  intent_not_found: 'The server has no such send request for this account.',
  message_not_found: 'That message does not exist for this account.',
  validation_failed: 'The server rejected the request as invalid. Nothing was changed.',
  schedule_too_far: 'The scheduled time is too far ahead.',
  unauthorized: 'Your session has expired or is not valid. Sign in again.',
  body_too_large: 'The message is too large for the server to accept.',
}

export function describeServerError(code: string): string {
  return ERROR_TEXT[code] ?? `The server refused the request (${code}). Nothing was changed.`
}
