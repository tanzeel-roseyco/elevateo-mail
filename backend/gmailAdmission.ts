import { z } from 'zod'
import { ApiError, idSchema } from './core'
import { CredentialVault, type SessionCommitGuard } from './credentialVault'
import { gmailRequest } from './providers/gmailHttp'
import type { ProviderFetch } from './providers/http'

const profileSchema = z.object({ emailAddress: z.string().trim().toLowerCase().pipe(z.email().max(254)) })
// AIDEV-NOTE: Only a verified OAuth grant and Google's users/me profile establish mailbox identity; never browser input.
export async function admitGmailMailbox(db: D1Database, vault: CredentialVault, owner: string, connectionId: string,
  session: SessionCommitGuard, fetcher: ProviderFetch = fetch): Promise<{ id: string; address: string }> {
  idSchema.parse(owner); idSchema.parse(connectionId)
  z.string().regex(/^[a-f0-9]{64}$/u).parse(session.tokenHash)
  const grant = await vault.read(owner, connectionId)
  if (grant.provider !== 'gmail') throw new ApiError('connection_provider_mismatch', 409)
  if (grant.credential.expiresAt <= session.now()) throw new ApiError('oauth_refresh_required', 409)
  const response = await gmailRequest(fetcher, 'https://gmail.googleapis.com/gmail/v1/users/me/profile', grant.credential.accessToken)
  const profile = profileSchema.safeParse(response?.body)
  if (response?.status !== 200 || response.oversized || !profile.success) throw new ApiError('gmail_profile_unavailable', 502)
  const address = profile.data.emailAddress
  const existing = await db.prepare("SELECT id,address FROM mailboxes WHERE owner=? AND provider='gmail' AND subject=?")
    .bind(owner, grant.subject).first<{ id: string; address: string }>()
  if (existing && existing.address !== address) throw new ApiError('mailbox_identity_conflict', 409)
  const id = existing?.id ?? crypto.randomUUID()
  const now = z.number().int().safe().nonnegative().parse(session.now())
  if (grant.credential.expiresAt <= now) throw new ApiError('oauth_refresh_required', 409)
  const guard = `EXISTS(SELECT 1 FROM provider_credentials WHERE owner=? AND id=? AND provider='gmail'
    AND subject=? AND revision=? AND sealed IS NOT NULL)
    AND EXISTS(SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?)`
  const args = [owner, connectionId, grant.subject, grant.revision, owner, session.tokenHash, now]
  // AIDEV-NOTE: D1 batch is atomic; existing capacity triggers count admission/reconnect while grant/session fence revocation.
  let results: D1Result[]
  try {
    results = await db.batch([
      db.prepare(`UPDATE mailboxes SET connected=1,verified=1,send_enabled=0,ai_send=0
        WHERE owner=? AND provider='gmail' AND subject=? AND address=? AND ${guard}`)
        .bind(owner, grant.subject, address, ...args),
      db.prepare(`INSERT INTO mailboxes(owner,id,provider,subject,address,connected,verified,send_enabled)
        SELECT ?,?,'gmail',?,?,1,1,0 WHERE ${guard}
        AND NOT EXISTS(SELECT 1 FROM mailboxes WHERE owner=? AND provider='gmail' AND subject=?)`)
        .bind(owner, id, grant.subject, address, ...args, owner, grant.subject),
    ])
  } catch (error) {
    if (error instanceof Error && error.message.includes('mailbox_limit')) throw new ApiError('mailbox_limit', 409)
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) throw new ApiError('mailbox_identity_conflict', 409)
    throw error
  }
  if (!results.some(result => result.meta.changes)) throw new ApiError('connection_changed', 409)
  const saved = await db.prepare("SELECT id,address FROM mailboxes WHERE owner=? AND provider='gmail' AND subject=?")
    .bind(owner, grant.subject).first<{ id: string; address: string }>()
  if (!saved || saved.address !== address) throw new ApiError('mailbox_identity_conflict', 409)
  return saved
}
