import { z } from 'zod'
import { ApiError, idSchema } from './core'

// AIDEV-NOTE: Versioned AEAD binds ciphertext to its owner and purpose, preventing cross-row token substitution.
export function base64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}
function decode(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-zA-Z0-9_-]+$/u.test(value)) throw new ApiError('credential_unavailable', 503)
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
}
export const credentialSchema = z.object({
  accessToken: z.string().min(1).max(8192), refreshToken: z.string().min(1).max(8192).optional(),
  expiresAt: z.number().int().safe().positive(), scopes: z.array(z.string().min(1).max(256)).min(1).max(32),
}).strict()
export type ProviderCredential = z.infer<typeof credentialSchema>
export type SessionCommitGuard = { tokenHash: string; now: () => number }
// AIDEV-NOTE: Evaluate time after encryption; session authorization must guard the credential write itself.
function sessionPredicate(owner: string, session?: SessionCommitGuard): { sql: string; args: (string | number)[] } {
  if (!session) return { sql: '1', args: [] }
  const hash = z.string().regex(/^[a-f0-9]{64}$/u).parse(session.tokenHash)
  const now = z.number().int().safe().nonnegative().parse(session.now())
  return { sql: 'EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)', args: [owner, hash, now] }
}
type Row = { id: string; provider: string; subject: string; sealed: string | null; revision: number; grant_epoch: number }
export class SecretBox {
  constructor(private readonly activeKey: string, private readonly keys: ReadonlyMap<string, CryptoKey>) {
    idSchema.parse(activeKey)
    for (const key of keys.values()) {
      if (key.algorithm.name !== 'AES-GCM' || (key.algorithm as AesKeyAlgorithm).length !== 256 ||
        key.extractable || !key.usages.includes('encrypt') || !key.usages.includes('decrypt')) throw new ApiError('vault_configuration', 503)
    }
    if (!keys.has(activeKey)) throw new ApiError('vault_configuration', 503)
  }
  async seal(context: string, value: unknown): Promise<string> {
    const plaintext = new TextEncoder().encode(JSON.stringify(value))
    if (plaintext.length > 32_768) throw new ApiError('credential_too_large')
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
      additionalData: new TextEncoder().encode(context) }, this.keys.get(this.activeKey)!, plaintext)
    return JSON.stringify({ key: this.activeKey, iv: base64url(iv), data: base64url(new Uint8Array(encrypted)) })
  }
  async open(context: string, sealed: string): Promise<unknown> {
    try {
      if (sealed.length > 50_000) throw new Error('size')
      const box = z.object({ key: idSchema, iv: z.string(), data: z.string() }).strict().parse(JSON.parse(sealed))
      const key = this.keys.get(box.key)
      if (!key) throw new Error('key')
      const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(box.iv),
        additionalData: new TextEncoder().encode(context) }, key, decode(box.data))
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext)) as unknown
    } catch { throw new ApiError('credential_unavailable', 503) }
  }
}
export class CredentialVault {
  constructor(private readonly db: D1Database, readonly box: SecretBox) {}
  private context(owner: string, row: Pick<Row, 'id' | 'provider' | 'subject'>): string {
    return JSON.stringify(['credential-v1', owner, row.id, row.provider, row.subject])
  }
  async identity(owner: string, id: string): Promise<Omit<Row, 'sealed'>> {
    const row = await this.db.prepare('SELECT id,provider,subject,revision,grant_epoch FROM provider_credentials WHERE owner=? AND id=?')
      .bind(idSchema.parse(owner), idSchema.parse(id)).first<Omit<Row, 'sealed'>>()
    if (!row) throw new ApiError('connection_not_found', 404)
    return row
  }
  async reconnect(owner: string, id: string, revision: number, input: unknown, session?: SessionCommitGuard): Promise<void> {
    const row = await this.identity(owner, id)
    z.number().int().positive().safe().parse(revision)
    const sealed = await this.box.seal(this.context(owner, row), credentialSchema.parse(input))
    const guard = sessionPredicate(owner, session)
    // AIDEV-NOTE: Reauthorization changes the grant epoch; routine refresh below changes only the token revision.
    const result = await this.db.prepare(`UPDATE provider_credentials SET sealed=?,revision=revision+1,grant_epoch=grant_epoch+1 WHERE owner=? AND id=? AND revision=? AND ${guard.sql}`)
      .bind(sealed, owner, id, revision, ...guard.args).run()
    if (!result.meta.changes) throw new ApiError('connection_changed', 409)
  }
  async read(owner: string, id: string): Promise<{ credential: ProviderCredential; revision: number; grantEpoch: number; provider: string; subject: string }> {
    const row = await this.db.prepare('SELECT * FROM provider_credentials WHERE owner=? AND id=? AND sealed IS NOT NULL')
      .bind(idSchema.parse(owner), idSchema.parse(id)).first<Row>()
    if (!row?.sealed) throw new ApiError('connection_not_found', 404)
    return { credential: credentialSchema.parse(await this.box.open(this.context(owner, row), row.sealed)),
      revision: row.revision, grantEpoch: row.grant_epoch, provider: row.provider, subject: row.subject }
  }
  async create(owner: string, provider: string, subject: string, input: unknown, session?: SessionCommitGuard): Promise<string> {
    idSchema.parse(owner); idSchema.parse(provider); z.string().min(1).max(256).parse(subject)
    const id = crypto.randomUUID()
    const sealed = await this.box.seal(this.context(owner, { id, provider, subject }), credentialSchema.parse(input))
    const guard = sessionPredicate(owner, session)
    const result = await this.db.prepare(`INSERT INTO provider_credentials(owner,id,provider,subject,sealed) SELECT ?,?,?,?,? WHERE ${guard.sql} ON CONFLICT DO NOTHING`)
      .bind(owner, id, provider, subject, sealed, ...guard.args).run()
    if (!result.meta.changes) throw new ApiError('connection_exists', 409)
    return id
  }
  // AIDEV-NOTE: CAS blocks late refresh/reconnect from resurrecting a revoked credential or overwriting a newer token.
  async replace(owner: string, id: string, revision: number, input: unknown): Promise<void> {
    const current = await this.read(owner, id)
    z.number().int().positive().safe().parse(revision)
    const sealed = await this.box.seal(this.context(owner, { id, ...current }), credentialSchema.parse(input))
    const result = await this.db.prepare('UPDATE provider_credentials SET sealed=?,revision=revision+1 WHERE owner=? AND id=? AND revision=? AND sealed IS NOT NULL')
      .bind(sealed, owner, id, revision).run()
    if (!result.meta.changes) throw new ApiError('connection_changed', 409)
  }
  async revoke(owner: string, id: string): Promise<void> {
    const result = await this.db.prepare('UPDATE provider_credentials SET sealed=NULL,revision=revision+1 WHERE owner=? AND id=?')
      .bind(idSchema.parse(owner), idSchema.parse(id)).run()
    if (!result.meta.changes) throw new ApiError('connection_not_found', 404)
  }
}
