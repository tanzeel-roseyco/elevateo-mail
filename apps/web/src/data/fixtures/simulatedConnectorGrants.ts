// Simulated, in-memory ConnectorGrantsGateway for the demo and dev-fixture entries. It is labelled
// "Simulated" wherever it is shown; nothing here reaches a server and no real AI connection is made.
//
// AIDEV-NOTE: Fixture/demo only — the production entry never wires this, so the Connections screen
// shows an honest unavailable state there. Display names come only from the create input's ids via a
// best-effort label; the screen prefers the live mailbox list for names and treats this as fallback.
import { GatewayError } from '../errors'
import type {
  ConnectorGrant,
  ConnectorGrantCreateInput,
  ConnectorGrantSecret,
  ConnectorGrantsGateway,
} from '../connectorGrantsContract'

/** 32 random bytes, base64url: the bearer secret shown once, never stored in a readable form. */
function generateSecret(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return 'elv_mcp_' + btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** Best-effort label when only an id is known; the screen overrides it with the live mailbox name. */
function fallbackName(mailboxId: string): string {
  return `Mailbox ${mailboxId.slice(0, 8)}`
}

/** One seeded example so the demo shows a populated Connections screen (clearly simulated). */
/** Detached copy (including each scopes array) so callers can never mutate the stored grants. */
function copyGrant(grant: ConnectorGrant): ConnectorGrant {
  return { ...grant, mailboxes: grant.mailboxes.map((m) => ({ ...m, scopes: [...m.scopes] })) }
}

/** Honours the port's cancellation contract: a cancelled call neither reads nor mutates state. */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new GatewayError('transport', 'aborted', 'The request was cancelled.')
}

function seed(): ConnectorGrant[] {
  const now = Date.now()
  const iso = (offsetMs: number) => new Date(now - offsetMs).toISOString()
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      client_name: 'Claude Desktop (laptop)',
      client_kind: 'claude',
      created_at: iso(5 * 86_400_000),
      last_used_at: iso(3 * 3_600_000),
      expires_at: null,
      mailboxes: [{ mailbox_id: '22222222-2222-4222-8222-222222222222', display_name: 'Team inbox', scopes: ['mailbox:read'] }],
    },
  ]
}

export function createSimulatedConnectorGrantsGateway(): ConnectorGrantsGateway {
  let grants = seed()
  return {
    async listConnectorGrants(_ctx, signal) {
      throwIfAborted(signal)
      return { items: grants.map(copyGrant) }
    },
    async createConnectorGrant(_ctx, _proof, input: ConnectorGrantCreateInput, signal): Promise<ConnectorGrantSecret> {
      throwIfAborted(signal)
      const grant: ConnectorGrant = {
        id: crypto.randomUUID(),
        client_name: input.client_name,
        client_kind: input.client_kind,
        created_at: new Date().toISOString(),
        last_used_at: null,
        expires_at: input.expires_at,
        mailboxes: input.mailboxes.map((m) => ({ mailbox_id: m.mailbox_id, display_name: fallbackName(m.mailbox_id), scopes: [...m.scopes] })),
      }
      grants = [grant, ...grants]
      return { grant: copyGrant(grant), secret: generateSecret() }
    },
    async revokeConnectorGrant(_ctx, _proof, grantId, signal) {
      throwIfAborted(signal)
      grants = grants.filter((grant) => grant.id !== grantId)
    },
    async removeConnectorGrantMailbox(_ctx, _proof, grantId, mailboxId, signal) {
      throwIfAborted(signal)
      const grant = grants.find((candidate) => candidate.id === grantId)
      if (grant === undefined) throw new GatewayError('api', 'not_available', 'That connection no longer exists.')
      // Removing the last mailbox would empty the grant; the screen revokes the whole connection instead.
      if (grant.mailboxes.length <= 1) throw new GatewayError('api', 'request_invalid', 'Revoke the connection to remove its only mailbox.')
      const updated: ConnectorGrant = { ...grant, mailboxes: grant.mailboxes.filter((m) => m.mailbox_id !== mailboxId) }
      grants = grants.map((candidate) => (candidate.id === grantId ? updated : candidate))
      return copyGrant(updated)
    },
  }
}
