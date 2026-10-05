import { z } from 'zod'
import { ApiError, authenticateSession, sessionCookieName, idSchema, jsonBody, boundedText } from './core'
import { SendLedger } from './ledger'
import { resourceRoute } from './resources'
import { captureEvent, unsubscribe } from './events'
import { parsePolicyConfig } from './policies/config'
import { DurableFakeProvider } from './providers/durableFake'
import { aiRoute } from './aiRoute'
import { issueNativeDraft, redeemNativeDraft } from './nativeDraftRoute'
import { approvalInput, capabilitiesResponse, createdIntent, intentResponse, savedResponse } from './contracts/v1'
import { currentUserResponse, logoutResponse } from './contracts/v1'
import { recoveryRoute } from './recoveryRoute'
import { contactsRoute } from './contactsRoute'
import { campaignsRoute } from './campaignsRoute'
import { sequenceRoute } from './sequenceRoute'
import { connectionRoute } from './connectionRoute'
import { createAppLogin } from './loginConfig'
import { appLoginRoute } from './appLoginRoute'
import { createGmailRuntime } from './gmailConfig'
import { gmailRoute } from './gmailRoute'
import { gmailSendingRoute } from './gmailSendingRoute'
import { searchRoute } from './searchRoute'
import { importRoute } from './importRoute'
import { runGmailSchedule } from './gmailScheduler'
import { createResendRuntime } from './resendConfig'
import { resendRoute } from './resendRoute'
import { createHunterRuntime } from './hunterConfig'
import { hunterRoute } from './hunterRoute'
import { resendEventRoute } from './resendEventRoute'
import { resendReplyRoute, mailboxReplyChannel } from './resendReplyRoute'
import { sendInputSchema } from './policies/send'
import { dispatchJob } from './dispatchJob'
import { cleanupExpired, trackedJob, jobHealth } from './maintenance'

