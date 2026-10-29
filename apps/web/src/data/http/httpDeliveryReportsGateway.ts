// HTTP adapter for the PROPOSED bounce/suppression read endpoints. It is deliberately not wired in
// the production entry yet: the routes below do not exist in contracts/v2, so binding it would turn
// the pages into an error state rather than the honest "unavailable" state they must show until the
// contract lands. Kept ready so wiring is a one-line change once the endpoints ship.
//
// AIDEV-NOTE: contract-request — proposed routes:
//   GET /v2/mailboxes/{mailbox_id}/bounces?type&since&cursor&limit  -> BouncePage
//   GET /v2/organizations/{organization_id}/suppressions?q&cursor&limit -> SuppressionPage
// Both are protected reads echoing context_id/authorization_version and their scope id, same as the
// other v2 adapters. The server owns suppression removal; no write port is proposed here.
import type { FetchLike } from './transport'
import { requestJson } from './transport'
import { CollaborationErrorSchema } from '../contract'
import { GatewayError } from '../errors'
import type { ReadContext } from '../gateway'
import {
  BouncePageSchema,
  SuppressionPageSchema,
  type BounceQuery,
  type DeliveryReportsGateway,
  type SuppressionQuery,
} from '../deliveryReportsContract'
import { z } from 'zod'

const id = z.uuid()
const headers = (ctx: ReadContext): Record<string, string> => ({
  'X-Session-Context': ctx.contextId,
  'X-Authorization-Version': ctx.authorizationVersion,
})

function limitParam(params: URLSearchParams, limit: number | undefined): void {
  if (limit === undefined) return
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new GatewayError('transport', 'malformed', 'Invalid page limit.')
  }
  params.set('limit', String(limit))
}

function cursorParam(params: URLSearchParams, value: string | undefined): void {
  if (value === undefined) return
  if (value.length < 1 || value.length > 2048) throw new GatewayError('transport', 'malformed', 'Invalid page cursor.')
  params.set('cursor', value)
}

/** Candidate HTTP adapter over the proposed v2 delivery-report routes; fleet proof is pending. */
export function createHttpDeliveryReportsGateway(fetchImpl?: FetchLike): DeliveryReportsGateway {
  const base = fetchImpl === undefined ? {} : { fetchImpl }
  return {
    simulated: false,
    async listBounces(ctx, mailboxId, query: BounceQuery, signal) {
      const scope = id.parse(mailboxId)
      const params = new URLSearchParams()
      if (query.type !== undefined) params.set('type', query.type)
      if (query.since !== undefined) {
        // Bound the lower edge to a valid instant before it leaves the browser.
        if (Number.isNaN(Date.parse(query.since))) throw new GatewayError('transport', 'malformed', 'Invalid time window.')
        params.set('since', query.since)
      }
      cursorParam(params, query.cursor)
      limitParam(params, query.limit)
      const suffix = params.toString() === '' ? '' : `?${params}`
      const page = await requestJson(`/v2/mailboxes/${encodeURIComponent(scope)}/bounces${suffix}`, BouncePageSchema, 65_536, {
        ...base, errorSchema: CollaborationErrorSchema, headers: headers(ctx), signal,
      })
      if (page.context_id !== ctx.contextId || page.authorization_version !== ctx.authorizationVersion || page.mailbox_id !== scope) {
        throw new GatewayError('transport', 'malformed', 'Bounces changed scope.')
      }
      return page
    },
    async listSuppressions(ctx, organizationId, query: SuppressionQuery, signal) {
      const scope = id.parse(organizationId)
      const params = new URLSearchParams()
      if (query.q !== undefined) {
        if (query.q.length > 254) throw new GatewayError('transport', 'malformed', 'Search is too long.')
        params.set('q', query.q)
      }
      cursorParam(params, query.cursor)
      limitParam(params, query.limit)
      const suffix = params.toString() === '' ? '' : `?${params}`
      const page = await requestJson(`/v2/organizations/${encodeURIComponent(scope)}/suppressions${suffix}`, SuppressionPageSchema, 65_536, {
        ...base, errorSchema: CollaborationErrorSchema, headers: headers(ctx), signal,
      })
      if (page.context_id !== ctx.contextId || page.authorization_version !== ctx.authorizationVersion || page.organization_id !== scope) {
        throw new GatewayError('transport', 'malformed', 'Suppressions changed scope.')
      }
      return page
    },
  }
}
