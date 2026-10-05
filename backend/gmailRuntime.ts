import { ApiError, idSchema } from './core'
import type { CredentialVault, SessionCommitGuard } from './credentialVault'
import type { GoogleOAuthProvider } from './providers/googleOAuth'
import { syncGmailPage, type GmailSyncProvider, type GmailSyncResult } from './gmailSync'

export interface GmailRuntimeServices {
  vault: CredentialVault
  provider: Pick<GoogleOAuthProvider, 'refresh'>
  readProvider: (accessToken: string, subject: string) => GmailSyncProvider
}

// AIDEV-NOTE: Refresh only near expiry; a losing refresh rereads the winner instead of overwriting newer grants.
export async function resolveGmailCredential(db: D1Database, owner: string, mailboxId: string,
  services: GmailRuntimeServices, now: () => number = Date.now) {
  idSchema.parse(owner); idSchema.parse(mailboxId)
  const connection = await db.prepare(`SELECT c.id,m.subject FROM mailboxes m JOIN provider_credentials c
    ON c.owner=m.owner AND c.provider=m.provider AND c.subject=m.subject
    WHERE m.owner=? AND m.id=? AND m.provider='gmail' AND m.connected=1 AND c.sealed IS NOT NULL`)
    .bind(owner, mailboxId).first<{ id: string; subject: string }>()
  if (!connection) throw new ApiError('sync_credential_unavailable', 409)
  let current = await services.vault.read(owner, connection.id)
  // AIDEV-NOTE: Token maintenance is separate from caller session fences and the atomic send claim.
  if (current.credential.expiresAt <= now() + 60_000) {
    try {
      const refreshed = await services.provider.refresh(current.credential, connection.subject)
      await services.vault.replace(owner, connection.id, current.revision, refreshed)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'oauth_invalid_grant') {
        // AIDEV-NOTE: Disconnect and revoke in one batch, fenced by the exact grant used for the failed refresh.
        const result = await db.batch([
          db.prepare(`UPDATE mailboxes SET connected=0 WHERE owner=? AND provider='gmail' AND subject=?
            AND EXISTS(SELECT 1 FROM provider_credentials WHERE owner=? AND id=? AND revision=? AND sealed IS NOT NULL)`)
            .bind(owner, connection.subject, owner, connection.id, current.revision),
          db.prepare('UPDATE provider_credentials SET sealed=NULL,revision=revision+1 WHERE owner=? AND id=? AND revision=? AND sealed IS NOT NULL')
            .bind(owner, connection.id, current.revision),
        ])
        // AIDEV-NOTE: Revocation triggers also update grant epochs; D1 includes those writes in changes.
        if (result[1]?.meta.changes) throw error
      } else if (!(error instanceof ApiError && error.code === 'connection_changed')) throw error
    }
    // Includes invalid_grant races: a newer grant wins, while revocation makes read fail closed.
    current = await services.vault.read(owner, connection.id)
  }
  if (current.provider !== 'gmail' || current.subject !== connection.subject || current.credential.expiresAt <= now()) {
    throw new ApiError('sync_credential_unavailable', 409)
  }
  return { id: connection.id, ...current }
}
export async function runGmailSyncPage(db: D1Database, owner: string, mailboxId: string,
  services: GmailRuntimeServices, now: () => number = Date.now, session?: SessionCommitGuard): Promise<GmailSyncResult> {
  const current = await resolveGmailCredential(db, owner, mailboxId, services, now)
  return syncGmailPage(db, owner, mailboxId,
    services.readProvider(current.credential.accessToken, current.subject), { id: current.id, revision: current.revision }, session)
}
