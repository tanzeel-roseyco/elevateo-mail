import { ApiError } from './core'
import { SendLedger, type DispatchBinding, type IntentRow } from './ledger'
import { resolveGmailCredential, type GmailRuntimeServices } from './gmailRuntime'
import { GmailProvider } from './providers/gmail'
import type { ProviderFetch } from './providers/http'
import { gmailSendScope } from './gmailSendingRoute'

// AIDEV-NOTE: Grant epoch survives refresh; the resolved token revision is checked again by the atomic claim.
export async function resolveGmailSendRuntime(db: D1Database, owner: string, id: string,
  services: GmailRuntimeServices, fetcher: ProviderFetch = fetch, now: () => number = Date.now) {
  const row = await db.prepare('SELECT * FROM send_intents WHERE owner=? AND id=?').bind(owner, id).first<IntentRow>()
  const binding = await db.prepare("SELECT credential_id,grant_epoch,permission_generation FROM send_bindings WHERE owner=? AND intent_id=? AND provider='gmail'")
    .bind(owner, id).first<{ credential_id: string; grant_epoch: number; permission_generation: number }>()
  if (!row || !binding || row.kind !== 'manual') throw new ApiError('send_binding_changed', 409)
  await new SendLedger(db).envelope(row)
  const current = await resolveGmailCredential(db, owner, row.mailbox_id, services, now)
  if (current.id !== binding.credential_id || current.grantEpoch !== binding.grant_epoch ||
    !current.credential.scopes.includes(gmailSendScope)) throw new ApiError('send_binding_changed', 409)
  return { provider: new GmailProvider(current.credential.accessToken, true, fetcher), binding: {
    provider: 'gmail', credentialId: current.id, credentialRevision: current.revision,
    grantEpoch: current.grantEpoch, permissionGeneration: binding.permission_generation,
  } satisfies DispatchBinding }
}
