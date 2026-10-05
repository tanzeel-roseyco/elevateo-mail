import { z } from 'zod'
import { ApiError, idSchema, jsonBody, sha256, type AuthenticatedSession } from './core'

const input = z.object({ messages: z.array(z.object({ id: idSchema, threadId: idSchema,
  sender: z.email().max(254), subject: z.string().max(998), body: z.string().max(100_000),
  at: z.number().int().nonnegative().max(8_640_000_000_000_000) }).strict()).min(1).max(25) }).strict()

// AIDEV-NOTE: Imports are immutable plaintext snapshots; namespaced IDs cannot replace normal Gmail provider IDs.
export async function importRoute(request: Request, path: string, session: AuthenticatedSession,
  db: D1Database, now = Date.now()): Promise<Response | null> {
  const match = /^\/v1\/mailboxes\/([a-zA-Z0-9_-]{1,128})\/import$/u.exec(path)
  if (!match) return null
  if (request.method !== 'POST') throw new ApiError('method_not_allowed', 405)
  if (new URL(request.url).search) throw new ApiError('validation_failed')
  const started = performance.now()
  const owner = idSchema.parse(session.owner)
  const hash = z.string().regex(/^[a-f0-9]{64}$/u).parse(session.token_hash)
  const mailbox = match[1]!
  const { messages } = input.parse(await jsonBody(request))
  if (new Set(messages.map(row => row.id)).size !== messages.length) throw new ApiError('duplicate_import_id')
  const rows = await Promise.all(messages.map(async row => ({ ...row,
    id: `import_${await sha256(row.id)}`, threadId: `import_${await sha256(row.threadId)}` })))
  const serialized = JSON.stringify(rows)
  const time = now + Math.ceil(performance.now() - started)
  const active = 'EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)'
  const owned = 'EXISTS(SELECT 1 FROM mailboxes WHERE owner=? AND id=?)'
  // AIDEV-NOTE: One conflicting retry rejects the entire batch, including new IDs mixed into that request.
  const conflict = `EXISTS(SELECT 1 FROM json_each(?) j JOIN messages m
    ON m.owner=? AND m.mailbox_id=? AND m.id=json_extract(j.value,'$.id')
    WHERE m.gmail_epoch IS NOT NULL OR m.thread_id<>json_extract(j.value,'$.threadId')
    OR m.sender<>json_extract(j.value,'$.sender') OR m.subject<>json_extract(j.value,'$.subject')
    OR m.body<>json_extract(j.value,'$.body') OR m.at<>json_extract(j.value,'$.at'))`
  const values = [owner, hash, time, owner, mailbox, serialized, owner, mailbox]
  // AIDEV-NOTE: Caller authenticates origin/account binding; atomic session checks also fence slow body reads.
  const results = await db.batch([
    db.prepare(`SELECT ${active} AS active,${owned} AS owned,${conflict} AS conflict`).bind(...values),
    db.prepare(`INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at,gmail_epoch)
      SELECT ?,?,json_extract(j.value,'$.id'),json_extract(j.value,'$.threadId'),
      json_extract(j.value,'$.sender'),json_extract(j.value,'$.subject'),json_extract(j.value,'$.body'),
      json_extract(j.value,'$.at'),NULL FROM json_each(?) j WHERE ${active} AND ${owned} AND NOT ${conflict}
      ON CONFLICT(owner,mailbox_id,id) DO NOTHING`).bind(owner, mailbox, serialized, ...values),
  ])
  const status = results[0]?.results[0] as { active: number; owned: number; conflict: number } | undefined
  if (!status?.active) throw new ApiError('unauthorized', 401)
  if (!status.owned) throw new ApiError('mailbox_not_found', 404)
  if (status.conflict) throw new ApiError('import_id_conflict', 409)
  const imported = results[1]!.meta.changes
  return Response.json({ processed: rows.length, imported, unchanged: rows.length - imported })
}
