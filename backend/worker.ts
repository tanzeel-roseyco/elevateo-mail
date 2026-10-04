import { z } from 'zod'
import { ApiError, authenticate, idSchema, jsonBody } from './core'
import { SendLedger } from './ledger'
import { resourceRoute } from './resources'
import { captureEvent, unsubscribe } from './events'
import { parsePolicyConfig } from './policies/config'
import { DurableFakeProvider } from './providers/durableFake'
import { aiRoute } from './aiRoute'

// AIDEV-NOTE: No live adapter is wired into any entry point. Database and config pauses both fail closed.
const jobSchema = z.object({ owner: idSchema, id: idSchema }).strict()
export async function relay(env: Env, now: number): Promise<void> {
  await new SendLedger(env.DB).recover(now)
  if (parsePolicyConfig(env).DISPATCH_PAUSED === 'true') return
  const control = await env.DB.prepare('SELECT dispatch_paused FROM runtime_controls WHERE id=1').first<{ dispatch_paused: number }>()
  if (control?.dispatch_paused !== 0) return
  const rows = await env.DB.prepare(`SELECT owner,id FROM send_intents WHERE status='pending' AND scheduled_at<=?
    ORDER BY scheduled_at,id LIMIT 100`).bind(now).all<{ owner: string; id: string }>()
  for (const row of rows.results) await env.SEND_QUEUE.send(row)
}
export async function handleRequest(request: Request, env: Env, now = Date.now()): Promise<Response> {
  const requestId = crypto.randomUUID()
  try {
    const policy = parsePolicyConfig(env)
    const path = new URL(request.url).pathname
    const event = /^\/v1\/events\/([a-zA-Z0-9_-]+)$/u.exec(path)
    if (event && request.method === 'POST') return await captureEvent(request, event[1]!, env, now)
    const optout = /^\/unsubscribe\/([a-zA-Z0-9_-]+)$/u.exec(path)
    if (optout) return await unsubscribe(request, optout[1]!, env.DB, now)
    const owner = await authenticate(request, env.DB, now)
    const ai = await aiRoute(request, path, owner, env.DB, now)
    if (ai) return ai
    const resource = await resourceRoute(request, path, owner, env)
    if (resource) return resource
    const ledger = new SendLedger(env.DB)
    if (path === '/v1/send-intents' && request.method === 'POST') {
      return Response.json({ ...await ledger.create(owner, await jsonBody(request), now), simulated: true }, { status: 201 })
    }
    const action = /^\/v1\/send-intents\/([a-zA-Z0-9_-]+)\/(approve|cancel)$/u.exec(path)
    if (action && request.method === 'POST') {
      if (action[2] === 'approve') {
        const input = z.object({ revision: z.string().regex(/^[a-f0-9]{64}$/u) }).strict().parse(await jsonBody(request))
        await ledger.approve(owner, action[1]!, input.revision, now, policy.APPROVAL_TTL_SECONDS * 1000)
      } else await ledger.cancel(owner, action[1]!, now)
      return Response.json({ saved: true, simulated: true })
    }
    const intent = /^\/v1\/send-intents\/([a-zA-Z0-9_-]+)$/u.exec(path)
    if (intent && request.method === 'GET') {
      const row = await env.DB.prepare('SELECT id,revision,status,scheduled_at,dispatch_at,provider_id,error_code FROM send_intents WHERE owner=? AND id=?')
        .bind(owner, intent[1]!).first()
      if (!row) throw new ApiError('intent_not_found', 404)
      return Response.json({ intent: row, simulated: true })
    }
    if (path === '/v1/health' && request.method === 'GET') {
      const control = await env.DB.prepare('SELECT dispatch_paused FROM runtime_controls WHERE id=1').first<{ dispatch_paused: number }>()
      const counts = await env.DB.prepare("SELECT status,count(*) AS count FROM send_intents WHERE owner=? GROUP BY status")
        .bind(owner).all()
      return Response.json({ sends: counts.results, simulated: true, liveSending: false, dnsWrites: false,
        dispatchPaused: policy.DISPATCH_PAUSED === 'true' || control?.dispatch_paused !== 0, integrationReady: false })
    }
    throw new ApiError('not_found', 404)
  } catch (error) {
    const knownCodes = ['mailbox_limit', 'approval_required', 'approval_expired', 'mailbox_permission', 'campaign_paused',
      'suppressed', 'consent_or_reply_stop', 'quota_exceeded', 'dispatch_paused', 'event_conflict']
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
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> { await relay(env, Date.now()) },
  async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
    const policy = parsePolicyConfig(env)
    for (const message of batch.messages) {
      const job = jobSchema.safeParse(message.body)
      if (!job.success) { message.ack(); continue }
      if (policy.DISPATCH_PAUSED === 'true') { message.ack(); continue }
      try {
        await new SendLedger(env.DB).dispatch(job.data.owner, job.data.id, new DurableFakeProvider(env.DB), Date.now())
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
