import { z } from 'zod'
import { ApiError, idSchema, sha256 } from './core'
import { campaignOrigin } from './campaignEnvelope'
import { SendLedger, type DispatchBinding, type IntentRow } from './ledger'
import { ResendCredentials } from './resendCredentials'
import { DurableFakeProvider } from './providers/durableFake'
import { ResendProvider } from './providers/resend'
import type { ProviderFetch } from './providers/http'
import type { SendProvider } from './providers/ports'

// AIDEV-NOTE: Resolution never claims an intent; ledger SQL rechecks current binding at the dispatch transition.
export async function resolveSendRuntime(db: D1Database, owner: string, intentId: string, env: unknown,
  vault: ResendCredentials, fetcher: ProviderFetch = fetch): Promise<{ provider: SendProvider; binding: DispatchBinding }> {
  idSchema.parse(owner); idSchema.parse(intentId)
  const row = await db.prepare('SELECT * FROM send_intents WHERE owner=? AND id=?').bind(owner, intentId).first<IntentRow>()
  if (!row) throw new ApiError('intent_not_found', 404)
  const snapshot = await db.prepare('SELECT provider,credential_id,credential_revision,address FROM send_bindings WHERE owner=? AND intent_id=?')
    .bind(owner, intentId).first<{ provider: string; credential_id: string | null; credential_revision: number | null; address: string }>()
  if (!snapshot) throw new ApiError('send_binding_missing', 409)
  if (snapshot.provider === 'fake') return { provider: new DurableFakeProvider(db), binding: { provider: 'fake' } }
  if (snapshot.provider !== 'resend') throw new ApiError('send_provider_unsupported', 409)
  const flags = z.object({ RESEND_SENDING_ENABLED: z.enum(['true', 'false']).optional(),
    UNSUBSCRIBE_ORIGIN: z.string().optional() }).safeParse(env)
  if (!flags.success) throw new ApiError('send_configuration_invalid', 503)
  if (flags.data.RESEND_SENDING_ENABLED !== 'true') throw new ApiError('live_disabled', 503)
  let origin: string
  try { origin = campaignOrigin(flags.data.UNSUBSCRIBE_ORIGIN ?? '') }
  catch { throw new ApiError('send_configuration_invalid', 503) }
  const envelope = await new SendLedger(db).envelope(row)
  if (envelope.kind !== 'campaign' || envelope.to.length !== 1 || envelope.cc.length || envelope.bcc.length ||
      envelope.from !== snapshot.address) throw new ApiError('route_forbidden', 409)
  const footer = /\n\nUnsubscribe: (https:\/\/[^\s]+)\/unsubscribe\/([a-f0-9]{64})$/u.exec(envelope.body)
  if (!footer || footer[1] !== origin) throw new ApiError('unsubscribe_required', 409)
  const token = await db.prepare('SELECT 1 FROM unsubscribe_tokens WHERE token_hash=? AND owner=? AND email=?')
    .bind(await sha256(footer[2]!), owner, envelope.to[0]!).first()
  if (!token) throw new ApiError('unsubscribe_required', 409)
  if (!snapshot.credential_id || !snapshot.credential_revision) throw new ApiError('send_binding_missing', 409)
  const credential = await vault.readForServer(owner, snapshot.credential_id)
  if (credential.revision !== snapshot.credential_revision) throw new ApiError('send_binding_changed', 409)
  return { provider: new ResendProvider(credential.apiKey, snapshot.address, true, fetcher),
    binding: { provider: 'resend', credentialId: snapshot.credential_id, credentialRevision: snapshot.credential_revision } }
}
