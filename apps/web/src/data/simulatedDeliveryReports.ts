// Simulated bounce/suppression adapter for the demo and dev-fixture entries ONLY. Never imported by
// the production graph (main.tsx leaves the port unset so production shows the unavailable state).
// Data is synthetic and clearly labelled; `simulated` is true so the pages mark every row.
//
// AIDEV-NOTE: Echoes the caller's read context and scope id so it slots into any entry's session.
import type { ReadContext } from './gateway'
import {
  BouncePageSchema,
  SuppressionPageSchema,
  type BounceQuery,
  type BounceRecord,
  type DeliveryReportsGateway,
  type SuppressionQuery,
  type SuppressionRecord,
} from './deliveryReportsContract'

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`

const BOUNCES: readonly BounceRecord[] = [
  { id: uuid('b01'), send_id: uuid('5e01'), thread_id: uuid('a01'), recipient: 'no-such-user@example.invalid', provider_event: 'bounced', bounce_type: 'hard', reason: 'The recipient address does not exist (SMTP 550 5.1.1 user unknown).', occurred_at: '2026-10-27T09:12:00Z' },
  { id: uuid('b02'), send_id: uuid('5e02'), thread_id: uuid('a02'), recipient: 'full-mailbox@example.invalid', provider_event: 'bounced', bounce_type: 'soft', reason: 'Mailbox temporarily over quota (SMTP 452). The provider may retry.', occurred_at: '2026-10-26T14:05:00Z' },
  { id: uuid('b03'), send_id: uuid('5e03'), thread_id: null, recipient: 'annoyed@example.invalid', provider_event: 'complained', bounce_type: null, reason: 'Recipient marked the message as spam at their mail provider.', occurred_at: '2026-10-20T07:40:00Z' },
]

const SUPPRESSIONS: readonly SuppressionRecord[] = [
  { id: uuid('50f1'), address: 'no-such-user@example.invalid', reason: 'hard_bounce', since: '2026-10-27T09:12:00Z', source_send_id: uuid('5e01'), removable: false },
  { id: uuid('50f2'), address: 'annoyed@example.invalid', reason: 'complaint', since: '2026-10-20T07:40:00Z', source_send_id: uuid('5e03'), removable: false },
  { id: uuid('50f3'), address: 'opted-out@example.invalid', reason: 'unsubscribe', since: '2026-10-18T11:00:00Z', source_send_id: null, removable: false },
  { id: uuid('50f4'), address: 'blocked-by-admin@example.invalid', reason: 'manual', since: '2026-10-10T16:30:00Z', source_send_id: null, removable: false },
]

function matchesType(record: BounceRecord, type: BounceQuery['type']): boolean {
  if (type === undefined) return true
  if (type === 'complaint') return record.provider_event === 'complained'
  return record.bounce_type === type
}

/** Synthetic delivery-report adapter. Honors the same filters the real adapter will, over fixed data. */
export function createSimulatedDeliveryReportsGateway(): DeliveryReportsGateway {
  return {
    simulated: true,
    async listBounces(ctx: ReadContext, mailboxId, query: BounceQuery) {
      const sinceMs = query.since === undefined ? null : Date.parse(query.since)
      const items = BOUNCES.filter((record) =>
        matchesType(record, query.type) && (sinceMs === null || Number.isNaN(sinceMs) || Date.parse(record.occurred_at) >= sinceMs),
      )
      return BouncePageSchema.parse({
        context_id: ctx.contextId, authorization_version: ctx.authorizationVersion,
        mailbox_id: mailboxId, items, next_cursor: null,
      })
    },
    async listSuppressions(ctx: ReadContext, organizationId, query: SuppressionQuery) {
      const needle = query.q?.trim().toLowerCase() ?? ''
      const items = needle === '' ? SUPPRESSIONS : SUPPRESSIONS.filter((record) => record.address.toLowerCase().includes(needle))
      return SuppressionPageSchema.parse({
        context_id: ctx.contextId, authorization_version: ctx.authorizationVersion,
        organization_id: organizationId, items, next_cursor: null,
      })
    },
  }
}
