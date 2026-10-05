import { replyHeadersSchema } from './gmailReply'
import { z } from 'zod'
import { ApiError, idSchema } from './core'
import type { SessionCommitGuard } from './credentialVault'

const token = z.string().min(1).max(2048)
const message = z.object({ replyHeaders: replyHeadersSchema.optional(), id: idSchema, threadId: idSchema, sender: z.email().max(254),
  // AIDEV-NOTE: Safe integers can exceed JavaScript Date's range and break inbox date rendering.
  subject: z.string().max(998), body: z.string().max(100_000), at: z.number().int().min(0).max(8_640_000_000_000_000), inbox: z.boolean().optional() }).strict()
const pageSchema = z.object({ messages: z.array(message).max(25), deleted: z.array(idSchema).max(25),
  incomplete: z.array(z.object({ id: idSchema, reason: z.literal('message_content_unsupported') }).strict()).max(25).default([]),
  cursor: token, next: token.nullable() }).strict().superRefine((page, context) => {
  const ids = [...page.messages.map(item => item.id), ...page.deleted, ...page.incomplete.map(item => item.id)]
  if (ids.length > 50) context.addIssue({ code: 'custom', message: 'Page entry budget exceeded' })
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', message: 'Duplicate provider IDs' })
  if (page.messages.reduce((bytes, item) => bytes + new TextEncoder().encode(item.body).byteLength, 0) > 1_048_576) {
    context.addIssue({ code: 'custom', message: 'Page body budget exceeded' })
  }
})
export type GmailSyncRequest = { subject: string; mode: 'full' | 'history'; cursor: string | null; pageToken: string | null; limit: 25 }
export interface GmailSyncProvider {
  // AIDEV-NOTE: Full pages retain their initial history watermark; history pages collapse changes per message.
  read(request: GmailSyncRequest): Promise<unknown>
}
export class GmailCursorExpired extends Error {}
type State = { version: number; mode: 'full' | 'prune' | 'history'; cursor: string | null; page_token: string | null; epoch: string }
export type GmailSyncResult = { status: 'progress' | 'caught_up' | 'reset'; imported: number; deleted: number }
const credentialFence = z.object({ id: idSchema, revision: z.number().int().positive().safe() }).strict()
export type GmailCredentialFence = z.infer<typeof credentialFence>

