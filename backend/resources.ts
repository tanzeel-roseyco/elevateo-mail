import { z } from 'zod'
import { ApiError, idSchema, jsonBody } from './core'
import { mailboxPage, messageDetail, messagePage, permissionsInput } from './contracts/v1'
import { quota } from './quota'

// AIDEV-NOTE: Only fake connections are writable; provider subjects must come from verified OAuth before live support.
const address = z.string().trim().toLowerCase().pipe(z.email().max(254))
const mailboxSchema = z.object({ subject: idSchema, address, sendEnabled: z.boolean().default(false) }).strict()
const contactSchema = z.object({ email: address, consentSource: z.string().trim().min(1).max(1024),
  optedIn: z.boolean() }).strict()
export async function resourceRoute(request: Request, path: string, owner: string, env: Env, now = Date.now()): Promise<Response | null> {
  const db = env.DB
  if (path === '/v1/mailboxes' && request.method === 'POST') {
    const input = mailboxSchema.parse(await jsonBody(request))
    const existing = await db.prepare("SELECT id,address FROM mailboxes WHERE owner=? AND provider='fake' AND subject=?")
      .bind(owner, input.subject).first<{ id: string; address: string }>()
    if (existing) {
      if (existing.address !== input.address) throw new ApiError('mailbox_identity_conflict', 409)
      await db.prepare('UPDATE mailboxes SET connected=1,send_enabled=? WHERE owner=? AND id=?')
        .bind(Number(input.sendEnabled), owner, existing.id).run()
      return Response.json({ id: existing.id, simulated: true })
    }
    const id = crypto.randomUUID()
    await db.prepare("INSERT INTO mailboxes(owner,id,provider,subject,address,send_enabled) VALUES(?,?,'fake',?,?,?) ON CONFLICT DO NOTHING")
      .bind(owner, id, input.subject, input.address, Number(input.sendEnabled)).run()
    const saved = await db.prepare("SELECT id,address FROM mailboxes WHERE owner=? AND provider='fake' AND subject=?")
      .bind(owner, input.subject).first<{ id: string; address: string }>()
    if (!saved || saved.address !== input.address) throw new ApiError('mailbox_identity_conflict', 409)
    // AIDEV-NOTE: Concurrent identity inserts must still apply the caller's requested permission.
    await db.prepare('UPDATE mailboxes SET connected=1,send_enabled=? WHERE owner=? AND id=?')
      .bind(Number(input.sendEnabled), owner, saved.id).run()
    return Response.json({ id: saved.id, simulated: true }, { status: saved.id === id ? 201 : 200 })
  }
  if (path === '/v1/mailboxes' && request.method === 'GET') {
    const params = new URL(request.url).searchParams
    if (new Set(params.keys()).size !== [...params.keys()].length) throw new ApiError('validation_failed')
    const query = z.object({ after: idSchema.optional(), id: idSchema.optional(), connected: z.enum(['true', 'false']).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(10) }).strict().parse(Object.fromEntries(params))
    // AIDEV-NOTE: Connected startup stays bounded; archived mailboxes remain explicitly paged or addressed by ID.
    const filters = ['owner=?', 'id>?']
    const values: (string | number)[] = [owner, query.after ?? '']
    if (query.connected !== undefined) { filters.push('connected=?'); values.push(Number(query.connected === 'true')) }
    if (query.id !== undefined) { filters.push('id=?'); values.push(query.id) }
    const result = await db.prepare(`SELECT id,address,provider,connected,send_enabled,ai_read,ai_draft,ai_send,arrival_count
      FROM mailboxes WHERE ${filters.join(' AND ')} ORDER BY id LIMIT ?`).bind(...values, query.limit + 1).all<{ id: string }>()
    const items = result.results.slice(0, query.limit)
    return Response.json(mailboxPage.parse({ items, next: result.results.length > query.limit
      ? { after: items.at(-1)!.id } : null, simulated: true }))
  }
  const capacity = /^\/v1\/mailboxes\/([a-zA-Z0-9_-]+)\/quota$/u.exec(path)
  if (capacity && request.method === 'GET') return quota(db, owner, capacity[1]!, now)
  const permission = /^\/v1\/mailboxes\/([a-zA-Z0-9_-]+)\/permissions$/u.exec(path)
  if (permission && request.method === 'PATCH') {
    const input = permissionsInput.parse(await jsonBody(request))
    const mailbox = await db.prepare('SELECT provider FROM mailboxes WHERE owner=? AND id=?')
      .bind(owner, permission[1]!).first<{ provider: string }>()
    if (!mailbox) throw new ApiError('mailbox_not_found', 404)
    // AIDEV-NOTE: Real grants reconnect through verified admission; this generic fixture route cannot grant live access.
    if (mailbox.provider !== 'fake' && (input.connected || input.sendEnabled || input.aiRead || input.aiDraft || input.aiSend)) {
      throw new ApiError('verified_connection_required', 409)
    }
    const result = await db.prepare('UPDATE mailboxes SET connected=?,send_enabled=?,ai_read=?,ai_draft=?,ai_send=? WHERE owner=? AND id=?')
      .bind(Number(input.connected), Number(input.sendEnabled), Number(input.aiRead), Number(input.aiDraft), Number(input.aiSend), owner, permission[1]!).run()
    if (!result.meta.changes) throw new ApiError('mailbox_not_found', 404)
    return Response.json({ updated: true, simulated: true })
  }
  if (path === '/v1/contacts/import' && request.method === 'POST') {
    const rows = z.array(contactSchema).min(1).max(500).parse(await jsonBody(request))
    if (new Set(rows.map(row => row.email)).size !== rows.length) throw new ApiError('duplicate_contact')
    // Withdrawal cancels future eligibility atomically; later imports cannot erase suppression.
    await db.batch(rows.flatMap(row => [
      db.prepare(`INSERT INTO contacts(owner,email,consent_source,opted_in) VALUES(?,?,?,?)
        ON CONFLICT(owner,email) DO UPDATE SET consent_source=excluded.consent_source,opted_in=excluded.opted_in`)
        .bind(owner, row.email, row.consentSource, Number(row.optedIn)),
      db.prepare(`INSERT INTO suppressions(owner,email,reason,at) SELECT ?,?,'withdrawal',? WHERE ?=0
        ON CONFLICT(owner,email) DO NOTHING`).bind(owner, row.email, Date.now(), Number(row.optedIn)),
    ]))
    return Response.json({ processed: rows.length })
  }
  if (path === '/v1/campaigns' && request.method === 'POST') {
    const input = z.object({ id: idSchema }).strict().parse(await jsonBody(request))
    await db.prepare("INSERT INTO campaigns(owner,id,status) VALUES(?,?,'draft') ON CONFLICT(owner,id) DO NOTHING")
      .bind(owner, input.id).run()
    const saved = await db.prepare('SELECT id,status FROM campaigns WHERE owner=? AND id=?').bind(owner, input.id).first()
    return Response.json(saved)
  }
  const campaign = /^\/v1\/campaigns\/([a-zA-Z0-9_-]+)$/u.exec(path)
  if (campaign && request.method === 'PATCH') {
    const input = z.object({ status: z.enum(['running', 'paused']) }).strict().parse(await jsonBody(request))
    const result = await db.prepare('UPDATE campaigns SET status=? WHERE owner=? AND id=?')
      .bind(input.status, owner, campaign[1]!).run()
    if (!result.meta.changes) throw new ApiError('campaign_not_found', 404)
    return Response.json(input)
  }
  if (path === '/v1/messages' && request.method === 'GET') {
    const query = z.object({ mailboxId: idSchema, before: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(Number.MAX_SAFE_INTEGER),
      beforeId: idSchema.default('zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz'),
      limit: z.coerce.number().int().min(1).max(100).default(50), q: z.literal('').default('') }).strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams))
    // AIDEV-NOTE: The composite cursor preserves messages sharing the same timestamp.
    const result = await db.prepare(`SELECT id,thread_id,mailbox_id,sender,subject,at FROM messages
      WHERE owner=? AND mailbox_id=? AND (at,id)<(?,?)
      ORDER BY at DESC,id DESC LIMIT ?`).bind(owner, query.mailboxId, query.before, query.beforeId, query.limit)
      .all<{ id: string; at: number }>()
    const last = result.results.at(-1)
    return Response.json(messagePage.parse({ items: result.results, next: result.results.length === query.limit && last
      ? { before: last.at, beforeId: last.id } : null, simulated: true }))
  }
  const message = /^\/v1\/messages\/([a-zA-Z0-9_-]+)\/([a-zA-Z0-9_-]+)$/u.exec(path)
  if (message && request.method === 'GET') {
    // AIDEV-NOTE: Project the public DTO explicitly; private sync columns must not leak or break strict validation.
    const result = await db.prepare(`SELECT owner,mailbox_id,id,thread_id,sender,subject,body,at,
      EXISTS(SELECT 1 FROM gmail_sync_issues i WHERE i.owner=messages.owner
        AND i.mailbox_id=messages.mailbox_id AND i.message_id=messages.id) AS incomplete
      FROM messages WHERE owner=? AND mailbox_id=? AND id=?`)
      .bind(owner, message[1]!, message[2]!).first()
    if (!result) throw new ApiError('message_not_found', 404)
    // AIDEV-NOTE: Read content and its warning atomically so stale cached text cannot masquerade as a complete import.
    const { incomplete, ...body } = result
    return Response.json(messageDetail.parse({ message: body, incomplete: incomplete === 1, contentType: 'text/plain', trust: 'untrusted-email' }))
  }
  return null
}