// AIDEV-NOTE: Simulation is the default; provider resolution and database/config pauses gate external dispatch.
const jobSchema = z.object({ owner: idSchema, id: idSchema }).strict()
export async function relay(env: Env, now: number): Promise<void> {
  const ledger = new SendLedger(env.DB)
  await ledger.recover(now)
  // AIDEV-NOTE: Reconciliation only reads receipts, even during pause; absence never authorises another send.
  const unknown = await env.DB.prepare(`SELECT owner,id FROM send_intents WHERE status='unknown'
    AND EXISTS (SELECT 1 FROM send_bindings b WHERE b.owner=send_intents.owner
      AND b.intent_id=send_intents.id AND b.provider='fake')
    AND reconcile_at<=? AND reconcile_attempts<10 ORDER BY reconcile_at,id LIMIT 20`).bind(now)
    .all<{ owner: string; id: string }>()
  for (const row of unknown.results) await ledger.reconcile(row.owner, row.id, new DurableFakeProvider(env.DB), now)
  if (parsePolicyConfig(env).DISPATCH_PAUSED === 'true') return
  const control = await env.DB.prepare('SELECT dispatch_paused FROM runtime_controls WHERE id=1').first<{ dispatch_paused: number }>()
  if (control?.dispatch_paused !== 0) return
  // AIDEV-NOTE: Skip blocked sequence steps before LIMIT so follow-ups cannot starve independent sends.
  const rows = await env.DB.prepare(`SELECT owner,id FROM send_intents WHERE status='pending' AND scheduled_at<=?
    AND NOT EXISTS(SELECT 1 FROM sequence_steps s WHERE s.owner=send_intents.owner AND s.intent_id=send_intents.id
      AND (NOT EXISTS(SELECT 1 FROM send_bindings b WHERE b.owner=s.owner AND b.intent_id=s.intent_id AND (b.provider='fake' OR (b.provider='resend' AND ?=1)))
        OR (s.predecessor_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM send_intents p
          WHERE p.owner=s.owner AND p.id=s.predecessor_id AND p.status='accepted'))))
    ORDER BY updated_at,id LIMIT 100`).bind(now,
      z.object({ RESEND_SEQUENCES_ENABLED: z.enum(['true', 'false']).default('false') }).parse(env).RESEND_SEQUENCES_ENABLED === 'true' ? 1 : 0).all<{ owner: string; id: string }>()
  for (const row of rows.results) await env.SEND_QUEUE.send(row)
}
export async function handleRequest(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const response = await routeRequest(request, env, now)
  // AIDEV-NOTE: Legacy route builders carry simulation metadata; normalize it once at the public HTTP boundary.
  if (String(env.LIVE_SENDING) !== 'enabled' || response.status >= 400 ||
      !response.headers.get('content-type')?.includes('application/json')) return response
  const body: unknown = await response.json()
  if (body && typeof body === 'object' && !Array.isArray(body) && 'simulated' in body) body.simulated = false
  return new Response(JSON.stringify(body), { status: response.status, headers: response.headers })
}
async function routeRequest(request: Request, env: Env, now: number): Promise<Response> {
  const requestId = crypto.randomUUID()
  try {
    const path = new URL(request.url).pathname
    const nativeDraft = await redeemNativeDraft(request, path, env.DB, now)
    if (nativeDraft) return nativeDraft
    const resendReply = await resendReplyRoute(request, env.DB, env, now)
    if (resendReply) return resendReply
    const resendEvent = await resendEventRoute(request, env.DB, env, now)
    if (resendEvent) return resendEvent
    const event = /^\/v1\/events\/([a-zA-Z0-9_-]+)$/u.exec(path)
    if (event && request.method === 'POST') return await captureEvent(request, event[1]!, env, now)
    const optout = /^\/unsubscribe\/([a-zA-Z0-9_-]+)$/u.exec(path)
    if (optout) return await unsubscribe(request, optout[1]!, env.DB, now)
    // AIDEV-NOTE: An unrelated deployment configuration error must never prevent opt-out or signed receipts.
    const policy = parsePolicyConfig(env)
    if (path.startsWith('/v1/login/') || path === '/login/callback') {
      // AIDEV-NOTE: Login configuration is evaluated only for public login routes, never on inbox hot paths.
      const login = await createAppLogin(env.DB, env)
      if (path === '/v1/login/status' && request.method === 'GET') {
        if (new URL(request.url).search) throw new ApiError('validation_failed')
        return Response.json({ enabled: login !== undefined }, { headers: { 'cache-control': 'no-store' } })
      }
      const response = await appLoginRoute(request, login)
      if (response) return response
      throw new ApiError('not_found', 404)
    }
    const session = await authenticateSession(request, env.DB, now)
    const owner = session.owner
    if (path === '/v1/ai/native/tickets' && request.method === 'POST') {
      if (new URL(request.url).search) throw new ApiError('validation_failed')
      return await issueNativeDraft(request, session, env.DB, now)
    }
    if ((path === '/v1/me' && request.method === 'GET') || (path === '/v1/session/logout' && request.method === 'POST')) {
      if (new URL(request.url).search) throw new ApiError('validation_failed')
      if (path === '/v1/me') {
        const account = await env.DB.prepare('SELECT account_id FROM accounts WHERE owner=?').bind(owner).first<{ account_id: string }>()
        if (!account) throw new ApiError('internal_error', 500)
        return Response.json(currentUserResponse.parse({ accountId: account.account_id,
          session: { expiresAt: session.expires_at }, simulated: true }))
      }
      // AIDEV-NOTE: HTTP adapters may create an empty stream for bodyless POST; reject payload bytes, not stream presence.
      if (request.body !== null && await boundedText(request) !== '') throw new ApiError('validation_failed')
      await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(session.token_hash).run()
      return Response.json(logoutResponse.parse({ signedOut: true, simulated: true }), { headers: {
        'set-cookie': `${sessionCookieName}=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` } })
    }
    if (path === '/v1/capabilities' && request.method === 'GET') {
      if (policy.LIVE_SENDING === 'enabled') {
        if (policy.PROVIDER_MODE !== 'gmail') await createResendRuntime(env.DB, env)
        if (policy.PROVIDER_MODE !== 'resend') await createGmailRuntime(env.DB, env)
      }
      const control = await env.DB.prepare('SELECT dispatch_paused FROM runtime_controls WHERE id=1').first<{ dispatch_paused: number }>()
      return Response.json(capabilitiesResponse.parse({ version: 1, simulated: policy.LIVE_SENDING !== 'enabled', liveSending: policy.LIVE_SENDING === 'enabled', dnsWrites: false,
        features: { mailboxInventory: true, messages: true, manualSend: true, campaignWizard: false,
          inboxSync: (await createGmailRuntime(env.DB, env)) !== undefined,
          historyImport: true, aiBridge: false }, policy: { provisional: true, windowHours: 24, mailboxLimit: 30,
          userLimit: 300, users: 10, connectedMailboxes: 10 }, dispatchPaused: policy.DISPATCH_PAUSED === 'true' || control?.dispatch_paused !== 0 }))
    }
    // AIDEV-NOTE: Provider credential configuration is evaluated only on its own connection routes.
    if (path.startsWith('/v1/hunter/')) {
      const response = await hunterRoute(request, path, session, env.DB, () => createHunterRuntime(env.DB, env), now)
      if (response) return response
    }
    if (path.startsWith('/v1/resend/')) {
      const response = await resendRoute(request, path, session, env.DB, () => createResendRuntime(env.DB, env), now)
      if (response) return response
    }
    // AIDEV-NOTE: Optional Gmail config is off inbox hot paths and cannot prevent credential revocation.
    const gmailPath = path === '/v1/gmail/status' || path.startsWith('/v1/connections/oauth/') ||
      /^\/v1\/connections\/[^/]+\/mailbox$/u.test(path) || /^\/v1\/mailboxes\/[^/]+\/sync$/u.test(path)
    const gmail = gmailPath ? await createGmailRuntime(env.DB, env) : undefined
    const gmailResponse = await gmailRoute(request, path, session, env.DB, gmail, now)
    if (gmailResponse) return gmailResponse
    const imported = await importRoute(request, path, session, env.DB, now)
    if (imported) return imported
    const sendingPermission = await gmailSendingRoute(request, path, session, env.DB, () => createGmailRuntime(env.DB, env), now)
    if (sendingPermission) return sendingPermission
    const connections = await connectionRoute(request, path, session, env.DB, gmail?.oauth, now, gmail?.sendOauth)
    if (connections) return connections
    const ai = await aiRoute(request, path, owner, env.DB, now)
    if (ai) return ai
    const contacts = await contactsRoute(request, path, owner, env.DB)
    if (contacts) return contacts
    const sequences = await sequenceRoute(request, path, owner, env.DB, now, policy.UNSUBSCRIBE_ORIGIN, env)
    if (sequences) return sequences
    const campaigns = await campaignsRoute(request, path, owner, env.DB, now, policy.UNSUBSCRIBE_ORIGIN, env)
    if (campaigns) return campaigns
    const search = await searchRoute(request, path, owner, env)
    if (search) return search
    const resource = await resourceRoute(request, path, owner, env, now)
    if (resource) return resource
    const ledger = new SendLedger(env.DB, policy.UNSUBSCRIBE_ORIGIN, undefined, env)
    const recovery = await recoveryRoute(request, path, owner, env.DB, now, policy.UNSUBSCRIBE_ORIGIN)
    if (recovery) return recovery
    if (path === '/v1/send-intents' && request.method === 'POST') {
      const input = sendInputSchema.parse(await jsonBody(request))
      const creator = new SendLedger(env.DB, policy.UNSUBSCRIBE_ORIGIN, await mailboxReplyChannel(env.DB, env, owner, input.mailboxId))
      return Response.json(createdIntent.parse({ ...await creator.create(owner, input, now), simulated: true }), { status: 201 })
    }
    const action = /^\/v1\/send-intents\/([a-zA-Z0-9_-]+)\/(approve|cancel)$/u.exec(path)
    if (action && request.method === 'POST') {
      let enqueue: 'queued' | 'deferred' | 'not_applicable' = 'not_applicable'
      if (action[2] === 'approve') {
        const input = approvalInput.parse(await jsonBody(request))
        await ledger.approve(owner, action[1]!, input.revision, now, policy.APPROVAL_TTL_SECONDS * 1000)
        // AIDEV-NOTE: Approval commits before enqueue; relay may recover it only while approval remains valid.
        enqueue = 'deferred'
        const control = await env.DB.prepare('SELECT dispatch_paused FROM runtime_controls WHERE id=1').first<{ dispatch_paused: number }>()
        if (policy.DISPATCH_PAUSED === 'false' && control?.dispatch_paused === 0) {
          const due = await env.DB.prepare('SELECT scheduled_at FROM send_intents WHERE owner=? AND id=?')
            .bind(owner, action[1]!).first<{ scheduled_at: number }>()
          if (due && due.scheduled_at <= now) {
            try { await env.SEND_QUEUE.send({ owner, id: action[1]! }); enqueue = 'queued' }
            catch {
              await env.DB.prepare(`UPDATE send_intents SET error_code='enqueue_deferred',correlation_id=?
                WHERE owner=? AND id=? AND status='pending'`).bind(requestId, owner, action[1]!).run()
            }
          }
        }
      } else await ledger.cancel(owner, action[1]!, now)
      return Response.json(savedResponse.parse({ saved: true, simulated: true, enqueue }))
    }
    const intent = /^\/v1\/send-intents\/([a-zA-Z0-9_-]+)$/u.exec(path)
    if (intent && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT id,revision,status,scheduled_at,dispatch_at,provider_id,error_code,correlation_id,approval_expires_at FROM send_intents WHERE owner=? AND id=?')
        .bind(owner, intent[1]!).first()
      if (!row) throw new ApiError('intent_not_found', 404)
      return Response.json(intentResponse.parse({ intent: row, simulated: true }))
    }
    if (path === '/v1/health' && request.method === 'GET') {
      const control = await env.DB.prepare('SELECT dispatch_paused FROM runtime_controls WHERE id=1').first<{ dispatch_paused: number }>()
      const counts = await env.DB.prepare("SELECT status,count(*) AS count FROM send_intents WHERE owner=? GROUP BY status")
        .bind(owner).all()
      // AIDEV-NOTE: Incomplete imports stay visible even when the cursor advances past unsupported message content.
      const incomplete = await env.DB.prepare('SELECT count(*) AS count FROM gmail_sync_issues WHERE owner=?')
        .bind(owner).first<{ count: number }>()
      if (policy.LIVE_SENDING === 'enabled') {
        if (policy.PROVIDER_MODE !== 'gmail') await createResendRuntime(env.DB, env)
        if (policy.PROVIDER_MODE !== 'resend') await createGmailRuntime(env.DB, env)
      }
      return Response.json({ sends: counts.results, simulated: policy.LIVE_SENDING !== 'enabled', liveSending: policy.LIVE_SENDING === 'enabled', dnsWrites: false,
        incompleteMessages: incomplete?.count ?? 0, backgroundJobs: await jobHealth(env.DB, now),
        dispatchPaused: policy.DISPATCH_PAUSED === 'true' || control?.dispatch_paused !== 0, integrationReady: false })
    }
    throw new ApiError('not_found', 404)
  } catch (error) {
    const knownCodes = ['mailbox_limit', 'approval_required', 'approval_expired', 'mailbox_permission', 'campaign_paused',
      'suppressed', 'consent_or_reply_stop', 'owner_quota_exceeded', 'quota_exceeded', 'dispatch_paused', 'event_conflict',
      'send_binding_changed', 'sequence_live_disabled', 'sequence_predecessor_pending']
    const databaseCode = error instanceof Error ? knownCodes.find(code => error.message.includes(code)) : undefined
    const code = error instanceof ApiError ? error.code : error instanceof z.ZodError ? 'validation_failed' : databaseCode ?? 'internal_error'
    const status = error instanceof ApiError ? error.status : error instanceof z.ZodError ? 400 : databaseCode ? 409 : 500
    return Response.json({ error: { code, requestId } }, { status, headers: { 'cache-control': 'no-store' } })
  }
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const response = await handleRequest(request, env)
    response.headers.set('cache-control', 'no-store')
    response.headers.set('x-content-type-options', 'nosniff')
    return response
  },
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    // AIDEV-NOTE: Await both independent jobs; inbox configuration failures must not skip send recovery.
    const results = await Promise.allSettled([trackedJob(env.DB, 'dispatch', () => relay(env, Date.now())), trackedJob(env.DB, 'inbox', async () => {
      const gmail = await createGmailRuntime(env.DB, env)
      if (gmail) await runGmailSchedule(env.DB, gmail)
    }), trackedJob(env.DB, 'cleanup', () => cleanupExpired(env.DB, Date.now()))])
    for (const result of results) if (result.status === 'rejected') throw result.reason
  },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const policy = parsePolicyConfig(env)
    for (const [index, message] of batch.messages.entries()) {
      if (index >= 10) { message.retry({ delaySeconds: 60 }); continue }
      const job = jobSchema.safeParse(message.body)
      if (!job.success) { message.ack(); continue }
      if (policy.DISPATCH_PAUSED === 'true') { message.ack(); continue }
      try {
        await dispatchJob(env.DB, job.data, env, Date.now())
        message.ack()
      } catch (error) {
        const revoked = error instanceof Error && ['approval_expired', 'mailbox_permission', 'campaign_paused',
          'suppressed', 'consent_or_reply_stop'].some(code => error.message.includes(code))
        // AIDEV-NOTE: Revoked eligibility ends this approval, preventing ineligible intents from starving relay pages.
        if (revoked) { await new SendLedger(env.DB).cancel(job.data.owner, job.data.id, Date.now()); message.ack() }
        else message.retry({ delaySeconds: 60 })
      }
    }
  },
} satisfies ExportedHandler<Env>
