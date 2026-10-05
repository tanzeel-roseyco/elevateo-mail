import { z } from 'zod'
import { ApiError } from './core'
import { ConnectionOAuth } from './connectionOAuth'
import { base64url, CredentialVault, SecretBox } from './credentialVault'
import { GoogleOAuthProvider } from './providers/googleOAuth'
import { GmailReadProvider } from './providers/gmailRead'
import type { ProviderFetch } from './providers/http'

const issuer = 'https://accounts.google.com'
const authorizationUrl = 'https://accounts.google.com/o/oauth2/v2/auth'
const scopes = ['openid', 'https://www.googleapis.com/auth/gmail.readonly']
const schema = z.object({
  GMAIL_ENABLED: z.literal('true'),
  GMAIL_SENDING_ENABLED: z.enum(['true', 'false']).default('false'),
  GMAIL_CLIENT_ID: z.string().min(1).max(256).regex(/^[\x21-\x7e]+$/u),
  GMAIL_CLIENT_SECRET: z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/u),
  GMAIL_REDIRECT_URI: z.string().url().refine(value => {
    const url = new URL(value)
    return url.protocol === 'https:' && url.pathname === '/connections/gmail/callback' &&
      !url.username && !url.password && !url.search && !url.hash && url.href === value
  }),
  GMAIL_ENCRYPTION_KEY: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
})

export interface GmailRuntime {
  oauth: ConnectionOAuth
  sendOauth?: ConnectionOAuth
  vault: CredentialVault
  provider: GoogleOAuthProvider
  readProvider(accessToken: string, subject: string): GmailReadProvider
  redirectUri: string
}

// AIDEV-NOTE: Explicit OAuth elevation adds send scope, but never enables a mailbox by itself.
export async function createGmailRuntime(db: D1Database, env: unknown, fetcher: ProviderFetch = fetch): Promise<GmailRuntime | undefined> {
  try {
    const flag = z.object({ GMAIL_ENABLED: z.enum(['true', 'false']).optional() }).parse(env)
    if (flag.GMAIL_ENABLED !== 'true') return undefined
    const config = schema.parse(env)
    const raw = Uint8Array.from(atob(config.GMAIL_ENCRYPTION_KEY.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0))
    if (raw.length !== 32 || base64url(raw) !== config.GMAIL_ENCRYPTION_KEY) throw new Error('key')
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
    const vault = new CredentialVault(db, new SecretBox('gmail', new Map([['gmail', key]])))
    const provider = new GoogleOAuthProvider({ clientId: config.GMAIL_CLIENT_ID,
      clientSecret: config.GMAIL_CLIENT_SECRET, redirectUri: config.GMAIL_REDIRECT_URI }, fetcher)
    const oauth = new ConnectionOAuth(db, vault, { provider: 'gmail', issuer, authorizationUrl,
      redirectUri: config.GMAIL_REDIRECT_URI, clientId: config.GMAIL_CLIENT_ID, callbackPolicy: 'google', scopes }, provider)
    const sendOauth = config.GMAIL_SENDING_ENABLED === 'true' ? new ConnectionOAuth(db, vault, {
      provider: 'gmail', issuer, authorizationUrl, redirectUri: config.GMAIL_REDIRECT_URI,
      clientId: config.GMAIL_CLIENT_ID, callbackPolicy: 'google',
      scopes: [...scopes, 'https://www.googleapis.com/auth/gmail.send'] }, provider) : undefined
    return { oauth, sendOauth, vault, provider, redirectUri: config.GMAIL_REDIRECT_URI,
      readProvider: (accessToken, subject) => new GmailReadProvider(accessToken, subject, fetcher) }
  } catch { throw new ApiError('gmail_configuration_invalid', 503) }
}
