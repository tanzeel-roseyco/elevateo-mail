import { z } from 'zod'
import { ApiError, idSchema } from './core'
import type { SessionCommitGuard } from './credentialVault'
import { ResendCredentials } from './resendCredentials'

const addressSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))
const domainSchema = z.object({ id: idSchema, name: z.string().min(1).max(253),
  status: z.literal('verified'), sendingEnabled: z.literal(true) }).strict()
export interface ResendDomainVerifier {
  verify(apiKey: string, domainId: string): Promise<unknown>
}
// AIDEV-NOTE: Only the trusted verification transport supplies domain facts; admission never enables sending.
export async function admitResendSender(db: D1Database, vault: ResendCredentials, verifier: ResendDomainVerifier,
  owner: string, connectionId: string, input: unknown, session: SessionCommitGuard): Promise<{ id: string; address: string }> {
  idSchema.parse(owner); idSchema.parse(connectionId)
  const requested = z.object({ address: addressSchema, domainId: idSchema }).strict().parse(input)
  z.string().regex(/^[a-f0-9]{64}$/u).parse(session.tokenHash)
  const grant = await vault.readForServer(owner, connectionId)
  let verification: unknown
  try { verification = await verifier.verify(grant.apiKey, requested.domainId) }
  catch { throw new ApiError('resend_verification_unavailable', 502) }
  const parsed = domainSchema.safeParse(verification)
  const domainName = requested.address.slice(requested.address.lastIndexOf('@') + 1)
  if (!parsed.success || parsed.data.id !== requested.domainId || parsed.data.name.toLowerCase() !== domainName) {
    throw new ApiError('resend_sender_unverified', 409)
  }
  const id = crypto.randomUUID()
  const now = z.number().int().safe().nonnegative().parse(session.now())
  const guard = `EXISTS(SELECT 1 FROM resend_credentials WHERE owner=? AND id=? AND revision=? AND sealed IS NOT NULL)
    AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)`
  const args = [owner, connectionId, grant.revision, owner, session.tokenHash, now]
  // AIDEV-NOTE: Reconnect keeps mailbox identity/quota; credential snapshots on old intents must never change.
  let results: D1Result[]
  try {
    results = await db.batch([
      db.prepare(`INSERT INTO mailboxes(owner,id,provider,subject,address,connected,verified,send_enabled)
        SELECT ?,?,'resend',?,?,1,1,0 WHERE ${guard}
        ON CONFLICT(owner,provider,subject) DO UPDATE SET connected=1,verified=1,send_enabled=0,ai_send=0
        WHERE mailboxes.address=excluded.address`)
        .bind(owner, id, requested.address, requested.address, ...args),
      db.prepare(`INSERT INTO resend_senders(owner,mailbox_id,credential_id,credential_revision,domain_id,domain_name)
        SELECT owner,id,?,?,?,? FROM mailboxes WHERE owner=? AND provider='resend' AND subject=? AND address=? AND ${guard}
        ON CONFLICT(owner,mailbox_id) DO UPDATE SET credential_id=excluded.credential_id,
        credential_revision=excluded.credential_revision,domain_id=excluded.domain_id,domain_name=excluded.domain_name`)
        .bind(connectionId, grant.revision, requested.domainId, domainName, owner, requested.address, requested.address, ...args),
    ])
  } catch (error) {
    if (error instanceof Error && error.message.includes('mailbox_limit')) throw new ApiError('mailbox_limit', 409)
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) throw new ApiError('mailbox_identity_conflict', 409)
    throw error
  }
  if (!results[1]?.meta.changes) throw new ApiError('connection_changed', 409)
  const saved = await db.prepare("SELECT id,address FROM mailboxes WHERE owner=? AND provider='resend' AND subject=?")
    .bind(owner, requested.address).first<{ id: string; address: string }>()
  if (!saved) throw new ApiError('connection_changed', 409)
  return saved
}
