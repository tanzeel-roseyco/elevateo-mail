import { z } from 'zod'
import { ApiError, idSchema } from './core'
import { SendLedger } from './ledger'
import { DurableFakeProvider } from './providers/durableFake'
import { createResendRuntime } from './resendConfig'
import { resolveSendRuntime } from './sendRuntime'
import type { ProviderFetch } from './providers/http'
import { parsePolicyConfig } from './policies/config'
import { createGmailRuntime } from './gmailConfig'
import { resolveGmailSendRuntime } from './gmailSendRuntime'

const jobSchema = z.object({ owner: idSchema, id: idSchema }).strict()
const permanent = ['approval_expired', 'mailbox_permission', 'campaign_paused', 'suppressed',
  'consent_or_reply_stop', 'send_binding_changed', 'send_binding_missing', 'send_provider_unsupported',
  'unsubscribe_required', 'route_forbidden', 'connection_not_found']
// AIDEV-NOTE: Never roll back dispatching/unknown after an exception; those states may already have sent mail.
export async function dispatchJob(db: D1Database, raw: unknown, env: unknown, now: number,
  fetcher: ProviderFetch = fetch): Promise<'noop' | 'processed' | 'deferred' | 'cancelled'> {
  const parsed = jobSchema.safeParse(raw)
  if (!parsed.success) return 'noop'
  const { owner, id } = parsed.data
  const pending = await db.prepare(`SELECT approval_expires_at FROM send_intents
    WHERE owner=? AND id=? AND status='pending' AND scheduled_at<=?`).bind(owner, id, now)
    .first<{ approval_expires_at: number | null }>()
  if (!pending) return 'noop'
  try {
    if (pending.approval_expires_at === null || pending.approval_expires_at <= now) throw new ApiError('approval_expired', 409)
    let policy: ReturnType<typeof parsePolicyConfig>
    try { policy = parsePolicyConfig(env) } catch { throw new ApiError('send_configuration_invalid', 503) }
    if (policy.DISPATCH_PAUSED === 'true') throw new ApiError('dispatch_paused', 503)
    const snapshot = await db.prepare('SELECT provider FROM send_bindings WHERE owner=? AND intent_id=?')
      .bind(owner, id).first<{ provider: string }>()
    if (!snapshot) throw new ApiError('send_binding_missing', 409)
    const ledger = new SendLedger(db, undefined, undefined, env)
    if (snapshot.provider === 'fake') {
      if (policy.PROVIDER_MODE !== 'fake') throw new ApiError('simulation_binding_disabled', 503)
      await ledger.dispatch(owner, id, new DurableFakeProvider(db), now)
    }
    else if (snapshot.provider === 'gmail') {
      if (policy.LIVE_SENDING !== 'enabled' || !['gmail', 'mixed'].includes(policy.PROVIDER_MODE)) throw new ApiError('live_disabled', 503)
      const runtime = await createGmailRuntime(db, env, fetcher)
      if (!runtime?.sendOauth) throw new ApiError('live_disabled', 503)
      const started = performance.now()
      const resolved = await resolveGmailSendRuntime(db, owner, id, runtime, fetcher,
        () => now + Math.ceil(performance.now() - started))
      await ledger.dispatch(owner, id, resolved.provider, now + Math.ceil(performance.now() - started), resolved.binding)
    } else {
      if (snapshot.provider !== 'resend') throw new ApiError('send_provider_unsupported', 409)
      if (policy.LIVE_SENDING !== 'enabled' || !['resend', 'mixed'].includes(policy.PROVIDER_MODE)) throw new ApiError('live_disabled', 503)
      const runtime = await createResendRuntime(db, env, fetcher)
      if (!runtime) throw new ApiError('live_disabled', 503)
      const resolved = await resolveSendRuntime(db, owner, id, env, runtime.vault, fetcher)
      await ledger.dispatch(owner, id, resolved.provider, now, resolved.binding)
    }
    return 'processed'
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    const terminal = permanent.find(code => error instanceof ApiError ? error.code === code : message.includes(code))
    // AIDEV-NOTE: Persist only enumerated codes, never SQL text, transport errors or credential-bearing payloads.
    const code = terminal ?? (error instanceof ApiError && ['live_disabled', 'send_configuration_invalid',
      'resend_configuration_invalid', 'credential_unavailable', 'dispatch_paused',
      'simulation_binding_disabled'].includes(error.code) ? error.code : 'dispatch_deferred')
    await db.prepare(`UPDATE send_intents SET status=?,error_code=?,updated_at=?
      WHERE owner=? AND id=? AND status='pending'`).bind(terminal ? 'cancelled' : 'pending', code, now, owner, id).run()
    return terminal ? 'cancelled' : 'deferred'
  }
}
