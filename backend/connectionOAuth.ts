import { z } from 'zod'
import { ApiError, idSchema, sha256 } from './core'
import { base64url, CredentialVault, credentialSchema } from './credentialVault'

const httpsUrl = z.string().url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
})
const configSchema = z.object({ provider: idSchema, issuer: httpsUrl, authorizationUrl: httpsUrl,
  redirectUri: httpsUrl, clientId: z.string().min(1).max(256),
  callbackPolicy: z.enum(['issuer', 'google']).default('issuer'),
  scopes: z.array(z.string().regex(/^[^\s]+$/u).max(256)).min(1).max(32) }).strict()
  .refine(config => config.callbackPolicy !== 'google' || (config.provider === 'gmail' &&
    config.issuer === 'https://accounts.google.com' && config.authorizationUrl === 'https://accounts.google.com/o/oauth2/v2/auth'),
  'Google callback policy requires the Google authorization server')
const secretSchema = z.object({ verifier: z.string().regex(/^[a-zA-Z0-9_-]{43}$/u), configHash: z.string(),
  reconnect: z.object({ id: idSchema, revision: z.number().int().safe().positive(), subject: z.string() }).nullable() }).strict()
const resultSchema = z.object({ subject: z.string().min(1).max(256), credential: credentialSchema }).strict()
export interface ConnectionOAuthProvider {
  // AIDEV-NOTE: Trusted adapter must verify provider subject via its own endpoint; never trust browser-supplied identity.
  exchange(input: { code: string; verifier: string; redirectUri: string; clientId: string }): Promise<unknown>
}
export class ConnectionOAuth {
  private readonly config: z.infer<typeof configSchema>
  constructor(private readonly db: D1Database, private readonly vault: CredentialVault,
    config: unknown, private readonly provider: ConnectionOAuthProvider) { this.config = configSchema.parse(config) }
  private async requireSession(owner: string, session: string, now: number): Promise<void> {
    idSchema.parse(owner); z.string().regex(/^[a-f0-9]{64}$/u).parse(session)
    z.number().int().safe().nonnegative().parse(now)
    const exists = await this.db.prepare('SELECT 1 FROM sessions WHERE owner=? AND token_hash=? AND expires_at>?')
      .bind(owner, session, now).first()
    if (!exists) throw new ApiError('unauthorized', 401)
  }
  async begin(owner: string, session: string, now: number, reconnectId?: string): Promise<{ authorizationUrl: string; expiresAt: number }> {
    await this.requireSession(owner, session, now)
    const reconnect = reconnectId ? await this.vault.identity(owner, reconnectId) : null
    if (reconnect && reconnect.provider !== this.config.provider) throw new ApiError('connection_provider_mismatch')
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)))
    const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)))
    const stateHash = await sha256(state)
    const sealed = await this.vault.box.seal(JSON.stringify(['oauth-v1', owner, session, stateHash]), {
      verifier, configHash: await sha256(JSON.stringify(this.config)),
      reconnect: reconnect ? { id: reconnectId!, revision: reconnect.revision, subject: reconnect.subject } : null,
    })
    const expiresAt = now + 600_000
    await this.db.batch([
      this.db.prepare('DELETE FROM connection_oauth WHERE expires_at<=?').bind(now),
      this.db.prepare(`INSERT INTO connection_oauth(state_hash,owner,session_hash,provider,sealed,expires_at) VALUES(?,?,?,?,?,?)
        ON CONFLICT(owner,session_hash,provider) DO UPDATE SET state_hash=excluded.state_hash,sealed=excluded.sealed,expires_at=excluded.expires_at`)
        .bind(stateHash, owner, session, this.config.provider, sealed, expiresAt),
    ])
    const url = new URL(this.config.authorizationUrl)
    url.search = new URLSearchParams({ response_type: 'code', client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri, scope: this.config.scopes.join(' '), state,
      code_challenge: base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))),
      code_challenge_method: 'S256' }).toString()
    // AIDEV-NOTE: Google needs offline access for sync after the desktop closes; this policy is sealed into state.
    if (this.config.callbackPolicy === 'google') url.searchParams.set('access_type', 'offline')
    return { authorizationUrl: url.href, expiresAt }
  }
  // AIDEV-NOTE: Select only a fixed server profile from sealed state; complete still consumes and validates it atomically.
  async matches(owner: string, session: string, callback: string, now: number): Promise<boolean> {
    await this.requireSession(owner, session, now)
    const url = new URL(callback)
    const state = z.string().regex(/^[a-zA-Z0-9_-]{43}$/u).parse(url.searchParams.get('state'))
    const stateHash = await sha256(state)
    const attempt = await this.db.prepare(`SELECT sealed FROM connection_oauth
      WHERE state_hash=? AND owner=? AND session_hash=? AND provider=? AND expires_at>?`)
      .bind(stateHash, owner, session, this.config.provider, now).first<{ sealed: string }>()
    if (!attempt) return false
    const secret = secretSchema.parse(await this.vault.box.open(JSON.stringify(['oauth-v1', owner, session, stateHash]), attempt.sealed))
    return secret.configHash === await sha256(JSON.stringify(this.config))
  }
  async complete(owner: string, session: string, callback: string, now: number): Promise<{ connectionId: string }> {
    const startedAt = performance.now()
    await this.requireSession(owner, session, now)
    const url = new URL(callback)
    if (url.origin + url.pathname !== this.config.redirectUri || url.hash || url.username || url.password) {
      throw new ApiError('oauth_callback_invalid')
    }
    for (const key of url.searchParams.keys()) {
      if (url.searchParams.getAll(key).length !== 1) throw new ApiError('oauth_callback_invalid')
    }
    const shape = { state: z.string().regex(/^[a-zA-Z0-9_-]{43}$/u), iss: z.literal(this.config.issuer),
      code: z.string().min(1).max(4096).optional(), error: z.string().min(1).max(128).optional() }
    const querySchema = z.object(shape).strict()
    // AIDEV-NOTE: Google omits iss; fixed provider redirect + sealed config/state bind the exchange instead.
    const query = (this.config.callbackPolicy === 'google' ? querySchema.extend({
      iss: z.literal(this.config.issuer).optional(), scope: z.string().max(8192).optional(),
      authuser: z.string().regex(/^\d{1,10}$/u).optional(), hd: z.string().max(253).optional(),
      prompt: z.string().max(128).optional(), error_description: z.string().max(1024).optional(),
    }) : querySchema).parse(Object.fromEntries(url.searchParams))
    if (Boolean(query.code) === Boolean(query.error)) throw new ApiError('oauth_callback_invalid')
    const stateHash = await sha256(query.state)
    // AIDEV-NOTE: Consume before exchange; a lost provider response requires a fresh flow, never a replayed code.
    const attempt = await this.db.prepare(`DELETE FROM connection_oauth
      WHERE state_hash=? AND owner=? AND session_hash=? AND provider=? AND expires_at>? RETURNING sealed`)
      .bind(stateHash, owner, session, this.config.provider, now).first<{ sealed: string }>()
    if (!attempt) throw new ApiError('oauth_state_invalid')
    if (query.error) throw new ApiError('oauth_denied')
    const secret = secretSchema.parse(await this.vault.box.open(JSON.stringify(['oauth-v1', owner, session, stateHash]), attempt.sealed))
    if (secret.configHash !== await sha256(JSON.stringify(this.config))) throw new ApiError('oauth_configuration_changed')
    let exchanged: unknown
    try { exchanged = await this.provider.exchange({ code: query.code!, verifier: secret.verifier,
      redirectUri: this.config.redirectUri, clientId: this.config.clientId }) }
    catch { throw new ApiError('oauth_exchange_failed', 502) }
    const result = resultSchema.parse(exchanged)
    const completedAt = now + Math.ceil(performance.now() - startedAt)
    if (result.credential.expiresAt <= completedAt || this.config.scopes.some(scope => !result.credential.scopes.includes(scope))) {
      throw new ApiError('oauth_grant_insufficient')
    }
    await this.requireSession(owner, session, completedAt)
    const commitSession = { tokenHash: session, now: () => now + Math.ceil(performance.now() - startedAt) }
    if (secret.reconnect) {
      if (secret.reconnect.subject !== result.subject) throw new ApiError('oauth_account_mismatch')
      // AIDEV-NOTE: Google may omit repeat refresh grants; preserve only this unchanged, active account's token.
      if (this.config.callbackPolicy === 'google' && !result.credential.refreshToken) {
        try {
          const previous = await this.vault.read(owner, secret.reconnect.id)
          if (previous.revision !== secret.reconnect.revision || previous.subject !== result.subject || previous.provider !== this.config.provider) {
            throw new ApiError('connection_changed', 409)
          }
          if (!previous.credential.refreshToken) throw new ApiError('oauth_offline_grant_required')
          result.credential.refreshToken = previous.credential.refreshToken
        } catch (error) {
          if (error instanceof ApiError && error.code === 'connection_not_found') throw new ApiError('oauth_offline_grant_required')
          throw error
        }
      }
      await this.vault.reconnect(owner, secret.reconnect.id, secret.reconnect.revision, result.credential, commitSession)
      return { connectionId: secret.reconnect.id }
    }
    if (this.config.callbackPolicy === 'google' && !result.credential.refreshToken) throw new ApiError('oauth_offline_grant_required')
    return { connectionId: await this.vault.create(owner, this.config.provider, result.subject, result.credential, commitSession) }
  }
}
