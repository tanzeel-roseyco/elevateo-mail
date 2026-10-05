import { z } from 'zod'
import { ApiError, idSchema } from './core'
import { SecretBox, type SessionCommitGuard } from './credentialVault'

export const hunterKey = z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u)
export const hunterRevision = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
export async function hunterMetadata(db: D1Database, owner: string) {
  return db.prepare('SELECT revision,sealed IS NULL AS revoked FROM hunter_credentials WHERE owner=?')
    .bind(idSchema.parse(owner)).first<{ revision: number; revoked: number }>()
}
function guard(owner: string, session: SessionCommitGuard) {
  return [idSchema.parse(owner), z.string().regex(/^[a-f0-9]{64}$/u).parse(session.tokenHash),
    z.number().int().nonnegative().safe().parse(session.now())] as const
}
export async function revokeHunter(db: D1Database, owner: string, revision: number, session: SessionCommitGuard) {
  const result = await db.prepare(`UPDATE hunter_credentials SET sealed=NULL,revision=revision+1
    WHERE owner=? AND revision=? AND sealed IS NOT NULL
    AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)`)
    .bind(idSchema.parse(owner), hunterRevision.parse(revision), ...guard(owner, session)).run()
  if (!result.meta.changes) throw new ApiError('connection_changed', 409)
}
// AIDEV-NOTE: A static enrichment key has no send permission; AEAD binds it to this owner and purpose.
export class HunterCredentials {
  constructor(private readonly db: D1Database, private readonly box: SecretBox) {}
  private context(owner: string) { return JSON.stringify(['hunter-api-key-v1', idSchema.parse(owner)]) }
  async save(owner: string, apiKey: string, revision: number | null, session: SessionCommitGuard) {
    const sealed = await this.box.seal(this.context(owner), { apiKey: hunterKey.parse(apiKey) })
    const result = revision === null ? await this.db.prepare(`INSERT INTO hunter_credentials(owner,sealed)
      SELECT ?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)
      ON CONFLICT(owner) DO NOTHING`).bind(owner, sealed, ...guard(owner, session)).run() :
      await this.db.prepare(`UPDATE hunter_credentials SET sealed=?,revision=revision+1 WHERE owner=? AND revision=?
        AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)`)
        .bind(sealed, owner, hunterRevision.parse(revision), ...guard(owner, session)).run()
    if (!result.meta.changes) throw new ApiError('connection_changed', 409)
  }
  async read(owner: string) {
    const row = await this.db.prepare('SELECT sealed,revision FROM hunter_credentials WHERE owner=? AND sealed IS NOT NULL')
      .bind(idSchema.parse(owner)).first<{ sealed: string; revision: number }>()
    if (!row) throw new ApiError('connection_not_found', 404)
    const parsed = z.object({ apiKey: hunterKey }).strict().safeParse(await this.box.open(this.context(owner), row.sealed))
    if (!parsed.success) throw new ApiError('credential_unavailable', 503)
    return { apiKey: parsed.data.apiKey, revision: row.revision }
  }
}
