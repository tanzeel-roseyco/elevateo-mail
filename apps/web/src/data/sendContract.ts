// BE03 boundary schemas are separate: frozen C/D envelopes and enums remain unchanged.
import { z } from 'zod'
import type { components } from './generated/api'
import { codePoints } from '@/lib/ids'
import { AddressSchema } from './contract'
import { DraftAttachmentSchema } from './draftAttachmentGateway'
import { SEND_ERROR_CODES } from './errors'

const id = z.uuid()
const token = z.string().min(16).max(256).regex(/^[A-Za-z0-9_-]+$/)
const text = (max: number) => z.string().refine((value) => codePoints(value) <= max)
const version = z.number().int().min(1).max(2147483647)
const timestamp = z.iso.datetime()
const digest = z.string().regex(/^[0-9a-f]{64}$/)
const envelope = { context_id: token, authorization_version: token }
export const SendStateSchema = z.enum(['queued', 'dispatching', 'unknown', 'needs_review', 'cancelled', 'accepted', 'rejected'])
export const HoldReasonSchema = z.enum([
  'session_invalid', 'authorization_changed', 'capability_revoked', 'mailbox_disabled', 'suppressed',
  'policy_changed', 'restore_unreconciled', 'control_unavailable', 'auth_unavailable', 'uncertain',
  'retry_expired', 'attempt_limit', 'evidence_conflict', 'counter_exhausted',
])
export const ReadinessCodeSchema = z.enum([
  'draft_consumed', 'recipient_required', 'recipient_invalid', 'recipient_duplicate', 'recipient_suppressed',
  'sender_unconfigured', 'sender_invalid', 'mailbox_disabled', 'reply_unavailable', 'header_invalid',
  'snapshot_too_large', 'purpose_unavailable', 'attachment_not_clean',
])
export const OutboundModeSchema = z.enum(['held', 'mailpit', 'resend'])
export const SendErrorSchema = z.strictObject({
  code: z.enum(SEND_ERROR_CODES), message: text(256), request_id: text(128).refine((value) => value.length > 0),
})
export const SendReviewSchema = z.strictObject({
  ...envelope, draft_id: id, mailbox_id: id, draft_version: version,
  sender: z.strictObject({ display_name: z.null(), address: text(320).nullable() }),
  to: z.array(AddressSchema).max(100), subject: text(998), body_text: text(65536), reply_to_thread_id: id.nullable(),
  purpose: z.literal('correspondence'), consent_basis: z.literal('human_attestation_required'),
  attachments: z.array(DraftAttachmentSchema).max(1), attachments_supported: z.boolean(), policy_revision: z.string().max(19).regex(/^(0|[1-9][0-9]*)$/),
  recipient_checks: z.array(z.strictObject({ index: z.number().int().min(0).max(99), status: z.enum(['ok', 'invalid', 'duplicate', 'suppressed']), consent_evidence: z.boolean() })).max(100),
  ready: z.boolean(), issues: z.array(z.strictObject({ code: ReadinessCodeSchema, recipient_index: z.number().int().min(0).max(99).nullable() })).max(210),
  review_digest: digest.nullable(), simulated: z.boolean(), outbound_mode: OutboundModeSchema,
}).refine((review) => review.ready === (review.review_digest !== null))
export const SendApprovalInputSchema = z.strictObject({
  mailbox_id: id, operation_id: id, expected_version: version, review_digest: digest, correspondence_confirmed: z.literal(true),
})
export const ApprovalResultSchema = z.strictObject({
  ...envelope, send_id: id, draft_id: id, approved_version: version, review_digest: digest, approved_at: timestamp, simulated: z.boolean(),
})
export const SendStatusSchema = z.strictObject({
  ...envelope, send_id: id, mailbox_id: id, draft_id: id, approved_version: version, approved_at: timestamp,
  delivery_status: z.enum(['sent', 'delivery_delayed', 'delivered', 'failed', 'bounced', 'suppressed', 'complained']).nullable(),
  delivery_updated_at: timestamp.nullable(), suppression_reason: z.enum(['bounced', 'complained']).nullable(),
  state: SendStateSchema, attempts: z.number().int().min(0).max(3), first_possible_at: timestamp.nullable(), retry_deadline_at: timestamp.nullable(),
  cancel_requested: z.boolean(), cancellable: z.boolean(), hold_reason: HoldReasonSchema.nullable(), updated_at: timestamp, simulated: z.boolean(),
})
export const SendCancellationInputSchema = z.strictObject({ mailbox_id: id })
export const CancellationResultSchema = z.strictObject({
  ...envelope, send_id: id, result: z.enum(['cancelled', 'stop_requested']), state: SendStateSchema, cancel_requested: z.literal(true), simulated: z.boolean(),
})
export type SendReview = components['schemas']['SendReview']
export type SendApprovalInput = components['schemas']['SendApprovalInput']
export type ApprovalResult = components['schemas']['ApprovalResult']
export type SendStatus = components['schemas']['SendStatus']
export type SendCancellationInput = components['schemas']['SendCancellationInput']
export type CancellationResult = components['schemas']['CancellationResult']
