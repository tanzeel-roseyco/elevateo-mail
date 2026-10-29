// Connector (MCP) access grants for the signed-in user: the typed port and the zod-validated wire
// shapes the Connections screen (Settings › Integrations) uses to list, grant, revoke and trim
// per-mailbox AI access.
//
// AIDEV-NOTE: contract-request — no connector-grant endpoints exist in contracts/v1 or v2 yet. The
// v2 `/v2/organizations/{id}/grants` routes are ADMIN mailbox grants, a different concept. This
// module is the single client-side spelling of the proposed `/v2/me/connector-grants` routes; the
// HTTP adapter (httpConnectorGrantsGateway.ts) is wired only when the server advertises support, and
// absent that the Connections screen renders an honest unavailable state. See the task report.
import { z } from 'zod'
import type { CsrfProof, ReadContext } from './gateway'

/** Tool scopes a connection may hold per mailbox (docs/desktop-and-connectors.md §4). */
export const CONNECTOR_SCOPES = ['mailbox:read', 'draft:write'] as const
export type ConnectorScope = (typeof CONNECTOR_SCOPES)[number]

/** Known MCP client families; `other` covers any assistant that is neither Claude nor Codex. */
export const CONNECTOR_CLIENT_KINDS = ['claude', 'codex', 'other'] as const
export type ConnectorClientKind = (typeof CONNECTOR_CLIENT_KINDS)[number]

/** Per-user connection cap and per-connection mailbox cap; the byte budgets below derive from both. */
export const CONNECTOR_GRANTS_MAX_ITEMS = 20
export const CONNECTOR_GRANT_MAX_MAILBOXES = 50

const id = z.uuid()
// Timestamps carry an offset or Z; the client only formats them, never parses them into decisions.
const isoDateTime = z.iso.datetime({ offset: true })

/** One mailbox a connection can reach, with the scopes granted on it (server-resolved display name). */
export const ConnectorGrantMailboxSchema = z.strictObject({
  mailbox_id: id,
  display_name: z.string().min(1).max(256),
  scopes: z.array(z.enum(CONNECTOR_SCOPES)).min(1),
})
export type ConnectorGrantMailbox = z.infer<typeof ConnectorGrantMailboxSchema>

/** A single connector connection: one client credential spanning one or more mailboxes. */
export const ConnectorGrantSchema = z.strictObject({
  id,
  client_name: z.string().min(1).max(120),
  client_kind: z.enum(CONNECTOR_CLIENT_KINDS),
  created_at: isoDateTime,
  last_used_at: isoDateTime.nullable(),
  expires_at: isoDateTime.nullable(),
  mailboxes: z.array(ConnectorGrantMailboxSchema).min(1).max(CONNECTOR_GRANT_MAX_MAILBOXES),
})
export type ConnectorGrant = z.infer<typeof ConnectorGrantSchema>

export const ConnectorGrantListSchema = z.strictObject({
  items: z.array(ConnectorGrantSchema).max(CONNECTOR_GRANTS_MAX_ITEMS),
})
export type ConnectorGrantList = z.infer<typeof ConnectorGrantListSchema>

/** Create response: the new grant plus its bearer secret, returned exactly once (never re-readable). */
export const ConnectorGrantSecretSchema = z.strictObject({
  grant: ConnectorGrantSchema,
  secret: z.string().min(1).max(512),
})
export type ConnectorGrantSecret = z.infer<typeof ConnectorGrantSecretSchema>

/** DELETE revoke acknowledgement; the body is a single literal so the adapter can return void. */
export const ConnectorGrantRevokedSchema = z.strictObject({ revoked: z.literal(true) })

/** Create input: mailbox ids and their scopes only. The server resolves and returns display names. */
export const ConnectorGrantCreateInputSchema = z.strictObject({
  client_name: z.string().min(1).max(120),
  client_kind: z.enum(CONNECTOR_CLIENT_KINDS),
  /** Null means the connection never expires; otherwise an ISO instant in the future. */
  expires_at: isoDateTime.nullable(),
  mailboxes: z
    .array(z.strictObject({ mailbox_id: id, scopes: z.array(z.enum(CONNECTOR_SCOPES)).min(1) }))
    .min(1)
    .max(CONNECTOR_GRANT_MAX_MAILBOXES),
})
export type ConnectorGrantCreateInput = z.infer<typeof ConnectorGrantCreateInputSchema>

// AIDEV-NOTE: budgets are derived from the schema limits, never hand-picked, so a schema-valid
// response is never rejected as oversized (review P19-1). Strings are costed at 6 bytes per character
// (the worst JSON escape, a backslash-u sequence); 128/512 bytes cover keys, punctuation, timestamps.
const MAILBOX_MAX_BYTES = 36 + 256 * 6 + 128
const GRANT_MAX_BYTES = 36 + 120 * 6 + 512 + CONNECTOR_GRANT_MAX_MAILBOXES * MAILBOX_MAX_BYTES
/** List response budget: every grant at its maximum size (about 1.7 MB). */
export const CONNECTOR_GRANTS_MAX_BYTES = CONNECTOR_GRANTS_MAX_ITEMS * GRANT_MAX_BYTES + 64
/** Single-grant response budget (create with its secret, or mailbox removal). */
export const CONNECTOR_GRANT_MAX_BYTES = GRANT_MAX_BYTES + 512 * 6 + 64
/** Request byte budget for a create body (mailbox id + scopes list). */
export const CONNECTOR_GRANT_REQUEST_MAX_BYTES = 16_384

/**
 * User-scoped connector access administration. Reads take the read context; writes additionally take
 * the session CSRF proof. Every method rejects with GatewayError only and honours the abort signal.
 */
export interface ConnectorGrantsGateway {
  listConnectorGrants(ctx: ReadContext, signal?: AbortSignal): Promise<ConnectorGrantList>
  createConnectorGrant(ctx: ReadContext, proof: CsrfProof, input: ConnectorGrantCreateInput, signal?: AbortSignal): Promise<ConnectorGrantSecret>
  revokeConnectorGrant(ctx: ReadContext, proof: CsrfProof, grantId: string, signal?: AbortSignal): Promise<void>
  removeConnectorGrantMailbox(ctx: ReadContext, proof: CsrfProof, grantId: string, mailboxId: string, signal?: AbortSignal): Promise<ConnectorGrant>
}
