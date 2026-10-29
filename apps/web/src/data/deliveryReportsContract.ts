// Bounce and suppression read ports (FC web-delivery). No server endpoint exists for these lists
// yet, so this module defines the PROPOSED v2 shapes and the typed port the UI binds. The HTTP
// adapter (httpDeliveryReportsGateway.ts) targets the proposed routes and is wired only once the
// contract lands; until then production leaves the port unset and the pages show an honest
// unavailable state. Demo/fixture entries bind a clearly simulated adapter.
//
// AIDEV-NOTE: contract-request — vocabulary tracks the real provider model: provider-event states
// come from contracts/v2 /v2/provider-events/resend (bounced/complained); bounce type is Resend's
// hard/soft; suppression reasons are Resend's hard_bounce/complaint/manual/unsubscribe. Every free
// text field (bounce reason) is plain text only and is rendered as text, never HTML.
import { z } from 'zod'
import type { ReadContext } from './gateway'

/** Largest page either list returns; the HTTP adapter rejects larger limits before sending. */
export const DELIVERY_REPORTS_MAX_PAGE = 50

const id = z.uuid()
const timestamp = z.iso.datetime()
const context = z.string().min(16).max(256)
const cursor = z.string().min(1).max(2048).nullable()

/** Bounded plain text: no control characters except tab/newline. Rendered verbatim, never as HTML. */
const plainText = (max: number) =>
  z.string().max(max).refine((value) =>
    Array.from(value).every((character) => {
      const code = character.codePointAt(0)
      return code !== undefined && code !== 127 && (code >= 32 || code === 9 || code === 10)
    }),
  )

export const BounceTypeSchema = z.enum(['hard', 'soft'])
export type BounceType = z.infer<typeof BounceTypeSchema>

export const BounceRecordSchema = z.strictObject({
  id,
  send_id: id,
  /** Thread the send belonged to, when the bounce can be traced back to one. */
  thread_id: id.nullable(),
  recipient: z.email().max(254),
  provider_event: z.enum(['bounced', 'complained']),
  /** Hard/soft only applies to a bounce; a complaint carries null. */
  bounce_type: BounceTypeSchema.nullable(),
  /** Provider diagnostic text. Plain text; always rendered as text. */
  reason: plainText(2048),
  occurred_at: timestamp,
}).refine((record) => (record.provider_event === 'complained') === (record.bounce_type === null))
export type BounceRecord = z.infer<typeof BounceRecordSchema>

export const BouncePageSchema = z.strictObject({
  context_id: context,
  authorization_version: context,
  mailbox_id: id,
  items: z.array(BounceRecordSchema).max(DELIVERY_REPORTS_MAX_PAGE),
  next_cursor: cursor,
})
export type BouncePage = z.infer<typeof BouncePageSchema>

export const SuppressionReasonSchema = z.enum(['hard_bounce', 'complaint', 'manual', 'unsubscribe'])
export type SuppressionReason = z.infer<typeof SuppressionReasonSchema>

export const SuppressionRecordSchema = z.strictObject({
  id,
  address: z.email().max(254),
  reason: SuppressionReasonSchema,
  since: timestamp,
  /** The send that first triggered the suppression, when known. */
  source_send_id: id.nullable(),
  /** The server owns suppression removal; the UI never offers it when false. */
  removable: z.boolean(),
})
export type SuppressionRecord = z.infer<typeof SuppressionRecordSchema>

export const SuppressionPageSchema = z.strictObject({
  context_id: context,
  authorization_version: context,
  organization_id: id,
  items: z.array(SuppressionRecordSchema).max(DELIVERY_REPORTS_MAX_PAGE),
  next_cursor: cursor,
})
export type SuppressionPage = z.infer<typeof SuppressionPageSchema>

// AIDEV-NOTE: page byte budgets derive from the schema limits so a schema-valid page is never rejected
// as oversized (review P20-1). Strings cost 6 bytes per character (worst JSON escape); 256 bytes per
// record cover keys, enums and timestamps, and the envelope allows two contexts plus a cursor.
const ENVELOPE_MAX_BYTES = 2 * 256 * 6 + 2048 * 6 + 512
const BOUNCE_RECORD_MAX_BYTES = 3 * 36 + 254 * 6 + 2048 * 6 + 256
const SUPPRESSION_RECORD_MAX_BYTES = 2 * 36 + 254 * 6 + 256
export const BOUNCE_PAGE_MAX_BYTES = ENVELOPE_MAX_BYTES + DELIVERY_REPORTS_MAX_PAGE * BOUNCE_RECORD_MAX_BYTES
export const SUPPRESSION_PAGE_MAX_BYTES = ENVELOPE_MAX_BYTES + DELIVERY_REPORTS_MAX_PAGE * SUPPRESSION_RECORD_MAX_BYTES

/** Bounce list filter. `type` 'complaint' selects complaint events; 'hard'/'soft' select bounces. */
export interface BounceQuery {
  type?: BounceType | 'complaint'
  /** ISO lower bound; occurred_at must be at or after it. */
  since?: string
  cursor?: string
  limit?: number
}

export interface SuppressionQuery {
  /** Case-insensitive address substring. */
  q?: string
  cursor?: string
  limit?: number
}

/**
 * Read port for provider delivery reports. `simulated` is true only for the demo/fixture adapter so
 * the pages can label synthetic data; a real HTTP adapter sets it false.
 * AIDEV-NOTE: contract-request — bound through FeatureGateways, not the frozen MailroomGateway.
 */
export interface DeliveryReportsGateway {
  readonly simulated: boolean
  listBounces(ctx: ReadContext, mailboxId: string, query: BounceQuery, signal: AbortSignal): Promise<BouncePage>
  listSuppressions(ctx: ReadContext, organizationId: string, query: SuppressionQuery, signal: AbortSignal): Promise<SuppressionPage>
}
