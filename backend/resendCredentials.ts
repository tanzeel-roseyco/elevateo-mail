import { z } from 'zod'
import { ApiError, idSchema } from './core'
import { SecretBox, type SessionCommitGuard } from './credentialVault'

const secretSchema = z.object({ apiKey: z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u) }).strict()
const revisionSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER - 1)
type Metadata = { id: string; revision: number; revoked: number }
function sessionBindings(owner: string, session: SessionCommitGuard): (string | number)[] {
    return [owner, z.string().regex(/^[a-f0-9]{64}$/u).parse(session.tokenHash),
      z.number().int().safe().nonnegative().parse(session.now())]
  }

// AIDEV-NOTE: Static keys have no invented OAuth expiry; this store grants no sender/domain permission.
export class ResendCredentials {
  constructor(private readonly db: D1Database, private readonly box: SecretBox) {}
  private context(owner: string, id: string): string { return JSON.stringify(['resend-api-key-v1', owner, id]) }
  async metadata(owner: string, id: string): Promise<Metadata> { return resendCredentialMetadata(this.db, owner, id) }
  async create(owner: string, input: unknown, session: SessionCommitGuard): Promise<string> {
    idSchema.parse(owner)
    const id = crypto.randomUUID()
    const sealed = await this.box.seal(this.context(owner, id), secretSchema.parse(input))
    // AIDEV-NOTE: Session and bounded storage admission are checked atomically after encryption finishes.
    const result = await this.db.prepare(`INSERT INTO resend_credentials(owner,id,sealed)
      SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)
      AND (SELECT count(*) FROM resend_credentials WHERE owner=?)<10`)
      .bind(owner, id, sealed, ...sessionBindings(owner, session), owner).run()
    if (!result.meta.changes) throw new ApiError('connection_admission_denied', 409)
    return id
  }
  async replace(owner: string, id: string, revision: number, input: unknown, session: SessionCommitGuard): Promise<void> {
    idSchema.parse(owner); idSchema.parse(id); revisionSchema.parse(revision)
    const sealed = await this.box.seal(this.context(owner, id), secretSchema.parse(input))
    const result = await this.db.prepare(`UPDATE resend_credentials SET sealed=?,revision=revision+1
      WHERE owner=? AND id=? AND revision=? AND sealed IS NOT NULL
      AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)`)
      .bind(sealed, owner, id, revision, ...sessionBindings(owner, session)).run()
    if (!result.meta.changes) throw new ApiError('connection_changed', 409)
  }
  async revoke(owner: string, id: string, revision: number, session: SessionCommitGuard): Promise<void> {
    await revokeResendCredential(this.db, owner, id, revision, session)
  }
  // AIDEV-NOTE: Server-only plaintext boundary; callers must never serialize this result into an HTTP response.
  async readForServer(owner: string, id: string): Promise<{ apiKey: string; revision: number }> {
    const row = await this.db.prepare('SELECT sealed,revision FROM resend_credentials WHERE owner=? AND id=? AND sealed IS NOT NULL')
      .bind(idSchema.parse(owner), idSchema.parse(id)).first<{ sealed: string; revision: number }>()
    if (!row) throw new ApiError('connection_not_found', 404)
    const parsed = secretSchema.safeParse(await this.box.open(this.context(owner, id), row.sealed))
    if (!parsed.success) throw new ApiError('credential_unavailable', 503)
    return { apiKey: parsed.data.apiKey, revision: row.revision }
  }
}

// AIDEV-NOTE: Metadata and revocation remain available when encryption configuration is absent or broken.
export async function resendCredentialMetadata(db: D1Database, owner: string, id: string): Promise<Metadata> {
    const row = await db.prepare('SELECT id,revision,sealed IS NULL AS revoked FROM resend_credentials WHERE owner=? AND id=?')
      .bind(idSchema.parse(owner), idSchema.parse(id)).first<Metadata>()
    if (!row) throw new ApiError('connection_not_found', 404)
    return row
  }
export async function revokeResendCredential(db: D1Database, owner: string, id: string, revision: number, session: SessionCommitGuard): Promise<void> {
    idSchema.parse(owner); idSchema.parse(id); revisionSchema.parse(revision)
    const result = await db.prepare(`UPDATE resend_credentials SET sealed=NULL,revision=revision+1
      WHERE owner=? AND id=? AND revision=? AND sealed IS NOT NULL
      AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)`)
      .bind(owner, id, revision, ...sessionBindings(owner, session)).run()
    if (!result.meta.changes) throw new ApiError('connection_changed', 409)
  }
