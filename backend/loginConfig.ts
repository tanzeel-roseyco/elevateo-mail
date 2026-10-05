import { z } from 'zod'
import { AppLogin } from './appLogin'
import { ApiError } from './core'
import { base64url, SecretBox } from './credentialVault'
import { GoogleOAuthProvider } from './providers/googleOAuth'
import type { ProviderFetch } from './providers/http'

const issuer = 'https://accounts.google.com'
const authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
const enabledSchema = z.object({
  APP_LOGIN_ENABLED: z.literal('true'),
  APP_LOGIN_ISSUER: z.literal(issuer),
  APP_LOGIN_AUTHORIZATION_URL: z.literal(authorizationUrl),
  APP_LOGIN_CLIENT_ID: z.string().min(1).max(256),
  APP_LOGIN_CLIENT_SECRET: z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u),
  APP_LOGIN_REDIRECT_URI: z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && url.pathname === '/login/callback' &&
      !url.username && !url.password && !url.search && !url.hash && url.href === value
  }),
  APP_LOGIN_APPROVED_SUBJECTS: z.string().max(4096).transform(value => JSON.parse(value) as unknown)
    .pipe(z.array(z.string().min(1).max(256)).min(1).max(10).refine(values => new Set(values).size === values.length)),
  APP_LOGIN_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
})

// AIDEV-NOTE: Server-only composition; unrelated Worker bindings are ignored, never forwarded to the browser.
export async function createAppLogin(db: D1Database, env: unknown, fetcher: ProviderFetch = fetch): Promise<AppLogin | undefined> {
  try {
    const flag = z.object({ APP_LOGIN_ENABLED: z.enum(['true', 'false']).optional() }).parse(env)
    if (flag.APP_LOGIN_ENABLED !== 'true') return undefined
    const config = enabledSchema.parse(env)
    const raw = Uint8Array.from(atob(config.APP_LOGIN_ENCRYPTION_KEY.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
    if (raw.length !== 32 || base64url(raw) !== config.APP_LOGIN_ENCRYPTION_KEY) throw new Error('key')
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    const provider = new GoogleOAuthProvider({ clientId: config.APP_LOGIN_CLIENT_ID,
      clientSecret: config.APP_LOGIN_CLIENT_SECRET, redirectUri: config.APP_LOGIN_REDIRECT_URI }, fetcher)
    return new AppLogin(db, new SecretBox('app-login', new Map([['app-login', key]])), {
      issuer, authorizationUrl, redirectUri: config.APP_LOGIN_REDIRECT_URI,
      clientId: config.APP_LOGIN_CLIENT_ID, approvedSubjects: config.APP_LOGIN_APPROVED_SUBJECTS,
    }, { exchange: async input => {
      const result = await provider.exchange(input)
      // AIDEV-NOTE: Trust Google's authenticated userinfo subject; never link an app account by email or retain tokens.
      if (result.credential.expiresAt <= Date.now()) throw new Error('expired')
      return { issuer, subject: result.subject }
    } })
  } catch { throw new ApiError('login_configuration_invalid', 503) }
}
