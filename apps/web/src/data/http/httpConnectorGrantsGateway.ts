// HTTP adapter for the proposed connector-grant routes. Mirrors the bounded transport and
// CollaborationError envelope used by the V2 adapters; every response is validated before the UI
// sees it, and the create body is validated before it leaves the browser.
//
// AIDEV-NOTE: contract-request — these routes are NOT in contracts/v1 or v2. This adapter exists so
// the Connections screen can switch on from an honest unavailable state the moment the server
// advertises support; production (main.tsx) leaves the capability unwired until then. See the report.
import type { z } from 'zod'
import { CollaborationErrorSchema } from '../contract'
import { GatewayError } from '../errors'
import type { CsrfProof, ReadContext } from '../gateway'
import {
  CONNECTOR_GRANTS_MAX_BYTES,
  CONNECTOR_GRANT_REQUEST_MAX_BYTES,
  ConnectorGrantCreateInputSchema,
  ConnectorGrantListSchema,
  ConnectorGrantRevokedSchema,
  ConnectorGrantSchema,
  ConnectorGrantSecretSchema,
  type ConnectorGrantsGateway,
} from '../connectorGrantsContract'
import { requestJson, type FetchLike } from './transport'

const seg = encodeURIComponent

function contextHeaders(ctx: ReadContext): Record<string, string> {
  return { 'X-Session-Context': ctx.contextId, 'X-Authorization-Version': ctx.authorizationVersion }
}
function proofHeaders(proof: CsrfProof): Record<string, string> {
  return { 'X-CSRF-Token': proof.csrfToken }
}

/** Browser-side input validation: a malformed value never leaves the device and is never logged. */
function validated<S extends z.ZodType>(schema: S, input: z.input<S>): z.output<S> {
  const result = schema.safeParse(input)
  if (!result.success) throw new GatewayError('transport', 'malformed', 'The entered values are not acceptable.')
  return result.data
}

export function createHttpConnectorGrantsGateway(fetchImpl?: FetchLike): ConnectorGrantsGateway {
  const base = fetchImpl === undefined ? {} : { fetchImpl }
  const errorSchema = CollaborationErrorSchema
  return {
    listConnectorGrants(ctx, signal) {
      return requestJson('/v2/me/connector-grants', ConnectorGrantListSchema, CONNECTOR_GRANTS_MAX_BYTES, { ...base, errorSchema, headers: contextHeaders(ctx), signal })
    },
    async createConnectorGrant(ctx, proof, input, signal) {
      const body = validated(ConnectorGrantCreateInputSchema, input)
      return requestJson('/v2/me/connector-grants', ConnectorGrantSecretSchema, CONNECTOR_GRANTS_MAX_BYTES, {
        ...base,
        errorSchema,
        headers: { ...contextHeaders(ctx), ...proofHeaders(proof) },
        body,
        method: 'POST',
        maxRequestBytes: CONNECTOR_GRANT_REQUEST_MAX_BYTES,
        signal,
      })
    },
    async revokeConnectorGrant(ctx, proof, grantId, signal) {
      // DELETE carries no body; a small literal ack keeps the JSON transport contract satisfied.
      await requestJson(`/v2/me/connector-grants/${seg(grantId)}`, ConnectorGrantRevokedSchema, 1_024, {
        ...base,
        errorSchema,
        headers: { ...contextHeaders(ctx), ...proofHeaders(proof) },
        method: 'DELETE',
        signal,
      })
    },
    async removeConnectorGrantMailbox(ctx, proof, grantId, mailboxId, signal) {
      // Returns the updated grant (its remaining mailboxes); the server revokes the whole grant if the
      // last mailbox is removed, which the caller handles by reconciling against the next list.
      return requestJson(`/v2/me/connector-grants/${seg(grantId)}/mailboxes/${seg(mailboxId)}`, ConnectorGrantSchema, CONNECTOR_GRANTS_MAX_BYTES, {
        ...base,
        errorSchema,
        headers: { ...contextHeaders(ctx), ...proofHeaders(proof) },
        method: 'DELETE',
        signal,
      })
    },
  }
}
