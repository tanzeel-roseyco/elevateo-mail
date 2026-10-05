import { ApiError, jsonBody } from './core'
import { SendLedger, type IntentRow } from './ledger'
import { replacementInput, replacementResponse, sendContentResponse, sendListInput, sendRequestPage } from './contracts/v1'

// AIDEV-NOTE: Recovery is owner-scoped; summaries never read envelope bodies or change send state.
const summaryColumns = `s.id,s.mailbox_id,s.idempotency_key,s.revision,s.status,s.created_at,s.updated_at,
  s.scheduled_at,r.successor_id`
const summaryJoin = 'send_intents s LEFT JOIN send_replacements r ON r.owner=s.owner AND r.predecessor_id=s.id'
export async function recoveryRoute(request: Request, path: string, owner: string, db: D1Database, now: number) {
  const url = new URL(request.url)
  if (path === '/v1/send-intents' && request.method === 'GET') {
    if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) throw new ApiError('validation_failed')
    const input = sendListInput.parse(Object.fromEntries(url.searchParams))
    const rows = await db.prepare(`SELECT ${summaryColumns} FROM ${summaryJoin} WHERE s.owner=?
      AND (s.created_at,s.id)<(?,?) ORDER BY s.created_at DESC,s.id DESC LIMIT ?`)
      .bind(owner, input.before ?? Number.MAX_SAFE_INTEGER, input.beforeId ?? '~', input.limit + 1).all()
    const items = rows.results.slice(0, input.limit)
    const last = items.at(-1)
    const next = rows.results.length > input.limit && last ? { before: last.created_at, beforeId: last.id } : null
    return Response.json(sendRequestPage.parse({ items, next, simulated: true }))
  }
  const match = /^\/v1\/send-intents\/([a-zA-Z0-9_-]{1,128})\/(content|replace)$/u.exec(path)
  if (!match || (match[2] === 'content' ? request.method !== 'GET' : request.method !== 'POST')) return null
  if (url.search) throw new ApiError('validation_failed')
  const row = await db.prepare('SELECT * FROM send_intents WHERE owner=? AND id=?').bind(owner, match[1]!).first<IntentRow>()
  if (!row) throw new ApiError('intent_not_found', 404)
  const ledger = new SendLedger(db)
  if (match[2] === 'content') {
    let envelope
    try { envelope = await ledger.envelope(row) }
    catch { throw new ApiError('invalid_saved_content', 409) }
    const intent = await db.prepare(`SELECT ${summaryColumns} FROM ${summaryJoin} WHERE s.owner=? AND s.id=?`)
      .bind(owner, row.id).first()
    const { from, to, cc, bcc, subject, body, kind } = envelope
    return Response.json(sendContentResponse.parse({ intent, content: { from, to, cc, bcc, subject, body, kind }, simulated: true }))
  }
  const input = replacementInput.parse(await jsonBody(request))
  if (input.revision !== row.revision) throw new ApiError('approval_conflict', 409)
  const prepared = await ledger.prepare(owner, input.draft, now)
  // AIDEV-NOTE: Each batch is one transaction; a queue claim or another tab can win, never produce two successors.
  await db.batch([
    db.prepare(`INSERT INTO send_intents
      (owner,id,mailbox_id,idempotency_key,revision,envelope,recipients,recipient_count,kind,campaign_id,scheduled_at,updated_at,envelope_hash,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM send_intents WHERE owner=? AND id=?
        AND revision=? AND kind='manual' AND status IN ('draft','pending','cancelled','rejected'))
        AND NOT EXISTS(SELECT 1 FROM send_replacements WHERE owner=? AND predecessor_id=?)
        AND NOT EXISTS(SELECT 1 FROM send_intents WHERE owner=? AND idempotency_key=?)`)
      .bind(...prepared.values, owner, row.id, row.revision, owner, row.id, owner, prepared.input.idempotencyKey),
    db.prepare(`UPDATE send_intents SET status='cancelled',updated_at=? WHERE owner=? AND id=?
      AND status IN ('draft','pending') AND EXISTS(SELECT 1 FROM send_intents WHERE owner=? AND id=?)`)
      .bind(now, owner, row.id, owner, prepared.id),
    db.prepare(`INSERT INTO send_replacements SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM send_intents WHERE owner=? AND id=?)`)
      .bind(owner, row.id, prepared.id, owner, prepared.id),
  ])
  const successor = await db.prepare(`SELECT s.id,s.revision,s.status FROM send_replacements r JOIN send_intents s
    ON s.owner=r.owner AND s.id=r.successor_id WHERE r.owner=? AND r.predecessor_id=?`).bind(owner, row.id)
    .first<{ id: string; revision: string; status: string }>()
  if (successor) {
    if (successor.revision !== prepared.revision) throw new ApiError('replacement_conflict', 409)
    return Response.json(replacementResponse.parse({ predecessorId: row.id, ...successor, simulated: true }))
  }
  const collision = await db.prepare('SELECT id FROM send_intents WHERE owner=? AND idempotency_key=?')
    .bind(owner, prepared.input.idempotencyKey).first()
  throw new ApiError(collision ? 'idempotency_conflict' : 'replacement_unavailable', 409)
}
