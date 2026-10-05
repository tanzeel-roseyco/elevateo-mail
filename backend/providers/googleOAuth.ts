import { z } from 'zod'
import { ApiError } from '../core'
import type { ConnectionOAuthProvider } from '../connectionOAuth'
import { credentialSchema, type ProviderCredential } from '../credentialVault'
import { providerRequest, type ProviderFetch } from './http'

const tokenText = z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u)
const configSchema = z.object({ clientId: z.string().min(1).max(256), clientSecret: tokenText,
  redirectUri: z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
  }) }).strict()
export type GoogleOAuthConfig = z.infer<typeof configSchema>
const tokenSchema = z.object({ access_token: tokenText, refresh_token: tokenText.optional(),
  token_type: z.string().refine(value => value.toLowerCase() === 'bearer'),
  expires_in: z.number().int().positive().max(86_400), scope: z.string().min(1).max(8192).optional() })
const exchangeSchema = z.object({ code: z.string().min(1).max(4096),
  verifier: z.string().regex(/^[a-zA-Z0-9_-]{43}$/u), redirectUri: z.string(), clientId: z.string() }).strict()

// AIDEV-NOTE: Fixed Google endpoints and server configuration prevent browser-selected token destinations or clients.
export class GoogleOAuthProvider implements ConnectionOAuthProvider {
  private readonly config: GoogleOAuthConfig
  constructor(config: GoogleOAuthConfig, private readonly fetcher: ProviderFetch = fetch,
    private readonly now: () => number = Date.now) { this.config = configSchema.parse(config) }

  private async token(fields: Record<string, string>, previous?: ProviderCredential): Promise<ProviderCredential> {
    const startedAt = this.now()
    const response = await providerRequest(this.fetcher, 'https://oauth2.googleapis.com/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...fields, client_id: this.config.clientId, client_secret: this.config.clientSecret }).toString(),
    })
    if (response?.status === 400 && z.object({ error: z.literal('invalid_grant') }).safeParse(response.body).success) {
      throw new ApiError('oauth_invalid_grant', 401)
    }
    if (!response || response.status !== 200) throw new ApiError('oauth_provider_unavailable', 502)
    const parsed = tokenSchema.safeParse(response.body)
    if (!parsed.success) throw new ApiError('oauth_response_invalid', 502)
    const token = parsed.data
    // AIDEV-NOTE: Refresh may omit scope/refresh_token; preserve the exact previous grant, never invent new scopes.
    const candidate = credentialSchema.safeParse({ accessToken: token.access_token,
      ...(token.refresh_token ?? previous?.refreshToken ? { refreshToken: token.refresh_token ?? previous?.refreshToken } : {}),
      expiresAt: startedAt + token.expires_in * 1000,
      scopes: token.scope ? [...new Set(token.scope.split(/\s+/u).filter(Boolean))] : previous?.scopes,
    })
    if (!candidate.success || candidate.data.expiresAt <= this.now()) throw new ApiError('oauth_response_invalid', 502)
    return candidate.data
  }

  private async subject(accessToken: string): Promise<string> {
    const response = await providerRequest(this.fetcher, 'https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'GET', headers: { Authorization: `Bearer ${accessToken}` },
    })
    const parsed = z.object({ sub: z.string().min(1).max(256) }).safeParse(response?.body)
    if (response?.status !== 200 || !parsed.success) throw new ApiError('oauth_identity_unavailable', 502)
    return parsed.data.sub
  }

  async exchange(input: { code: string; verifier: string; redirectUri: string; clientId: string }): Promise<{
    subject: string; credential: ProviderCredential
  }> {
    const parsed = exchangeSchema.safeParse(input)
    if (!parsed.success || input.clientId !== this.config.clientId || input.redirectUri !== this.config.redirectUri) {
      throw new ApiError('oauth_configuration_mismatch')
    }
    const credential = await this.token({ grant_type: 'authorization_code', code: input.code,
      code_verifier: input.verifier, redirect_uri: this.config.redirectUri })
    return { subject: await this.subject(credential.accessToken), credential }
  }

  async refresh(previous: ProviderCredential, expectedSubject: string): Promise<ProviderCredential> {
    const parsed = credentialSchema.safeParse(previous)
    if (!parsed.success || !parsed.data.refreshToken || !z.string().min(1).max(256).safeParse(expectedSubject).success) {
      throw new ApiError('oauth_refresh_unavailable', 409)
    }
    const credential = await this.token({ grant_type: 'refresh_token', refresh_token: parsed.data.refreshToken }, parsed.data)
    if (await this.subject(credential.accessToken) !== expectedSubject) throw new ApiError('oauth_account_mismatch', 409)
    if (credential.expiresAt <= this.now()) throw new ApiError('oauth_response_invalid', 502)
    return credential
  }
}
