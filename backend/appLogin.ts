import { z } from 'zod'
import { ApiError, sha256, sessionCookieName } from './core'
import { base64url, type SecretBox } from './credentialVault'

const https = z.string().url().refine(value => {
  const url = new URL(value)
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
})
const secret = z.string().regex(/^[a-zA-Z0-9_-]{43}$/u)
const configSchema = z.object({ issuer: https, authorizationUrl: https, redirectUri: https,
  clientId: z.string().min(1).max(256), approvedSubjects: z.array(z.string().min(1).max(256)).min(1).max(10),
}).strict()
const attemptSchema = z.object({ verifier: secret, configHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict()
export interface AppIdentityProvider {
  // AIDEV-NOTE: Adapter must verify issuer and subject with its trusted identity endpoint, never browser claims.
  exchange(input: { code: string; verifier: string; redirectUri: string; clientId: string }): Promise<unknown>
}
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)))
const cookie = (name: string, token: string, seconds: number) =>
  `${name}=${token}; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=${seconds}`
export const loginCookieName = '__Host-elevateo_login'

// AIDEV-NOTE: This server-only port issues sessions; HTTP wiring must keep token/cookie results out of JSON/logs.
export class AppLogin {
  private readonly config: z.infer<typeof configSchema>
  constructor(private readonly db: D1Database, private readonly box: SecretBox, config: unknown,
    private readonly provider: AppIdentityProvider, private readonly now: () => number = Date.now) {
    this.config = configSchema.parse(config)
  }
  async begin(): Promise<{ authorizationUrl: string; nonceCookie: string; expiresAt: number }> {
    const state = random(); const nonce = random(); const verifier = random()
    const stateHash = await sha256(state); const nonceHash = await sha256(nonce)
    const expiresAt = this.now() + 600_000
    const sealed = await this.box.seal(JSON.stringify(['app-login-v1', stateHash, nonceHash]), {
      verifier, configHash: await sha256(JSON.stringify(this.config)),
    })
    const admitted = await this.db.batch([
      this.db.prepare('DELETE FROM app_login WHERE expires_at<=?').bind(this.now()),
      this.db.prepare('INSERT INTO app_login(state_hash,nonce_hash,sealed,expires_at) SELECT ?,?,?,? WHERE (SELECT count(*) FROM app_login)<100')
        .bind(stateHash, nonceHash, sealed, expiresAt),
    ])
    if (admitted[1]?.meta.changes !== 1) throw new ApiError('login_busy', 429)
    const url = new URL(this.config.authorizationUrl)
    url.search = new URLSearchParams({ response_type: 'code', scope: 'openid', client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri, state, code_challenge_method: 'S256',
      code_challenge: base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))),
    }).toString()
    return { authorizationUrl: url.href, nonceCookie: cookie(loginCookieName, nonce, 600), expiresAt }
  }
  async complete(callback: string, browserNonce: string): Promise<{
    accountId: string; expiresAt: number; sessionCookie: string; clearNonceCookie: string
  }> {
    secret.parse(browserNonce)
    const url = new URL(z.string().max(16_384).parse(callback))
    if (url.origin + url.pathname !== this.config.redirectUri || url.hash || url.username || url.password) {
      throw new ApiError('login_callback_invalid')
    }
    if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) throw new ApiError('login_callback_invalid')
    const query = z.object({ state: secret, code: z.string().min(1).max(4096).optional(),
      error: z.string().min(1).max(128).optional(), iss: z.literal(this.config.issuer).optional(),
      scope: z.string().max(8192).optional(), authuser: z.string().regex(/^\d{1,10}$/u).optional(),
      hd: z.string().max(253).optional(), prompt: z.string().max(128).optional(),
    }).strict().parse(Object.fromEntries(url.searchParams))
    if (Boolean(query.code) === Boolean(query.error)) throw new ApiError('login_callback_invalid')
    const stateHash = await sha256(query.state); const nonceHash = await sha256(browserNonce)
    // AIDEV-NOTE: Consume before exchange; wrong-browser requests cannot consume another browser's attempt.
    const attempt = await this.db.prepare(`DELETE FROM app_login WHERE state_hash=? AND nonce_hash=? AND expires_at>?
      RETURNING sealed,expires_at`).bind(stateHash, nonceHash, this.now()).first<{ sealed: string; expires_at: number }>()
    if (!attempt) throw new ApiError('login_state_invalid')
    if (query.error) throw new ApiError('login_denied')
    const saved = attemptSchema.parse(await this.box.open(JSON.stringify(['app-login-v1', stateHash, nonceHash]), attempt.sealed))
    if (saved.configHash !== await sha256(JSON.stringify(this.config))) throw new ApiError('login_configuration_changed')
    let raw: unknown
    try { raw = await this.provider.exchange({ code: query.code!, verifier: saved.verifier,
      redirectUri: this.config.redirectUri, clientId: this.config.clientId }) }
    catch { throw new ApiError('login_exchange_failed', 502) }
    const identity = z.object({ issuer: z.literal(this.config.issuer), subject: z.string().min(1).max(256) }).strict().safeParse(raw)
    if (!identity.success) throw new ApiError('login_identity_invalid', 502)
    if (!this.config.approvedSubjects.includes(identity.data.subject)) throw new ApiError('login_not_approved', 403)
    // AIDEV-NOTE: Deterministic issuer+subject owner avoids orphan users under concurrent first sign-in; no email linking.
    const owner = 'oidc_' + await sha256(JSON.stringify([identity.data.issuer, identity.data.subject]))
    const sessionToken = random(); const tokenHash = await sha256(sessionToken)
    const completedAt = this.now()
    if (completedAt >= attempt.expires_at) throw new ApiError('login_state_invalid')
    const expiresAt = completedAt + 86_400_000
    const result = await this.db.batch([
      this.db.prepare('INSERT INTO users(id) SELECT ? WHERE (SELECT count(*) FROM users)<10 ON CONFLICT(id) DO NOTHING').bind(owner),
      this.db.prepare(`INSERT INTO app_identities(issuer,subject,owner) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=?)
        ON CONFLICT(issuer,subject) DO NOTHING`).bind(identity.data.issuer, identity.data.subject, owner, owner),
      this.db.prepare(`INSERT INTO sessions(token_hash,owner,expires_at) SELECT ?,owner,? FROM app_identities
        WHERE issuer=? AND subject=? AND owner=?`).bind(tokenHash, expiresAt, identity.data.issuer, identity.data.subject, owner),
    ])
    if (result[2]?.meta.changes !== 1) throw new ApiError('login_user_limit', 403)
    const account = await this.db.prepare('SELECT account_id FROM accounts WHERE owner=?').bind(owner).first<{ account_id: string }>()
    if (!account) throw new ApiError('login_account_missing', 500)
    return { accountId: account.account_id, expiresAt, sessionCookie: cookie(sessionCookieName, sessionToken, 86_400),
      clearNonceCookie: cookie(loginCookieName, '', 0) }
  }
}