// AIDEV-NOTE: One bounded page per call; D1 batch guards all writes with the same cursor version, then advances it.
export async function syncGmailPage(db: D1Database, owner: string, mailboxId: string, provider: GmailSyncProvider,
  credential: GmailCredentialFence, session?: SessionCommitGuard): Promise<GmailSyncResult> {
  idSchema.parse(owner); idSchema.parse(mailboxId)
  credentialFence.parse(credential)
  if (session) z.string().regex(/^[a-f0-9]{64}$/u).parse(session.tokenHash)
  const mailbox = await db.prepare("SELECT subject FROM mailboxes WHERE owner=? AND id=? AND connected=1 AND provider='gmail'")
    .bind(owner, mailboxId).first<{ subject: string }>()
  if (!mailbox) throw new ApiError('mailbox_not_found', 404)
  const permitted = await db.prepare(`SELECT 1 FROM provider_credentials WHERE owner=? AND id=? AND revision=?
    AND provider='gmail' AND subject=? AND sealed IS NOT NULL`)
    .bind(owner, credential.id, credential.revision, mailbox.subject).first()
  if (!permitted) throw new ApiError('sync_credential_unavailable', 409)
  await db.prepare('INSERT INTO gmail_sync(owner,mailbox_id,epoch) VALUES(?,?,?) ON CONFLICT(owner,mailbox_id) DO NOTHING')
    .bind(owner, mailboxId, crypto.randomUUID()).run()
  const state = await db.prepare('SELECT version,mode,cursor,page_token,epoch FROM gmail_sync WHERE owner=? AND mailbox_id=?')
    .bind(owner, mailboxId).first<State>()
  if (!state) throw new ApiError('sync_state_missing', 409)
  const guard = `EXISTS(SELECT 1 FROM gmail_sync s JOIN mailboxes m ON m.owner=s.owner AND m.id=s.mailbox_id
    JOIN provider_credentials c ON c.owner=m.owner AND c.provider=m.provider AND c.subject=m.subject
    WHERE s.owner=? AND s.mailbox_id=? AND s.version=? AND m.connected=1 AND m.provider='gmail' AND m.subject=?
    AND c.id=? AND c.revision=? AND c.sealed IS NOT NULL)` + (session
      ? ' AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)' : '')
  // AIDEV-NOTE: Capture the revision used by transport; refresh, reconnect or revocation fences every page write.
  // AIDEV-NOTE: Sample after provider work, once per batch; all statements must share the same session fence.
  let commitTime: number | undefined
  const args = () => [owner, mailboxId, state.version, mailbox.subject, credential.id, credential.revision,
    ...(session ? [owner, session.tokenHash, commitTime ??= session.now()] : [])]
  const advance = (mode: State['mode'], cursor: string | null, next: string | null, epoch = state.epoch) =>
    db.prepare(`UPDATE gmail_sync SET version=version+1,mode=?,cursor=?,page_token=?,epoch=? WHERE owner=? AND mailbox_id=? AND ${guard}`)
      .bind(mode, cursor, next, epoch, owner, mailboxId, ...args())
  const commit = async (statements: D1PreparedStatement[]) => {
    const results = await db.batch(statements)
    if (results.at(-1)?.meta.changes !== 1) throw new ApiError('sync_conflict', 409)
    return results
  }
  if (state.mode === 'prune') {
    // AIDEV-NOTE: Remove disappeared issue records in bounded passes before pruning cached messages.
    const staleIssues = await db.prepare(`SELECT message_id FROM gmail_sync_issues WHERE owner=? AND mailbox_id=?
      AND epoch<>? ORDER BY message_id LIMIT 25`).bind(owner, mailboxId, state.epoch).all<{ message_id: string }>()
    if (staleIssues.results.length) {
      await commit([...staleIssues.results.map(row => db.prepare(`DELETE FROM gmail_sync_issues
        WHERE owner=? AND mailbox_id=? AND message_id=? AND ${guard}`).bind(owner, mailboxId, row.message_id, ...args())),
      advance('prune', state.cursor, null)])
      return { status: 'progress', imported: 0, deleted: 0 }
    }
    // AIDEV-NOTE: Prune only this sync's cache, 25 rows at a time; manual/event imports have NULL epochs.
    const rows = await db.prepare(`SELECT id FROM messages WHERE owner=? AND mailbox_id=? AND gmail_epoch IS NOT NULL
      AND gmail_epoch<>? ORDER BY id LIMIT 25`).bind(owner, mailboxId, state.epoch).all<{ id: string }>()
    const deletes = rows.results.map(row => db.prepare(`DELETE FROM messages WHERE owner=? AND mailbox_id=? AND id=? AND ${guard}`)
      .bind(owner, mailboxId, row.id, ...args()))
    await commit([...deletes, advance(rows.results.length < 25 ? 'history' : 'prune', state.cursor, null)])
    return { status: 'progress', imported: 0, deleted: rows.results.length }
  }
  let raw: unknown
  try { raw = await provider.read({ subject: mailbox.subject, mode: state.mode, cursor: state.cursor, pageToken: state.page_token, limit: 25 }) }
  catch (error) {
    if (!(error instanceof GmailCursorExpired) || state.mode !== 'history') throw error
    await commit([advance('full', null, null, crypto.randomUUID())])
    return { status: 'reset', imported: 0, deleted: 0 }
  }
  const parsed = pageSchema.safeParse(raw)
  if (!parsed.success) throw new ApiError('sync_provider_invalid', 502)
  const page = parsed.data
  if (page.next !== null && page.next === state.page_token) throw new ApiError('sync_provider_invalid', 502)
  if (state.mode === 'full' && (page.deleted.length || (state.cursor !== null && state.cursor !== page.cursor))) {
    throw new ApiError('sync_provider_invalid', 502)
  }
  // AIDEV-NOTE: An imported row retains its content/provenance even when a provider ID collides with its ID.
  const writes = page.messages.map(item => db.prepare(`INSERT INTO messages(owner,mailbox_id,id,thread_id,sender,subject,body,at,gmail_epoch,gmail_inbox,gmail_reply)
    SELECT ?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
    ON CONFLICT(owner,mailbox_id,id) DO UPDATE SET thread_id=excluded.thread_id,sender=excluded.sender,
    subject=excluded.subject,body=excluded.body,at=excluded.at,gmail_epoch=excluded.gmail_epoch,gmail_inbox=excluded.gmail_inbox,gmail_reply=excluded.gmail_reply
    WHERE messages.gmail_epoch IS NOT NULL`)
    .bind(owner, mailboxId, item.id, item.threadId, item.sender, item.subject, item.body, item.at, state.epoch, Number(item.inbox === true), item.replyHeaders ? JSON.stringify(item.replyHeaders) : null, ...args()))
  const deletes = page.deleted.map(id => db.prepare(`DELETE FROM messages WHERE owner=? AND mailbox_id=? AND id=? AND gmail_epoch IS NOT NULL AND ${guard}`)
    .bind(owner, mailboxId, id, ...args()))
  // AIDEV-NOTE: History pagination keeps its original start cursor until the final page to avoid skipping changes.
  const cursor = state.mode === 'history' && page.next ? state.cursor : page.cursor
  // AIDEV-NOTE: Issues share cursor/credential fencing; later successful reads or deletions resolve them atomically.
  const issues = page.incomplete.map(item => db.prepare(`INSERT INTO gmail_sync_issues(owner,mailbox_id,message_id,reason,epoch)
    SELECT ?,?,?,?,? WHERE ${guard} ON CONFLICT(owner,mailbox_id,message_id)
    DO UPDATE SET reason=excluded.reason,epoch=excluded.epoch`)
    .bind(owner, mailboxId, item.id, item.reason, state.epoch, ...args()))
  const resolved = [...page.messages.map(item => item.id), ...page.deleted].map(id => db.prepare(`DELETE FROM gmail_sync_issues
    WHERE owner=? AND mailbox_id=? AND message_id=? AND ${guard}`).bind(owner, mailboxId, id, ...args()))
  const results = await commit([...writes, ...deletes, ...issues, ...resolved,
    advance(state.mode === 'full' && !page.next ? 'prune' : state.mode, cursor, page.next)])
  // AIDEV-NOTE: Provider entries can be skipped by provenance guards; report committed changes, not input sizes.
  const changes = (start: number, end: number) => results.slice(start, end).reduce((sum, result) => sum + result.meta.changes, 0)
  return { status: state.mode === 'history' && !page.next ? 'caught_up' : 'progress',
    imported: changes(0, writes.length), deleted: changes(writes.length, writes.length + deletes.length) }
}
